// Motor and Drive Matcher: every test case in spec 02 §7 (MD-1 to MD-11) and
// spec 02a §6 (VP-1 to VP-9), run
// through the tool core in display units exactly as the interface uses it.
// Run: node dev/test.js
'use strict';
const DriveTool = require('./core.js');
const Schemas = require('./vendor/schemas.js');
const Shell = require('./vendor/shell.js');
const PredictionLog = require('./vendor/prediction-log.js');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + detail : '')); }
}
function near(name, got, exp) {
  const good = typeof got === 'number' && isFinite(got) &&
    (Math.abs(exp) < 1 ? Math.abs(got - exp) <= 0.01 : Math.abs(got - exp) / Math.abs(exp) <= 0.005);
  ok(name, good, 'got ' + got + ', expected ' + exp);
}
const st = o => Object.assign(DriveTool.defaultState(), o);
const solve = o => DriveTool.solve(st(o));
const f = v => Shell.util.fmtSig(v, 3), fu = (v, u) => f(v) + (u ? ' ' + u : '');

console.log('MD-1: default state');
const s1 = solve({ useTarget: false });
near('MD-1 T_m', s1.op.Tm, 0.241); near('MD-1 % of stall', s1.op.pct, 12.0);
near('MD-1 N_m', s1.Nm, 264); near('MD-1 N_out', s1.Nout, 84.0); near('MD-1 P_out', s1.op.Pout, 5.99);
ok('MD-1 band continuous', s1.op.band === 'continuous');

console.log('MD-2: ratio solver');
const s2 = solve({});
near('MD-2 i_high', s2.solver.iHigh, 2.70); near('MD-2 i_low', s2.solver.iLow, 0.439);
near('MD-2 i_low at 86.0% of stall (flagged)', s2.solver.pctLow, 86.0);
ok('MD-2 rounded to 0.01 gives 2.70', Math.abs(s2.rounded.ratio - 2.70) < 1e-9);
near('MD-2 N_out at 2.70', s2.rounded.Nout, 95.5);
near('MD-2 % of stall at the recommended ratio', s2.solver.pctHigh, 13.98);
ok('MD-2 speed error after rounding is small', Math.abs(s2.rounded.err) < 0.1, String(s2.rounded.err));

console.log('MD-3: stall');
const s3 = solve({ TL: 6 });
near('MD-3 T_m', s3.op.Tm, 2.12);
ok('MD-3 stalled, N_out = 0', s3.op.stalled && s3.Nout === 0);
ok('MD-3 described as stalled', DriveTool.describe(s3, fu, false).includes('stalls'));

console.log('MD-4: peak power');
near('MD-4 P_max', s1.Pmax, 15.7); near('MD-4 at torque', s1.TatPmax, 1.00); near('MD-4 at speed', s1.NatPmax, 150);

console.log('MD-5: electrical extension');
const s5 = solve({ useTarget: false, stages: [{ id: 1, ratio: 1, efficiency: 1 }], TL: 0.5, electrical: true, V: 12, I0: 0.2, Is: 10 });
near('MD-5 I', s5.elec.I, 2.65); near('MD-5 N_m', s5.Nm, 225); near('MD-5 P_mech', s5.elec.Pmech, 11.8);
near('MD-5 P_in', s5.elec.Pin, 31.8); near('MD-5 η_motor %', s5.elec.eff * 100, 37.0);

console.log('MD-6: cannot deliver');
const s6 = solve({ TL: 2, Ntarget: 200 });
ok('MD-6 D < 0 and no ratio', s6.solver.D < 0 && !s6.solver.feasible && !s6.rounded);
ok('MD-6 predict target says why', DriveTool.targets(s6)[2].model === null && /cannot reach/.test(DriveTool.targets(s6)[2].reason));

console.log('MD-7: lift load');
near('MD-7 T_L', solve({ loadType: 'lift', m: 5, rS: 20 }).TL, 0.981);
const lift = solve({ loadType: 'lift', m: 5, rS: 20, useTarget: false });
near('lift speed v = ω_out r', lift.v, lift.op.wout * 0.020);

console.log('MD-8: two motors');
const s8 = solve({ k: 2, useTarget: false });
near('MD-8 combined stall', s8.TsTotal, 4); near('MD-8 T_m', s8.op.Tm, 0.241); near('MD-8 % of combined stall', s8.op.pct, 6.0);
near('MD-8 N_m', s8.Nm, 282); near('MD-8 N_out', s8.Nout, 89.8);

console.log('MD-9: two stages');
const s9 = solve({ stages: [{ id: 1, ratio: 3, efficiency: 0.95 }, { id: 2, ratio: 4, efficiency: 0.95 }] });
near('MD-9 i', s9.g.i, 12); near('MD-9 η', s9.g.eta, 0.9025);

