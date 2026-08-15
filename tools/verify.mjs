/**
 * Verification for the LTV Mk. II schematic.
 *
 *   node tools/verify.mjs --logic      pure geometry + state machine, no browser
 *   node tools/verify.mjs              logic, then the full browser suite
 *
 * The browser suite is written so that a sandbox without WebGL still produces a
 * meaningful pass: it asserts the SVG fallback took over. An environment quirk
 * must never masquerade as a product bug.
 */

import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC_ONLY = process.argv.includes('--logic');

let failures = 0;
let checks = 0;

function ok(label, cond, detail = '') {
  checks++;
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}
function section(name) {
  console.log(`\n${name}`);
}

/* ============================================================ pure logic == */

const { P, TAU } = await import(pathToFileURL(resolve(ROOT, 'src/schematic/params.js')));
const G = await import(pathToFileURL(resolve(ROOT, 'src/schematic/geometry.js')));
const S = await import(pathToFileURL(resolve(ROOT, 'src/schematic/sequence.js')));

section('Hull profile');
{
  const L = P.SKIN;
  const out = G.lensOutline(L, 64);
  ok('outline is closed', near(out[0], out[out.length - 2]) && near(out[1], out[out.length - 1]));

  // Mirror symmetry about y = 0: the two runs are the same x sequence negated in y.
  const half = (out.length - 2) / 2;
  let sym = true;
  for (let i = 0; i < half; i += 2) {
    const j = out.length - 4 - i;
    if (!near(out[i], out[j], 1e-4) || !near(out[i + 1], -out[j + 1], 1e-4)) sym = false;
  }
  ok('outline is mirror-symmetric about y=0', sym);

  const e = (P.RIM_T / 2) * L.es;
  ok('terminates in a flat rim face', near(G.lensY(P.R * L.rs, L), e, 1e-9), `y(R)=${G.lensY(P.R, L)} want ${e}`);
  ok('centreline half-thickness is H*hs', near(G.lensY(0, L), P.H * L.hs, 1e-9));
  ok('profile is monotonic from centre to rim', (() => {
    let prev = G.lensY(0, L);
    for (let i = 1; i <= 100; i++) {
      const y = G.lensY((P.R * L.rs * i) / 100, L);
      if (y > prev + 1e-9) return false;
      prev = y;
    }
    return true;
  })());
}

section('Radial ordering');
{
  const chain = [
    ['ZPE core', P.ZPE_R],
    ['GIC', P.GIC_PLAN_R],
    ['gimbal ring', P.GIMBAL_PLAN_R],
    ['Hg inner wall', P.HG_R - P.HG_W / 2],
    ['Hg outer wall', P.HG_R + P.HG_W / 2],
    ['titanium core', P.R * P.CORE.rs],
    ['quartz fluid grid', P.R * P.MID.rs],
    ['catalytic skin', P.R * P.SKIN.rs],
    ['plasma envelope', P.R * P.ENVELOPE.rs],
  ];
  let bad = null;
  for (let i = 1; i < chain.length; i++) {
    if (!(chain[i][1] > chain[i - 1][1])) bad = `${chain[i - 1][0]} (${chain[i - 1][1]}) >= ${chain[i][0]} (${chain[i][1]})`;
  }
  ok('radii strictly increase outward', !bad, bad ?? '');
  ok('fuse bay sits outside the gimbal ring', P.FUSE_X - P.FUSE_W / 2 > P.GIMBAL_RX);
  ok('fuse bay sits inboard of the mercury channel', P.FUSE_X + P.FUSE_W / 2 < P.HG_R - P.HG_W / 2);
  ok('beam radius sits inside the rim', P.BEAM_R < P.R && P.BEAM_R > P.R * P.MID.rs);

  // The accelerator bore has to fit inside the flat rim face it is drilled through.
  const rimHalf = (P.RIM_T / 2) * P.SKIN.es;
  ok('accelerator bore fits inside the rim face', P.RIM_BORE_R < rimHalf,
    `bore ${P.RIM_BORE_R} vs rim half-thickness ${rimHalf}`);

  // The mercury channel is drilled through the titanium pressure hull, so the
  // hull must actually be thick enough at that radius to contain the bore.
  const coreHalf = G.lensY(P.HG_R, P.CORE);
  ok('mercury channel clears the titanium hull', coreHalf - P.HG_SECT_R > 1.0,
    `core half-height ${coreHalf.toFixed(2)} vs bore ${P.HG_SECT_R}`);
}

