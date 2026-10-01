// Motor and Drive Matcher core (spec 02). Sits between the interface and the
// shared MotorCore model: converts the display-unit state (N·m and its datasheet
// cousins, rpm, mm, kg) to SI, runs the operating point, the ratio solver and
// the electrical extension, rounds the recommended ratio, builds the
// show-the-working steps and the description, and reads and writes the
// drive-request and drive-result files, and the VEX static pull test (spec 02a).
// Pure functions; tested in dev/test.js.
const DriveTool = (function () {
  'use strict';
  const MC = typeof MotorCore !== 'undefined' ? MotorCore : require('./vendor/motor-core.js');
  const isNum = v => typeof v === 'number' && isFinite(v);
  const rad = MC.rpmToRad, rpm = MC.radToRpm;

  // Stall torque units (§4). 1 ozf = 0.27801385 N (1 lbf = 16 ozf); 1 kgf = 9.80665 N.
  const TORQUE_UNITS = {
    'N·m': 1, 'N·cm': 0.01, 'oz·in': 0.27801385 * 0.0254, 'kg·cm': 9.80665 * 0.01,
  };
  const EXAMPLE_MOTOR = { label: 'Example motor (not a real product)', Ts: 2, N0: 300 };

  const SOURCES = {
    mit: 'MIT D.C. motor torque/speed tutorial',
    mitP: 'MIT D.C. motor tutorial, power curve page',
    mct: 'Motion Control Tips, torque equation and DC motors',
    faul: 'Faulhaber, DC motor calculations',
    isl: 'ISL Products, reading DC gear motor performance curves',
    ostx: 'OpenStax University Physics Vol. 1, 10.8',
    vex: 'VEX Library, Understanding V5 Smart Motor (11W) Performance',
    fric: 'OpenStax College Physics 2e, 5.1',
  };

  // VEX V5 Smart Motor (11W) by cartridge (spec 02a §3.1): 2.1 N·m stall with the
  // 36:1 cartridge, scaled by the cartridge ratio; free speed is the software limit.
  const VEX_MOTORS = [
    { id: 'v5red', label: 'VEX V5 Smart Motor (11W), red 36:1', stallTorque: 2.1, noLoadSpeed: 100 },
    { id: 'v5green', label: 'VEX V5 Smart Motor (11W), green 18:1', stallTorque: 1.05, noLoadSpeed: 200 },
    { id: 'v5blue', label: 'VEX V5 Smart Motor (11W), blue 6:1', stallTorque: 0.35, noLoadSpeed: 600 },
  ];
  const isVex = s => /^v5/.test(s.preset);
  // Wheel presets (spec 02a §4), radius in mm. The omni wheel travels 200 mm per turn.
  const WHEELS = {
    t275: { label: '2.75" traction wheel', r: 2.75 * 25.4 / 2 },
    t4: { label: '4" traction wheel', r: 4 * 25.4 / 2 },
    omni200: { label: '200 mm travel omni wheel (64 mm)', r: 200 / (2 * Math.PI) },
    custom: { label: 'Custom radius', r: null },
  };

  const MAX_STAGES = 4, MAX_COMPARE = 2;

  function defaultState() {
    return {
      preset: 'example', label: EXAMPLE_MOTOR.label, Ts: 2, TsUnit: 'N·m', N0: 300, k: 1,
      stages: [{ id: 1, ratio: 3.14, efficiency: 0.90 }], nextId: 2,
      loadType: 'torque', TL: 0.68, F: 22.6, rF: 30, m: 5, rS: 20,
      useTarget: true, Ntarget: 95.5, rounding: '0.01',
      electrical: false, V: 12, I0: 0.2, Is: 10,
      compare: [],
      pull: false, wheel: 't4', rW: 50.8, mass: null, fDrive: 100, mu: null, Fmeas: null,
    };
  }

  const FIELDS = {
    Ts: { name: 'Stall torque', gt: 0 },
    N0: { name: 'No-load speed', unit: 'rpm', min: 1, max: 50000 },
    k: { name: 'Motors in parallel', min: 1, max: 4, integer: true },
    ratio: { name: 'Stage ratio', min: 0.1, max: 100 },
    eff: { name: 'Stage efficiency', min: 0.3, max: 1 },
    TL: { name: 'Load torque', unit: 'N·m', min: 0, max: 5000 },
    F: { name: 'Force', unit: 'N', min: 0, max: 100000 },
    r: { name: 'Radius', unit: 'mm', gt: 0, max: 5000 },
    m: { name: 'Mass', unit: 'kg', min: 0, max: 10000 },
    Nt: { name: 'Target output speed', unit: 'rpm', min: 0.1, max: 50000 },
    V: { name: 'Voltage', unit: 'V', gt: 0, max: 1000 },
    I0: { name: 'No-load current', unit: 'A', min: 0, max: 1000 },
    Is: { name: 'Stall current', unit: 'A', gt: 0, max: 5000 },
    rW: { name: 'Wheel radius', unit: 'mm', min: 5, max: 200 },
    mass: { name: 'Vehicle mass', unit: 'kg', min: 0.1, max: 100 },
    fDrive: { name: 'Weight on driven wheels', unit: '%', min: 1, max: 100 },
    mu: { name: 'Coefficient of friction', min: 0, max: 2 },
    Fmeas: { name: 'Measured pull', unit: 'N', min: 0, max: 2000 },
  };
  // Stall torque range 0.001 to 500 N·m, checked in the unit the student chose.
  function tsCheck(v, unit) {
    const nm = v * TORQUE_UNITS[unit];
    if (!(nm >= 0.001 && nm <= 500)) return 'Stall torque must be between 0.001 and 500 N·m (' + fmtPlain(0.001 / TORQUE_UNITS[unit]) + ' to ' + fmtPlain(500 / TORQUE_UNITS[unit]) + ' ' + unit + ').';
    return null;
  }
  const fmtPlain = v => String(Number(v.toPrecision(3)));

  const TsNm = s => s.Ts * TORQUE_UNITS[s.TsUnit];
  // Switch the stall torque unit, keeping the physical values (also for compared motors).
  function convertTs(s, unit) {
    const k = TORQUE_UNITS[s.TsUnit] / TORQUE_UNITS[unit];
    s.Ts = Number((s.Ts * k).toPrecision(10));
    (s.compare || []).forEach(c => { c.Ts = Number((c.Ts * k).toPrecision(10)); });
    s.TsUnit = unit;
  }

  // Load torque at the output, N·m; radius in m for linear speed.
  function load(s) {
    if (s.loadType === 'force') return { TL: MC.loadTorque({ type: 'force', F: s.F, r: s.rF / 1000 }), r: s.rF / 1000 };
    if (s.loadType === 'lift') return { TL: MC.loadTorque({ type: 'lift', m: s.m, r: s.rS / 1000 }), r: s.rS / 1000 };
    return { TL: s.TL, r: null };
  }
  // Set whichever load variable the student is using so the load torque becomes TL (plot dragging).
  function setLoadTorque(s, TL) {
    TL = Math.max(0, TL);
    if (s.loadType === 'force') s.F = round4(TL / (s.rF / 1000));
    else if (s.loadType === 'lift') s.m = round4(TL / (MC.G * s.rS / 1000));
    else s.TL = round4(TL);
  }
  const round4 = v => Number(v.toPrecision(4));

  // Round a recommended ratio to the chosen precision (§3.3).
  function roundRatio(i, mode) {
    if (!isNum(i)) return null;
    if (mode === 'exact') return { ratio: i, text: 'exact' };
    if (mode === 'pair') { const p = MC.nearestPair(i); return p ? { ratio: p.ratio, text: p.z2 + ':' + p.z1 + ' gear pair', pair: p } : { ratio: i, text: 'exact (no pair between 10 and 100 teeth)' }; }
    const step = Number(mode) || 0.01;
    return { ratio: Math.round(i / step) * step, text: 'nearest ' + mode };
  }

  function solve(s, bands) {
    const Ts = TsNm(s), w0 = rad(s.N0), g = MC.gearing(s.stages), L = load(s);
    const base = { Ts, w0, k: s.k, i: g.i, eta: g.eta, TL: L.TL, r: L.r, bands };
    const op = MC.operate(base);
    const out = {
      state: s, Ts, TsTotal: s.k * Ts, g, TL: L.TL, r: L.r, op, bands: bands || MC.DEFAULT_BANDS,
      Nm: rpm(op.wm), Nout: rpm(op.wout), v: op.v, Pmax: op.motor.Pmax, TatPmax: op.motor.TatPmax, NatPmax: s.N0 / 2,
    };
    if (s.useTarget) {
      const sv = MC.solveRatio({ Ts, w0, k: s.k, eta: g.eta, TL: L.TL, wTarget: rad(s.Ntarget) });
      out.solver = sv;
      if (sv.feasible) {
        const rr = roundRatio(sv.iHigh, s.rounding);
        const at = MC.operate(Object.assign({}, base, { i: rr.ratio }));
        out.rounded = Object.assign(rr, { op: at, Nout: rpm(at.wout), err: (rpm(at.wout) - s.Ntarget) / s.Ntarget * 100 });
      }
    }
    if (s.pull) out.pull = pullTest(s, out.TsTotal, g);
    if (s.electrical) out.elec = MC.electrical({ V: s.V, I0: s.I0, Is: s.Is, Ts, k: s.k, Tm: op.Tm, wm: op.wm });
    out.compare = (s.compare || []).map(c => {
      const o = MC.operate({ Ts: c.Ts * TORQUE_UNITS[s.TsUnit], w0: rad(c.N0), k: 1, i: g.i, eta: g.eta, TL: L.TL, bands });
      return { c, op: o, Nout: rpm(o.wout), Nm: rpm(o.wm), Ts: c.Ts * TORQUE_UNITS[s.TsUnit] };
    });
    return out;
  }

  /* ------------------------------------------------------------ VEX static pull (spec 02a §3) */
  // Motor-limited pull k·Ts·i·η/r, traction-limited pull μ·f·m·g, the smaller of the two,
  // the crossover ratio and the mass that would make the motors the limit.
  const wheelR = s => (s.wheel === 'custom' || !WHEELS[s.wheel] ? s.rW : WHEELS[s.wheel].r) / 1000;
  function pullTest(s, TsTotal, g) {
    const r = wheelR(s);
    const out = { r, Fmotor: TsTotal * g.i * g.eta / r, slope: TsTotal * g.eta / r, traction: isNum(s.mass) && isNum(s.mu) };
    if (out.traction) {
      const f = s.fDrive / 100;
      out.N = f * s.mass * MC.G;
      out.Ftraction = s.mu * out.N;
      out.F = Math.min(out.Fmotor, out.Ftraction);
      out.limit = Math.abs(out.Fmotor - out.Ftraction) <= 0.01 * Math.max(out.Fmotor, out.Ftraction) ? 'both' : out.Fmotor < out.Ftraction ? 'motor' : 'traction';
      out.iStar = out.Ftraction / out.slope;
      out.mStar = s.mu > 0 ? out.Fmotor / (s.mu * f * MC.G) : null;
    } else { out.F = out.Fmotor; out.limit = 'motor-only'; }
    if (isNum(s.Fmeas)) out.measPct = out.F > 0 ? (s.Fmeas - out.F) / out.F * 100 : null;
    return out;
  }
  const LIMIT_TEXT = { motor: 'Motors stall first', traction: 'Wheels slip first', both: 'Both, balanced', 'motor-only': 'Motors (traction not entered)' };

  const BAND_TEXT = { continuous: 'Continuous', short: 'Short periods only', avoid: 'Avoid', stalled: 'Stalled' };

  // Predict-first targets (§6): N_out, T_m as % of stall, recommended ratio.
  function targets(sol) {
    const s = sol.state;
    const sv = sol.solver;
    return [
      { key: 'Nout', quantity: 'output speed N_out', label: 'Output speed N<sub>out</sub>', unit: 'rpm', model: sol.Nout },
      { key: 'pct', quantity: 'motor torque % of stall', label: 'T<sub>m</sub> as % of stall', unit: '%', model: sol.op.pct },
      { key: 'ratio', quantity: 'recommended ratio i', label: 'Recommended ratio i', unit: '', model: sv && sv.feasible ? sv.iHigh : null, reason: !s.useTarget ? 'no target speed set' : 'this motor cannot reach that speed at that load' },
    ].concat(sol.pull ? [{ key: 'pull', quantity: 'maximum static pull F', label: 'Maximum pull F', unit: 'N', model: sol.pull.F }] : []);
  }

  function snapshot(s) {
    const L = load(s);
    return {
      values: {
        stallTorque: TsNm(s), noLoadSpeed: rad(s.N0), motors: s.k,
        stages: s.stages.map(x => ({ ratio: x.ratio, efficiency: x.efficiency })),
        loadType: s.loadType, loadTorque: L.TL, radius: L.r, targetSpeed: s.useTarget ? rad(s.Ntarget) : null,
      },
      ...(s.pull ? { pull: { wheelRadius: wheelR(s), vehicleMass: s.mass, drivenFraction: s.fDrive / 100, mu: s.mu } } : {}),
      units: { stallTorque: 'N·m', noLoadSpeed: 'rad/s', loadTorque: 'N·m', radius: 'm', targetSpeed: 'rad/s' },
    };
  }

  /* ------------------------------------------------------------ show the working */
  function working(sol, f, fu) {
    const s = sol.state, steps = [], op = sol.op;
    if (s.loadType === 'force') steps.push({ title: 'Load torque from a force at a radius', formula: 'T<sub>L</sub> = F · r', sub: fu(s.F, 'N') + ' × ' + fu(s.rF / 1000, 'm'), result: fu(sol.TL, 'N·m'), source: SOURCES.ostx });
    if (s.loadType === 'lift') steps.push({ title: 'Load torque to lift a mass on a spool', formula: 'T<sub>L</sub> = m g r', sub: fu(s.m, 'kg') + ' × 9.81 m/s² × ' + fu(s.rS / 1000, 'm'), result: fu(sol.TL, 'N·m'), source: SOURCES.ostx });
    if (s.stages.length > 1) steps.push({ title: 'Overall ratio and efficiency', formula: 'i = Π i<sub>stage</sub>, η = Π η<sub>stage</sub>', sub: 'i = ' + s.stages.map(x => f(x.ratio)).join(' × ') + ', η = ' + s.stages.map(x => f(x.efficiency)).join(' × '), result: 'i = ' + f(sol.g.i) + ', η = ' + f(sol.g.eta) });
    if (s.k > 1) steps.push({ title: 'Motors in parallel', formula: 'T<sub>s,total</sub> = k · T<sub>s</sub>', sub: s.k + ' × ' + fu(sol.Ts, 'N·m'), result: fu(sol.TsTotal, 'N·m') + ' (same no-load speed)', source: SOURCES.mit });
    steps.push({ title: 'Torque the motor must supply', formula: 'T<sub>m</sub> = T<sub>L</sub> / (i η)', sub: fu(sol.TL, 'N·m') + ' / (' + f(sol.g.i) + ' × ' + f(sol.g.eta) + ')', result: fu(op.Tm, 'N·m'), source: SOURCES.mct });
    steps.push({ title: 'Percent of stall', formula: 'T<sub>m</sub> / T<sub>s</sub> × 100', sub: fu(op.Tm, 'N·m') + ' / ' + fu(sol.TsTotal, 'N·m') + ' × 100', result: (f(op.pct) + '%') + ', ' + BAND_TEXT[op.band].toLowerCase() + (op.band === 'stalled' ? '' : ' duty'), source: SOURCES.isl });
    if (op.stalled) steps.push({ title: 'Motor speed', formula: 'T<sub>m</sub> ≥ T<sub>s</sub>, so the motor stalls', result: 'N<sub>m</sub> = 0 rpm, N<sub>out</sub> = 0 rpm', source: SOURCES.mit });
    else {
      steps.push({ title: 'Motor speed on its torque-speed line', formula: 'N<sub>m</sub> = N<sub>0</sub> (1 − T<sub>m</sub> / T<sub>s</sub>)', sub: fu(s.N0, 'rpm') + ' × (1 − ' + fu(op.Tm, 'N·m') + ' / ' + fu(sol.TsTotal, 'N·m') + ')', result: fu(sol.Nm, 'rpm'), source: SOURCES.mit });
      steps.push({ title: 'Output speed', formula: 'N<sub>out</sub> = N<sub>m</sub> / i', sub: fu(sol.Nm, 'rpm') + ' / ' + f(sol.g.i), result: fu(sol.Nout, 'rpm'), source: SOURCES.mct });
      if (isNum(sol.v)) steps.push({ title: 'Linear speed at the ' + (s.loadType === 'lift' ? 'spool' : 'wheel'), formula: 'v = ω<sub>out</sub> r, ω = 2πN/60', sub: fu(op.wout, 'rad/s') + ' × ' + fu(sol.r, 'm'), result: fu(sol.v, 'm/s'), source: SOURCES.ostx });
    }
    steps.push({ title: 'Output power', formula: 'P<sub>out</sub> = T<sub>L</sub> ω<sub>out</sub>', sub: fu(sol.TL, 'N·m') + ' × ' + fu(op.wout, 'rad/s'), result: fu(op.Pout, 'W'), source: SOURCES.ostx });
    steps.push({ title: 'Peak mechanical power', formula: 'P<sub>max</sub> = T<sub>s</sub> ω<sub>0</sub> / 4, at T<sub>s</sub>/2 and N<sub>0</sub>/2', sub: fu(sol.TsTotal, 'N·m') + ' × ' + fu(rad(s.N0), 'rad/s') + ' / 4', result: fu(sol.Pmax, 'W') + ' at ' + fu(sol.TatPmax, 'N·m') + ' and ' + fu(sol.NatPmax, 'rpm'), source: SOURCES.mitP });
    if (sol.solver) {
      const sv = sol.solver;
      const c = s.N0 * sol.TL / (sol.g.eta * sol.TsTotal);
      steps.push({ title: 'Ratio for the target speed under load', formula: 'N<sub>out</sub> i² − N<sub>0</sub> i + N<sub>0</sub> T<sub>L</sub> / (η T<sub>s</sub>) = 0', sub: f(s.Ntarget) + ' i² − ' + f(s.N0) + ' i + ' + f(s.N0) + ' × ' + f(sol.TL) + ' / (' + f(sol.g.eta) + ' × ' + f(sol.TsTotal) + ') = 0, that is ' + f(s.Ntarget) + ' i² − ' + f(s.N0) + ' i + ' + f(c) + ' = 0', source: SOURCES.mit });
      steps.push({ title: 'Discriminant', formula: 'D = N<sub>0</sub>² − 4 N<sub>out</sub> N<sub>0</sub> T<sub>L</sub> / (η T<sub>s</sub>)', sub: f(s.N0) + '² − 4 × ' + f(s.Ntarget) + ' × ' + f(c), result: f(rpm(rpm(sv.D))) + (sv.D < 0 ? ' < 0: no ratio can reach the target' : '') });
      if (sv.feasible) {
        steps.push({ title: 'Both roots', formula: 'i = (N<sub>0</sub> ± √D) / (2 N<sub>out</sub>)', sub: '(' + f(s.N0) + ' ± ' + f(rpm(Math.sqrt(sv.D))) + ') / (2 × ' + f(s.Ntarget) + ')', result: 'i<sub>high</sub> = ' + f(sv.iHigh) + ' (' + (f(sv.pctHigh) + '% of stall') + ')' + (sv.iLow ? ', i<sub>low</sub> = ' + f(sv.iLow) + ' (' + (f(sv.pctLow) + '% of stall') + ')' : '') });
        if (sol.rounded) steps.push({ title: 'Rounded ratio (' + sol.rounded.text + ')', formula: 'N<sub>out</sub> at the rounded ratio, from the same motor line', result: 'i = ' + f(sol.rounded.ratio) + ' gives ' + fu(sol.rounded.Nout, 'rpm') + ', ' + (sol.rounded.err >= 0 ? '+' : '') + (f(sol.rounded.err) + '%') + ' from the target' });
      }
    }
    if (sol.pull) {
      const pu = sol.pull;
      steps.push({ title: 'Pull when the motors stall', formula: 'F<sub>motor</sub> = k T<sub>s</sub> i η / r', sub: fu(sol.TsTotal, 'N·m') + ' × ' + f(sol.g.i) + ' × ' + f(sol.g.eta) + ' / ' + fu(pu.r, 'm'), result: fu(pu.Fmotor, 'N'), source: SOURCES.ostx });
      if (pu.traction) {
        steps.push({ title: 'Pull when the wheels slip', formula: 'F<sub>traction</sub> = μ f m g', sub: f(s.mu) + ' × ' + f(s.fDrive / 100) + ' × ' + fu(s.mass, 'kg') + ' × 9.81 m/s²', result: fu(pu.Ftraction, 'N'), source: SOURCES.fric });
        steps.push({ title: 'Predicted pull', formula: 'F = min(F<sub>motor</sub>, F<sub>traction</sub>)', sub: 'min(' + fu(pu.Fmotor, 'N') + ', ' + fu(pu.Ftraction, 'N') + ')', result: fu(pu.F, 'N') + ', ' + LIMIT_TEXT[pu.limit].toLowerCase() });
        steps.push({ title: 'Crossover ratio', formula: 'i* = μ f m g r / (k T<sub>s</sub> η)', sub: fu(pu.Ftraction, 'N') + ' × ' + fu(pu.r, 'm') + ' / (' + fu(sol.TsTotal, 'N·m') + ' × ' + f(sol.g.eta) + ')', result: f(pu.iStar) + '. Above this ratio, more gearing adds no pull.' });
        steps.push({ title: 'Mass for the motors to be the limit at this ratio', formula: 'm* = F<sub>motor</sub> / (μ f g)', sub: pu.mStar === null ? '' : fu(pu.Fmotor, 'N') + ' / (' + f(s.mu) + ' × ' + f(s.fDrive / 100) + ' × 9.81 m/s²)', result: pu.mStar === null ? 'not defined: friction is zero' : fu(pu.mStar, 'kg'), source: SOURCES.fric });
      }
    }
    if (sol.elec) {
      const e = sol.elec;
      steps.push({ title: 'Current', formula: 'I = I<sub>0</sub> + (I<sub>s</sub> − I<sub>0</sub>) T<sub>m</sub> / T<sub>s</sub>' + (s.k > 1 ? ', per motor, × k motors' : ''), sub: fu(s.I0, 'A') + ' + (' + fu(s.Is, 'A') + ' − ' + fu(s.I0, 'A') + ') × ' + fu(op.Tm / s.k, 'N·m') + ' / ' + fu(sol.Ts, 'N·m'), result: fu(e.I, 'A'), source: SOURCES.faul });
      steps.push({ title: 'Electrical power in', formula: 'P<sub>in</sub> = V I', sub: fu(s.V, 'V') + ' × ' + fu(e.I, 'A'), result: fu(e.Pin, 'W'), source: SOURCES.faul });
      steps.push({ title: 'Motor efficiency', formula: 'η<sub>motor</sub> = P<sub>mech</sub> / P<sub>in</sub>, P<sub>mech</sub> = T<sub>m</sub> ω<sub>m</sub>', sub: fu(e.Pmech, 'W') + ' / ' + fu(e.Pin, 'W'), result: e.eff === null ? 'not defined: no power in' : (f(e.eff * 100) + '%'), source: SOURCES.faul });
    }
    return steps;
  }

  function describe(sol, fu, masked) {
    const s = sol.state;
    let t = 'Motor torque-speed plot. ' + s.label + ': stall torque ' + fu(sol.TsTotal, 'newton meters') + (s.k > 1 ? ' for ' + s.k + ' motors' : '') + ', no-load speed ' + fu(s.N0, 'rpm') + '. Gear ratio ' + fu(sol.g.i, '') + ', efficiency ' + fu(sol.g.eta, '') + '. Load ' + fu(sol.TL, 'newton meters') + ' at the output.';
    if (masked) return t + ' The operating point is hidden until you check your prediction.';
    const op = sol.op;
    if (op.stalled) t += ' The motor stalls: it would need ' + fu(op.Tm, 'newton meters') + '.';
    else t += ' Operating point: motor torque ' + fu(op.Tm, 'newton meters') + ', ' + fu(op.pct, 'percent') + ' of stall, ' + BAND_TEXT[op.band].toLowerCase() + ' duty; motor speed ' + fu(sol.Nm, 'rpm') + ', output ' + fu(sol.Nout, 'rpm') + '.';
    if (sol.solver && sol.solver.feasible) t += ' Recommended ratio ' + fu(sol.solver.iHigh, '') + '.';
    if (sol.solver && !sol.solver.feasible) t += ' No ratio reaches the target speed.';
    if (sol.pull) t += ' Pull test: ' + fu(sol.pull.F, 'newtons') + ', ' + LIMIT_TEXT[sol.pull.limit].toLowerCase() + '.';
    return t.replace(/ \./g, '.').replace(/ ,/g, ',');
  }

  /* ------------------------------------------------------------ files (§5.5) */
  function applyDriveRequest(s, req) {
    const v = req.value, notes = [];
    s.loadType = 'torque'; s.TL = v.loadTorque;
    if (isNum(v.targetSpeed)) { s.useTarget = true; s.Ntarget = v.targetSpeed; }
    if (v.stages) { s.stages = v.stages.slice(0, MAX_STAGES).map(x => ({ id: s.nextId++, ratio: x.ratio, efficiency: x.efficiency })); if (v.stages.length > MAX_STAGES) notes.push('Only the first ' + MAX_STAGES + ' stages were loaded.'); }
    if (v.motor) {
      s.preset = 'custom'; s.label = v.motor.label || 'Motor from ' + v.source;
      s.TsUnit = 'N·m'; s.Ts = v.motor.stallTorque; s.N0 = v.motor.noLoadSpeed; s.k = Math.min(4, Math.max(1, Math.round(v.motor.count || 1)));
    }
    return notes;
  }
  function driveResult(sol) {
    const s = sol.state, op = sol.op, sv = sol.solver;
    return {
      motor: { label: s.label, stallTorque: sol.Ts, noLoadSpeed: s.N0, count: s.k },
      stages: s.stages.map(x => ({ ratio: x.ratio, efficiency: x.efficiency })),
      ratio: sol.g.i, efficiency: sol.g.eta, loadTorque: sol.TL, targetSpeed: s.useTarget ? s.Ntarget : null,
      ratioRoots: sv && sv.feasible ? { high: sv.iHigh, low: sv.iLow } : null,
      operatingPoint: { motorTorque: op.Tm, motorSpeed: sol.Nm, pctStall: op.pct, outputSpeed: sol.Nout, outputTorque: sol.TL, stalled: op.stalled },
      dutyBand: op.band,
    };
  }

  // Validate a teacher's motor list (settings, JSON). Returns { list } or { error }.
  function readMotorList(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'The motor list is not valid JSON: ' + e.message }; }
    if (!Array.isArray(data)) return { error: 'The motor list must be a JSON array of motors.' };
    const list = [];
    for (let i = 0; i < data.length; i++) {
      const m = data[i] || {};
      const Ts = Number(m.stallTorque), N0 = Number(m.noLoadSpeed);
      if (!m.label || !(Ts >= 0.001 && Ts <= 500) || !(N0 >= 1 && N0 <= 50000)) return { error: 'Motor ' + (i + 1) + ' needs a label, stallTorque in N·m (0.001 to 500) and noLoadSpeed in rpm (1 to 50,000).' };
      list.push({ label: String(m.label).slice(0, 60), stallTorque: Ts, noLoadSpeed: N0 });
    }
    return { list };
  }
  const DEFAULT_MOTORS = [{ label: EXAMPLE_MOTOR.label, stallTorque: 2, noLoadSpeed: 300 }];

  return {
    TORQUE_UNITS, EXAMPLE_MOTOR, SOURCES, MAX_STAGES, MAX_COMPARE, FIELDS, BAND_TEXT, DEFAULT_MOTORS,
    VEX_MOTORS, WHEELS, LIMIT_TEXT, isVex, wheelR, pullTest,
    defaultState, tsCheck, TsNm, convertTs, load, setLoadTorque, roundRatio, solve, targets, snapshot,
    working, describe, applyDriveRequest, driveResult, readMotorList,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DriveTool;