console.log('MD-10: unit switch');
const s10 = solve({ Ts: 200, TsUnit: 'N·cm' });
ok('MD-10 200 N·cm gives identical results', ['Tm', 'pct', 'wm', 'wout', 'Pout'].every(k => Math.abs(s10.op[k] - s2.op[k]) < 1e-12) && Math.abs(s10.solver.iHigh - s2.solver.iHigh) < 1e-12);
const conv = st({}); DriveTool.convertTs(conv, 'oz·in');
near('switching the unit converts the value (2 N·m in oz·in)', conv.Ts, 283.2);
DriveTool.convertTs(conv, 'kg·cm'); near('and in kg·cm', conv.Ts, 20.39);
DriveTool.convertTs(conv, 'N·m'); near('and back to N·m', conv.Ts, 2);
const cc = st({ compare: [{ id: 5, label: 'B', Ts: 1, N0: 600 }] }); DriveTool.convertTs(cc, 'N·cm');
ok('compared motors convert too', cc.compare[0].Ts === 100 && cc.Ts === 200);
ok('stall torque range message in the chosen unit', DriveTool.tsCheck(0.0001, 'N·m') === 'Stall torque must be between 0.001 and 500 N·m (0.001 to 500 N·m).');

console.log('MD-11: no load');
const s11 = solve({ TL: 0 });
near('MD-11 N_m = N₀', s11.Nm, 300); ok('MD-11 P_out = 0', s11.op.Pout === 0);
ok('MD-11 no NaN or Infinity anywhere', !/NaN|Infinity/.test(JSON.stringify(s11) + DriveTool.working(s11, f, fu).map(x => x.sub + x.result).join('') + DriveTool.describe(s11, fu, false)));

console.log('VP-1 to VP-9: VEX static pull test (spec 02a)');
{
  const V = id => DriveTool.VEX_MOTORS.find(m => m.id === id);
  ok('VP-1 cartridges: red 2.1 N·m / 100 rpm, green 1.05 / 200, blue 0.35 / 600',
    V('v5red').stallTorque === 2.1 && V('v5red').noLoadSpeed === 100 && V('v5green').stallTorque === 1.05 && V('v5green').noLoadSpeed === 200 && V('v5blue').stallTorque === 0.35 && V('v5blue').noLoadSpeed === 600);
  const vex = o => solve(Object.assign({ preset: 'v5green', Ts: 1.05, N0: 200, k: 2, useTarget: false, pull: true }, o));
  const one = (ratio, efficiency) => [{ id: 1, ratio, efficiency }];
  near('VP-2 4" traction, i = 1, η = 1: F_motor', vex({ wheel: 't4', stages: one(1, 1) }).pull.Fmotor, 41.3);
  ok('VP-2 no traction inputs: motor-only', vex({ wheel: 't4', stages: one(1, 1) }).pull.limit === 'motor-only');
  const vp3 = { wheel: 't275', stages: one(3, 0.9), mass: 5, fDrive: 100, mu: 0.9 };
  const p3 = vex(vp3).pull;
  near('VP-3 F_motor', p3.Fmotor, 162); near('VP-3 F_traction', p3.Ftraction, 44.1); near('VP-3 F', p3.F, 44.1);
  ok('VP-3 traction limits', p3.limit === 'traction');
  near('VP-3 i*', p3.iStar, 0.816); near('VP-3 m*', p3.mStar, 18.4);
  const p4 = vex(Object.assign({}, vp3, { fDrive: 60 })).pull;
  near('VP-4 F_traction', p4.Ftraction, 26.5); near('VP-4 i*', p4.iStar, 0.489);
  const p5 = vex({ wheel: 't4', stages: one(5, 0.81), mass: 8, fDrive: 100, mu: 0.9 }).pull;
  near('VP-5 F_motor', p5.Fmotor, 167); near('VP-5 F_traction', p5.Ftraction, 70.6); ok('VP-5 traction limits', p5.limit === 'traction');
  near('VP-6 200 mm omni: F_motor', vex({ wheel: 'omni200', stages: one(1, 1) }).pull.Fmotor, 66.0);
  const s7 = vex(Object.assign({}, vp3, { mu: 0 })), p7 = s7.pull;
  ok('VP-7 μ = 0: F_traction = 0, F = 0, traction limits, i* = 0, m* not defined', p7.Ftraction === 0 && p7.F === 0 && p7.limit === 'traction' && p7.iStar === 0 && p7.mStar === null);
  ok('VP-7 no NaN or Infinity, m* explained', !/NaN|Infinity/.test(JSON.stringify(s7) + DriveTool.working(s7, f, fu).map(x => x.sub + x.result).join('') + DriveTool.describe(s7, fu, false)) && DriveTool.working(s7, f, fu).some(x => x.result === 'not defined: friction is zero'));
  near('VP-8 measured 40 N against 44.1 N: −9.39%', vex(Object.assign({}, vp3, { Fmeas: 40 })).pull.measPct, -9.39);
  const p9 = vex(Object.assign({}, vp3, { mass: null })).pull;
  ok('VP-9 mass blank: motor-limited pull only', p9.limit === 'motor-only' && Math.abs(p9.F - 162.35) < 0.01 && p9.Ftraction === undefined);
  ok('balanced within 1%', vex({ wheel: 't4', stages: one(1, 1), mass: 41.34 / (0.9 * 9.81), mu: 0.9 }).pull.limit === 'both');
  ok('custom wheel radius', Math.abs(vex({ wheel: 'custom', rW: 100, stages: one(1, 1) }).pull.Fmotor - 21) < 1e-9);
  const s3 = vex(vp3);
  ok('pull is a predict-first target', DriveTool.targets(s3).some(t => t.key === 'pull' && Math.abs(t.model - p3.F) < 1e-9));
  ok('the pull target carries the measured pull for the log', DriveTool.targets(vex(Object.assign({}, vp3, { Fmeas: 40 }))).find(t => t.key === 'pull').measured === 40 && DriveTool.targets(s3).find(t => t.key === 'pull').measured === null);
  ok('no pull target when the pull test is off', !DriveTool.targets(solve({})).some(t => t.key === 'pull'));
  const wt = DriveTool.working(s3, f, fu).map(x => x.title);
  ok('working covers both limits, the minimum, i* and m*', ['Pull when the motors stall', 'Pull when the wheels slip', 'Predicted pull', 'Crossover ratio', 'Mass for the motors'].every(n => wt.some(t => t.startsWith(n))), wt.join(' | '));
  ok('older state without pull fields still solves', !solve({}).pull && DriveTool.defaultState().pull === false);
  const snapOn = DriveTool.snapshot(st(Object.assign({ pull: true }, vp3))).values;
  ok('snapshot includes the pull inputs in SI only when the pull test is on', !('wheelRadius' in DriveTool.snapshot(st(vp3)).values) && Math.abs(snapOn.wheelRadius - 0.034925) < 1e-9 && snapOn.vehicleMass === 5 && snapOn.mu === 0.9);
  ok('a different mass is a different problem in the log, a measured pull is not', PredictionLog.sandboxProblemId(snapOn) !== PredictionLog.sandboxProblemId(DriveTool.snapshot(st(Object.assign({ pull: true }, vp3, { mass: 6 }))).values) && PredictionLog.sandboxProblemId(snapOn) === PredictionLog.sandboxProblemId(DriveTool.snapshot(st(Object.assign({ pull: true }, vp3, { Fmeas: 40 }))).values));
}

