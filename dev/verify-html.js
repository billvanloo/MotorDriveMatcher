// Confirms the code inlined in index.html is exactly the tested code, then runs
// spec cases on the inline copy. Run: node dev/verify-html.js   (--fix copies dev/core.js in)
'use strict';
const path = require('path');
const vb = require('./vendor/verify-blocks.js');
const root = path.join(__dirname, '..');
if (process.argv.includes('--fix') && vb.syncCore(root)) console.log('Copied dev/core.js into index.html.');
let passed = 0, failed = 0;
const ok = (n, c, d) => { if (c) { passed++; console.log('  PASS ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? ': ' + d : '')); } };
const near = (n, g, e) => ok(n, Math.abs(e) < 1 ? Math.abs(g - e) <= 0.01 : Math.abs(g - e) / Math.abs(e) <= 0.005, 'got ' + g + ', expected ' + e);

console.log('Inline blocks match dev/core.js and dev/vendor/');
const problems = vb.verify(root);
problems.forEach(p => ok(p, false));
ok('every inline block matches its tested copy', problems.length === 0);

console.log('Inline copy runs the spec cases');
const MotorCore = vb.loadInline(root, 'vendor:motor-core.js');
const DriveTool = vb.loadInline(root, 'core', { MotorCore });
const s = DriveTool.solve(DriveTool.defaultState());
near('MD-1 N_out (inline, default state)', s.Nout, 84.0); near('MD-1 % stall (inline)', s.op.pct, 12.0);
near('MD-2 i_high (inline)', s.solver.iHigh, 2.70); near('MD-2 i_low (inline)', s.solver.iLow, 0.439);
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