section('Zig-zag gold baffle ladder');
{
  const teeth = G.baffleTeethPolar();
  ok('tooth count matches BAFFLE_N', teeth.length / 2 === P.BAFFLE_N * 4, `${teeth.length / 2} points`);
  ok('BAFFLE_N is even (flow weave must close on itself)', P.BAFFLE_N % 2 === 0);

  // Teeth must alternate which wall they intrude from.
  let alt = true;
  for (let i = 0; i < P.BAFFLE_N; i++) {
    const rRoot = teeth[i * 8];
    const expected = i % 2 ? P.HG_R + P.HG_W / 2 : P.HG_R - P.HG_W / 2;
    if (!near(rRoot, expected, 1e-4)) alt = false;
  }
  ok('teeth alternate sides', alt);

  // Every tooth tip must stop short of the far wall, or the channel is blocked.
  let clear = true;
  for (let i = 0; i < P.BAFFLE_N; i++) {
    const rTip = teeth[i * 8 + 2];
    if (rTip < P.HG_R - P.HG_W / 2 || rTip > P.HG_R + P.HG_W / 2) clear = false;
  }
  ok('tooth tips stay inside the channel', clear);

  // The flow path must clear both walls everywhere.
  let inside = true;
  let opposesTeeth = true;
  const dth = TAU / P.BAFFLE_N;
  for (let i = 0; i <= 2000; i++) {
    const th = (i / 2000) * TAU;
    const r = G.hgFlowR(th);
    if (r <= P.HG_R - P.HG_W / 2 || r >= P.HG_R + P.HG_W / 2) inside = false;
  }
  for (let k = 0; k < P.BAFFLE_N; k++) {
    const side = k % 2 ? 1 : -1; // tooth intrudes from this side
    const dev = G.hgFlowR(k * dth) - P.HG_R; // flow should sit on the other side
    if (Math.sign(dev) !== -side) opposesTeeth = false;
  }
  ok('flow path stays between the channel walls', inside);
  ok('flow deflects away from each tooth', opposesTeeth);
  ok('flow is continuous around the loop', near(G.hgFlowR(0), G.hgFlowR(TAU), 1e-9));

  const b0 = G.hgBrake(0);
  const b1 = G.hgBrake(dth / 2);
  ok('braking is strongest at a tooth', b0 < b1, `brake(tooth)=${b0.toFixed(3)} brake(mid)=${b1.toFixed(3)}`);
  ok('braking never stalls or reverses the flow', b0 > 0);
}

section('View consistency');
{
  // The plan and developed views must be the same data through two mappers.
  const polar = G.baffleTeethPolar();
  const plan = G.toPlan(polar);
  const dev = G.toDeveloped(polar);
  ok('both mappers preserve point count', plan.length === polar.length && dev.length === polar.length);

  let radiiMatch = true;
  for (let i = 0; i < polar.length; i += 2) {
    const rPlan = Math.hypot(plan[i], plan[i + 1]);
    const rDev = dev[i + 1] + P.HG_R;
    if (!near(rPlan, polar[i], 1e-3) || !near(rDev, polar[i], 1e-3)) radiiMatch = false;
  }
  ok('plan and developed views agree on every radius', radiiMatch);
  ok('developed strip half-length is HG_R*PI', near(G.DEV_HALF_X, P.HG_R * Math.PI, 1e-9));
}