console.log('Interface helpers');
{
  const steps = DriveTool.working(s2, f, fu).map(x => x.title);
  ok('working covers T_m, % stall, N_m, N_out, the quadratic and both roots', ['Torque the motor must supply', 'Percent of stall', 'Motor speed', 'Output speed', 'Ratio for the target speed', 'Discriminant', 'Both roots'].every(n => steps.some(t => t.startsWith(n))), steps.join(' | '));
  const q = DriveTool.working(s2, f, fu).find(x => x.title.startsWith('Ratio for'));
  ok('quadratic shown with numbers substituted', q.sub.includes('95.5 i² − 300 i + 113 = 0'), q.sub);
  ok('targets are N_out, % stall and the recommended ratio', DriveTool.targets(s2).map(t => t.key).join() === 'Nout,pct,ratio');
  ok('nearest gear pair rounding', solve({ rounding: 'pair' }).rounded.text.endsWith('gear pair'));
  ok('0.1 rounding', Math.abs(solve({ rounding: '0.1' }).rounded.ratio - 2.7) < 1e-9);
  const drag = st({ loadType: 'lift', rS: 20 }); DriveTool.setLoadTorque(drag, 0.981);
  near('dragging the load sets the mass for a lift load', drag.m, 5);
  const req = Schemas.readDriveRequest(Schemas.makeDriveRequest('Conveyor Designer', { loadTorque: 0.677, targetSpeed: 95.49, stages: [{ ratio: 3, efficiency: 0.9 }] }));
  const s = st({}); DriveTool.applyDriveRequest(s, req);
  ok('drive request sets load, target and stages', s.loadType === 'torque' && s.TL === 0.677 && s.Ntarget === 95.49 && s.stages[0].ratio === 3);
  const res = Schemas.makeDriveResult('Motor and Drive Matcher', DriveTool.driveResult(s2));
  const back = Schemas.readDriveResult(JSON.stringify(res)).value;
  ok('drive result round-trips with the operating point and band', back.ratio === 3.14 && back.dutyBand === 'continuous' && Math.abs(back.ratioRoots.high - 2.7018) < 1e-3);
  ok('motor list validation', DriveTool.readMotorList('[{"label":"A","stallTorque":1,"noLoadSpeed":100}]').list.length === 1 && /needs a label/.test(DriveTool.readMotorList('[{"label":"A"}]').error));
  ok('snapshot is SI', Math.abs(DriveTool.snapshot(st({})).values.noLoadSpeed - 31.4159) < 1e-3);
  ok('description hides the operating point when masked', !DriveTool.describe(s2, fu, true).includes('264'));
  const cmp = solve({ compare: [{ id: 9, label: 'B', Ts: 1, N0: 600 }] });
  ok('compare motor gets its own operating point', cmp.compare.length === 1 && cmp.compare[0].op.pct > s2.op.pct);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
