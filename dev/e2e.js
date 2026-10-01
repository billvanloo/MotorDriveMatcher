// Browser checks for the Motor and Drive Matcher, driven in headless Chromium
// against the real index.html: the standard checks every tool passes (spec 00),
// then spec 02's cases, interactions and acceptance criteria through the interface.
//
// Needs Playwright (not a project dependency). Once, from the repo root:
//   npm i --no-save playwright && npx playwright install chromium
// Run: node dev/e2e.js     (set CHROMIUM_PATH to use an installed Chromium)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const kit = require('./vendor/e2e-kit.js');
const root = path.join(__dirname, '..');

(async () => {
  const t = await kit.start(root);
  const { page } = t;
  const txt = sel => page.textContent(sel);
  const res = async () => (await page.innerText('#shResultsBody')).replace(/\s+/g, ' ');
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__app.state)));
  const writeTmp = (name, obj) => { const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, JSON.stringify(obj)); return f; };

  await kit.standard(t, {
    predictKeys: ['Nout', 'pct', 'ratio'],
    change: async p => { await p.fill('#mdTL', '0.7'); },
    mutate: async p => { await p.fill('#mdN0', '350'); await p.fill('#mdTL', '1'); },
    shotDir: path.join(root, 'docs', 'screenshots'), shotName: 'motor-drive-matcher',
  });

  console.log('MD-1 and MD-2 in the interface (default state)');
  await t.fresh();
  let r = await res();
  t.ok('MD-1 motor torque 0.241 N·m (12.0%)', r.includes('0.241 N·m (12.0%)'), r.slice(0, 120));
  t.ok('MD-1 motor speed 264 rpm, output 84.0 rpm', r.includes('264 rpm') && r.includes('84.0 rpm'));
  t.ok('MD-1 output power 5.98 W (spec 5.99, see ERRATA) and peak 15.7 W', r.includes('5.98 W / 15.7 W'));
  t.ok('MD-1 duty continuous', r.includes('Continuous'));
  t.ok('MD-2 recommended 2.70, other root 0.439 at 86.0% of stall, flagged', r.includes('Recommended i 2.70') && r.includes('0.439') && r.includes('86.0% of stall') && r.includes('possible but the motor would work above half its stall torque'));
  t.ok('MD-2 rounded result and speed error shown', r.includes('2.70 → 95.6 rpm, error +0.0677%'));
  t.ok('operating point drawn with its label', (await txt('#mdDraw')).includes('operating point: 0.241 N·m, 264 rpm'));
  const dtext = await txt('#mdDraw');
  t.ok('duty bands labeled on the plot, with the source', ['continuous ≤30%', 'short use 30–60%', 'avoid >60%', 'ISL Products'].every(s => dtext.includes(s)));
  t.ok('power curve peak labeled 15.7 W at 1.00 N·m, 150 rpm', dtext.includes('peak power 15.7 W at 1.00 N·m, 150 rpm'));
  await page.click('#shWorking summary');
  const wk = (await txt('#shWorkingBody')).replace(/\s+/g, ' ');
  t.ok('working shows T_m, % stall, N_m, N_out, the quadratic with numbers and both roots', ['Tm = TL / (i η)', '0.680 N·m / (3.14 × 0.900)', 'Percent of stall', 'Nm = N0 (1 − Tm / Ts)', 'Nout = Nm / i', '95.5 i² − 300 i + 113 = 0', 'ihigh = 2.70', 'ilow = 0.439'].every(s => wk.includes(s)), wk.slice(0, 400));
  await page.click('#mdUse');
  let s = await state();
  t.ok('Use this ratio sets one stage of 2.70', s.stages.length === 1 && s.stages[0].ratio === 2.7);
  t.ok('output is then 95.6 rpm', (await res()).includes('Output speed 95.6 rpm'));

  console.log('MD-3, MD-6, MD-7, MD-11: edge cases');
  await t.fresh();
  await page.fill('#mdTL', '6');
  r = await res();
  t.ok('MD-3 stalled with message', r.includes('Stalled') && r.includes('Stalled: the load needs 2.12 N·m at the motor'));
  t.ok('MD-3 stall marker on the plot', (await txt('#mdDraw')).includes('STALLED'));
  t.ok('MD-3 output 0 rpm', r.includes('Output speed 0 rpm'));
  await page.fill('#mdTL', '2'); await page.fill('#mdNt', '200');
  r = await res();
  t.ok('MD-6 cannot-deliver message, no ratio shown', r.includes('This motor cannot deliver that speed at that load. It would need more power than it can make. Try a stronger motor or more motors.') && !r.includes('Recommended i'));
  await kit.noBadNumbers(t, 'MD-6');
  await page.fill('#mdNt', '95.5');
  await page.selectOption('#mdLT', 'lift'); await page.fill('#mdM', '5'); await page.fill('#mdRS', '20');
  t.ok('MD-7 lift: T_L 0.981 N·m', (await txt('#mdTLnote')).includes('0.981 N·m'));
  t.ok('lift speed shown', (await res()).includes('Lift speed'));
  await page.selectOption('#mdLT', 'torque'); await page.fill('#mdTL', '0');
  r = await res();
  t.ok('MD-11 no load: motor at 300 rpm, output power 0', r.includes('Motor speed 300 rpm') && r.includes('Output power / peak 0 W'));
  await kit.noBadNumbers(t, 'MD-11');

  console.log('MD-5, MD-8, MD-9, MD-10');
  await t.fresh();
  await page.fill('#mdK', '2');
  r = await res();
  t.ok('MD-8 two motors: 6.02% of combined stall, 282 rpm, output 89.8 rpm', r.includes('(6.02%)') && r.includes('282 rpm') && r.includes('89.8 rpm'));
  await page.fill('#mdK', '1');
  await page.click('#mdAddSt');
  const ids = (await state()).stages.map(x => x.id);
  await page.fill('#mdR' + ids[0], '3'); await page.fill('#mdE' + ids[0], '0.95');
  await page.fill('#mdR' + ids[1], '4'); await page.fill('#mdE' + ids[1], '0.95');
  t.ok('MD-9 overall i = 12.0, η = 0.9025', (await txt('#mdOverall')).startsWith('Overall i = 12.0, η = 0.90'), await txt('#mdOverall'));
  await t.fresh();
  const before = await res();
  await page.selectOption('#mdTsU', 'N·cm');
  t.ok('MD-10 switching to N·cm shows 200', (await page.inputValue('#mdTs')) === '200');
  t.ok('MD-10 results identical', (await res()) === before);
  await page.fill('#mdTs', '200');
  t.ok('MD-10 typing 200 N·cm keeps identical results', (await res()) === before);
  await page.selectOption('#mdTsU', 'oz·in');
  t.ok('oz·in conversion shows 283', (await page.inputValue('#mdTs')).startsWith('283.2'));
  await page.selectOption('#mdTsU', 'N·m');
  await page.fill('#mdR' + (await state()).stages[0].id, '1'); await page.fill('#mdE' + (await state()).stages[0].id, '1');
  await page.fill('#mdTL', '0.5'); await page.check('#mdEl');
  await page.fill('#mdV', '12'); await page.fill('#mdI0', '0.2'); await page.fill('#mdIs', '10');
  r = await res();
  t.ok('MD-5 current 2.65 A, power in 31.8 W, efficiency 37.0%', r.includes('2.65 A') && r.includes('31.8 W') && r.includes('37.0%'), r);
  t.ok('current and efficiency panel drawn', (await txt('#mdDraw')).includes('Current and motor efficiency'));

  console.log('Interactions: drag, keyboard, compare');
  await t.fresh();
  const pa = await page.locator('#mdSvg .plotarea').boundingBox();
  const seen = [];
  await page.mouse.move(pa.x + pa.width * 0.2, pa.y + pa.height / 2); await page.mouse.down();
  for (const fx of [0.25, 0.3, 0.35, 0.4]) { await page.mouse.move(pa.x + pa.width * fx, pa.y + pa.height / 2); seen.push((await state()).TL); }
  await page.mouse.up();
  t.ok('dragging moves the load continuously', seen.every((v, i) => i === 0 || v > seen[i - 1]), JSON.stringify(seen));
  t.ok('readout follows the drag', !(await res()).includes('(12.0%)'));
  const tl0 = (await state()).TL;
  await page.focus('#mdSvg'); await page.keyboard.press('ArrowRight');
  const tl1 = (await state()).TL;
  t.ok('right arrow raises the load by 1% of stall at the motor', Math.abs((tl1 - tl0) - 0.02 * 3.14 * 0.9) < 0.002, tl0 + ' → ' + tl1);
  await page.keyboard.press('Shift+ArrowLeft');
  t.ok('Shift+left lowers it by 10%', (await state()).TL < tl1 - 0.15);
  await page.click('#mdAddCmp');
  t.ok('compare motor drawn and listed', (await txt('#mdDraw')).includes('Motor 2') && (await res()).includes('Motor 2 (dashed)'));
  await page.click('#mdAddCmp');
  t.ok('up to two compare motors', await page.isDisabled('#mdAddCmp'));

  console.log('Files: drive request in, drive result out');
  await t.fresh();
  const req = { schema: 'drive-request', schemaVersion: 1, source: 'Conveyor Designer', units: { torque: 'N·m', speed: 'rpm' }, loadTorque: 0.677, targetSpeed: 95.49, stages: [{ ratio: 3, efficiency: 0.9 }] };
  await page.setInputFiles('#shFile', writeTmp('md-req.json', req));
  await page.waitForTimeout(150);
  s = await state();
  t.ok('drive request sets load, target and stages', s.TL === 0.677 && s.Ntarget === 95.49 && s.stages[0].ratio === 3);
  t.ok('load message names the source', (await txt('#shToast')).includes('Conveyor Designer'));
  const dl = await kit.download(t, () => page.click('#mdExport'));
  const out = JSON.parse(dl.buf.toString('utf8'));
  t.ok('drive result file with ratio, operating point and band', out.schema === 'drive-result' && out.ratio === 3 && out.operatingPoint && typeof out.operatingPoint.outputSpeed === 'number' && out.dutyBand === 'continuous');
  t.ok('drive result file name', /_motor-drive-matcher_drive-result_\d{4}-\d{2}-\d{2}\.json$/.test(dl.name), dl.name);

  console.log('Predict first');
  await t.fresh();
  await page.click('#shPredict');
  const d1 = await txt('#mdDraw');
  t.ok('operating point hidden on the plot', !d1.includes('operating point'));
  t.ok('N_out, % stall and solver hidden', !(await res()).includes('84.0') && !(await res()).includes('2.70'));
  await page.fill('#shPf_Nout', '95.5'); await page.fill('#shPf_ratio', '3.14');
  await page.click('#shCheck');
  const pf = await txt('#shPfBox');
  t.ok('checked messages for N_out and the ratio', pf.includes('You predicted 95.5 rpm. The model gives 84.0 rpm (+13.6% difference).') && pf.includes('You predicted 3.14. The model gives 2.70 (+16.2% difference).'), pf);
  t.ok('operating point back after Check', (await txt('#mdDraw')).includes('operating point'));
  await page.click('#shPredict');

  console.log('VEX pull test (spec 02a)');
  await t.fresh();
  await page.check('#mdPull');
  await page.click('#mdV5');
  s = await state();
  t.ok('VP-1 "Use two V5 green motors" sets 1.05 N·m, 200 rpm, two motors', s.preset === 'v5green' && s.Ts === 1.05 && s.N0 === 200 && s.k === 2);
  t.ok('V5 straight-line caveat shown', (await res()).includes('The V5 motor is not a straight-line motor'));
  let sid = s.stages[0].id;
  await page.fill('#mdR' + sid, '1'); await page.fill('#mdE' + sid, '1');
  r = await res();
  t.ok('VP-2 4" traction, i = 1: motor-limited 41.3 N, traction asks for inputs', r.includes('Motor-limited pull 41.3 N') && r.includes('enter the vehicle mass and μ'), r);
  await page.selectOption('#mdWh', 'omni200');
  t.ok('VP-6 200 mm omni: 66.0 N', (await res()).includes('Motor-limited pull 66.0 N'));
  await page.selectOption('#mdWh', 't275');
  await page.fill('#mdR' + sid, '3'); await page.fill('#mdE' + sid, '0.9');
  await page.fill('#mdMass', '5'); await page.fill('#mdMu', '0.9');
  r = await res();
  t.ok('VP-3 162 N motor, 44.1 N traction, wheels slip first', r.includes('Predicted pull F 44.1 N') && r.includes('Wheels slip first') && r.includes('Motor-limited pull 162 N') && r.includes('Traction-limited pull 44.1 N'), r);
  t.ok('VP-3 crossover 0.816 and mass 18.4 kg', r.includes('Crossover ratio i* 0.816') && r.includes('18.4 kg'));
  const pd = await txt('#mdDraw');
  t.ok('pull chart drawn with both limits and the design point', ['Pull test: pulling force against gear ratio', 'motors stall', 'wheels slip: 44.1 N', 'i* = 0.816', 'your design: 44.1 N at i = 3.00'].every(x => pd.includes(x)));
  await page.fill('#mdFD', '60');
  t.ok('VP-4 60% on driven wheels: 26.5 N, i* 0.489', (await res()).includes('Traction-limited pull 26.5 N') && (await res()).includes('0.489'));
  await page.fill('#mdFD', '100'); await page.fill('#mdFm', '40');
  t.ok('VP-8 measured 40 N: −9.39% difference', (await res()).includes('You measured 40.0 N. The model gives 44.1 N (−9.39% difference).'));
  await page.fill('#mdMu', '0');
  r = await res();
  t.ok('VP-7 μ = 0: pull 0 N, mass not defined', r.includes('Predicted pull F 0 N') && r.includes('not defined: friction is zero'), r);
  await kit.noBadNumbers(t, 'VP-7');
  await page.fill('#mdMu', '0.9'); await page.fill('#mdMass', '');
  t.ok('VP-9 blank mass is allowed and shows the motor-limited pull', (await page.evaluate(() => Object.keys(window.__app.invalid).length)) === 0 && (await res()).includes('Predicted pull F 162 N'));
  await page.fill('#mdMass', '5');
  await page.click('#shWorking summary');
  const pw = (await txt('#shWorkingBody')).replace(/\s+/g, ' ');
  t.ok('working shows both limits, the minimum, i* and m*', ['Fmotor = k Ts i η / r', 'Ftraction = μ f m g', 'F = min(Fmotor, Ftraction)', 'i* = μ f m g r / (k Ts η)', 'm* = Fmotor / (μ f g)'].every(x => pw.includes(x)), pw.slice(0, 300));
  await page.click('#shWorking summary');
  await page.click('#shPredict');
  t.ok('predict first hides the pull, its limit and the design point', !(await res()).includes('44.1') && !(await res()).includes('Wheels slip first') && !(await txt('#mdDraw')).includes('your design'));
  await page.fill('#shPf_pull', '50');
  await page.click('#shCheck');
  t.ok('pull prediction checked', (await txt('#shPfBox')).includes('You predicted 50.0 N. The model gives 44.1 N (+13.3% difference).'), await txt('#shPfBox'));
  await page.click('#shPredict');
  const saved = await kit.download(t, () => page.click('#shSave'));
  const design = JSON.parse(saved.buf.toString('utf8'));
  t.ok('design file keeps the pull test inputs', design.state.pull === true && design.state.wheel === 't275' && design.state.mass === 5 && design.state.mu === 0.9 && design.state.Fmeas === 40);
  await t.fresh();
  const old = JSON.parse(JSON.stringify(design)); ['pull', 'wheel', 'rW', 'mass', 'fDrive', 'mu', 'Fmeas'].forEach(k => delete old.state[k]);
  await page.setInputFiles('#shFile', writeTmp('md-old.json', old));
  await page.waitForTimeout(150);
  s = await state();
  t.ok('an older file loads with the pull test off and blank', s.pull === false && s.mass === null && s.mu === null && await page.isHidden('#mdPullBox'));

  console.log('Help and settings (acceptance)');
  const help = await page.evaluate(() => { window.__app.openHelp(); const x = document.getElementById('shHelpDlg').textContent; document.getElementById('shHelpDlg').close(); return x; });
  t.ok('help explains the no-load ratio mistake with MD-1 and MD-2', help.includes('Why the no-load speed gives the wrong ratio') && help.includes('84.0 rpm') && help.includes('2.70'));
  t.ok('help says η is treated as constant', help.includes('treated as constant'));
  t.ok('help explains why 150 rpm does not limit a static pull, and how to measure μ', help.includes('Why 150 rpm does not matter here') && help.includes('Measuring μ'));
  await page.click('#shSettings');
  await page.fill('#mdML', '[{"label":"Kit motor A","stallTorque":0.35,"noLoadSpeed":150}]');
  await page.click('#mdMLSave');
  t.ok('teacher motor list saved', (await txt('#mdMLMsg')).includes('Saved 1 motor'));
  await page.fill('#mdBC', '20');
  await page.keyboard.press('Escape');
  t.ok('band edges change the plot labels', (await txt('#mdDraw')).includes('continuous ≤20%'));
  await page.selectOption('#mdPre', 'm0');
  s = await state();
  t.ok('choosing a listed motor fills its values', s.label === 'Kit motor A' && s.Ts === 0.35 && s.N0 === 150);
  await page.click('#shSettings'); await page.fill('#mdML', 'not json'); await page.click('#mdMLSave');
  t.ok('bad motor list is explained', (await txt('#mdMLMsg')).includes('not valid JSON'));
  await page.keyboard.press('Escape');

  console.log('Performance');
  await t.fresh();
  await page.check('#mdEl'); await page.click('#mdAddCmp'); await page.click('#mdAddCmp');
  const ms = await kit.timeIt(page, 'const a = window.__app; a.state.TL = 0.3 + Math.random() * 0.5; a.changed();', 21);
  console.log('    median update with two compare motors and the electrical panel: ' + ms.toFixed(1) + ' ms');
  t.ok('dragging updates in well under a frame budget (< 50 ms)', ms < 50, ms.toFixed(1));

  await t.finish();
})().catch(e => { console.error(e); process.exit(1); });