section('Two-stage sequence');
{
  const seen = [];
  const seq = S.createSequence({ onState: (s) => seen.push(s) });
  const step = (secs, dt = 1 / 60) => {
    for (let t = 0; t < secs; t += dt) seq.update(dt);
  };

  ok('starts idle', seq.state === 'IDLE');
  ok('idle drivers match IDLE_DRIVERS', Object.keys(S.IDLE_DRIVERS).every((k) => seq.drivers[k] === S.IDLE_DRIVERS[k]));

  seq.press();
  ok('press from IDLE enters stage 1', seq.state === 'SPINUP');
  step(3.4);
  ok('stage 1 auto-advances to ARMED', seq.state === 'ARMED', seq.state);
  ok('beams reach nominal', near(seq.drivers.beamRate, 1, 1e-3));
  ok('counter-torque reaches full', near(seq.drivers.torque, 1, 1e-3));
  ok('throat still shut after stage 1', seq.drivers.throat === 0);

  seq.press();
  ok('press from ARMED commands the collision', seq.state === 'COLLISION');
  step(0.6);
  ok('collision advances to throat expansion', seq.state === 'THROAT', seq.state);
  step(2.0);
  ok('throat expansion advances to transit', seq.state === 'TRANSIT', seq.state);
  step(1.9);
  ok('transit completes', seq.state === 'TRANSITED', seq.state);
  ok('vessel is through the fold', near(seq.drivers.transit, 1, 1e-3));

  ok('full state chain fired in order',
    JSON.stringify(seen) === JSON.stringify(['SPINUP', 'ARMED', 'COLLISION', 'THROAT', 'TRANSIT', 'TRANSITED']),
    JSON.stringify(seen));

  seq.reset();
  step(0.8);
  ok('reset returns to IDLE', seq.state === 'IDLE', seq.state);
  const back = Object.keys(S.IDLE_DRIVERS).every((k) => near(seq.drivers[k], S.IDLE_DRIVERS[k], 1e-3));
  ok('reset restores every idle driver value', back, JSON.stringify(seq.drivers));

  // Abort must be available before the collision and refused after it.
  const seq2 = S.createSequence();
  seq2.press();
  ok('abort offered during spin-up', seq2.canAbort);
  seq2.press();
  for (let t = 0; t < 3.4; t += 1 / 60) seq2.update(1 / 60);
  seq2.press();
  ok('abort refused once the collision is commanded', !seq2.canAbort, seq2.state);

  // Reduced motion must still reach terminal values.
  const seq3 = S.createSequence();
  seq3.setReducedMotion(true);
  seq3.press();
  for (let t = 0; t < 0.4; t += 1 / 60) seq3.update(1 / 60);
  ok('reduced motion still reaches ARMED', seq3.state === 'ARMED', seq3.state);
  ok('reduced motion still reaches terminal drivers', near(seq3.drivers.beamRate, 1, 1e-3));

  ok('every state has a readout line', Object.keys(S.STATES).every((s) => S.readout(s, S.IDLE_DRIVERS).length > 0));
  ok('every state has a primary button label', Object.keys(S.STATES).every((s) => S.primaryLabel(s).length > 0));
}

section('Module purity');
{
  for (const f of ['params.js', 'geometry.js', 'sequence.js']) {
    const src = readFileSync(resolve(ROOT, 'src/schematic', f), 'utf8');
    ok(`${f} does not import three`, !/from\s+['"]three/.test(src));
  }
}

/* ============================================================== browser == */

if (!LOGIC_ONLY) {
  const { runBrowserSuite } = await import(pathToFileURL(resolve(ROOT, 'tools/verify-browser.mjs')));
  const res = await runBrowserSuite({ ROOT, ok, section, mkdirSync, existsSync, statSync });
  if (res?.skipped) console.log(`\n(browser suite skipped: ${res.skipped})`);
}

/* ================================================================ report == */

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
