/**
 * The three projections.
 *
 * A — meridional section   how the craft is built
 * B — plan / dorsal        how it circulates (the only view where the
 *                          counter-rotating beams and the annulus read)
 * C — developed channel    the zig-zag ladder unrolled; the boundary layer,
 *                          the sinusoidal path and the per-slug braking are
 *                          legible in no other view
 *
 * Views B and C are generated from the same polar sources through two
 * different mappers, so they cannot disagree.
 *
 * Everything sits near z=0 with depth testing off; stacking is controlled
 * purely by renderOrder, so there is no z-fighting and no transparency-sort
 * surprise.
 */

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

import { P, TAU } from './params.js';
import * as G from './geometry.js';
import { themed, glow } from './theme.js';
import { leaderSegments } from './annotations.js';

export const ORDER = {
  fold: 0,
  envelope: 10,
  skin: 20,
  mid: 30,
  coolant: 40,
  core: 50,
  hgWall: 60,
  baffle: 70,
  slug: 80,
  rim: 90,
  gic: 100,
  fuse: 110,
  throat: 120,
  tick: 130,
};

const THROAT_X = P.R + 26;
const TRAVEL = THROAT_X + P.R + 30;
const SLUG_SPEED = 0.055; // revolutions per second at hgRate = 1

/* ------------------------------------------------------------- factories -- */

function lift(pairs, z = 0) {
  const n = pairs.length / 2;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = pairs[i * 2];
    out[i * 3 + 1] = pairs[i * 2 + 1];
    out[i * 3 + 2] = z;
  }
  return out;
}

function baseMaterial({ token, width, opacity, dashed, dashSize, gapSize }) {
  const m = new LineMaterial({
    color: 0xffffff,
    linewidth: width,
    worldUnits: false, // linewidth in CSS pixels: stroke weight stays constant
    transparent: true, // under zoom, which is drafting convention
    opacity,
    depthTest: false,
    depthWrite: false,
    dashed: !!dashed,
    dashSize: dashSize ?? 3,
    gapSize: gapSize ?? 3,
  });
  m.resolution.set(window.innerWidth || 1, window.innerHeight || 1); // LineSegments2
  m.userData.baseOpacity = opacity; // .onBeforeRender keeps this current
  themed(m, token);
  return m;
}

function mkLine(pairs, opts) {
  const g = new LineGeometry();
  g.setPositions(lift(pairs, opts.z ?? 0));
  const m = baseMaterial(opts);
  const l = new Line2(g, m);
  if (opts.dashed) l.computeLineDistances();
  l.renderOrder = opts.order ?? 0;
  l.frustumCulled = false; // ~30 line objects; culling instanced fat lines is
  return l; //               a known source of vanishing strokes
}

function mkSegs(pairs, opts) {
  const g = new LineSegmentsGeometry();
  g.setPositions(lift(pairs, opts.z ?? 0));
  const m = baseMaterial(opts);
  const l = new LineSegments2(g, m);
  if (opts.dashed) l.computeLineDistances();
  l.renderOrder = opts.order ?? 0;
  l.frustumCulled = false;
  return l;
}

/** Mercury slugs. InstancedMesh, not Points: sizeAttenuation is a no-op under
 *  an orthographic camera, so Points would be a fixed pixel size at every zoom
 *  and would not read as physical volume. */
function mkSlugs(count) {
  const geo = new THREE.CircleGeometry(1, 14);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  });
  mat.userData.baseOpacity = 0.92;
  themed(mat, '--mercury');
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = ORDER.slug;
  mesh.frustumCulled = false;
  return mesh;
}

/* ------------------------------------------------------------ view build -- */

const STYLE = {
  envelope: { token: '--gold-soft', width: 1.0, opacity: 0.5, dashed: true, dashSize: 2, gapSize: 6, order: ORDER.envelope },
  skin: { token: '--gold', width: 1.7, opacity: 1, order: ORDER.skin },
  mid: { token: '--mercury', width: 1.1, opacity: 0.85, dashed: true, dashSize: 5, gapSize: 3, order: ORDER.mid },
  core: { token: '--ink-faint', width: 1.2, opacity: 1, order: ORDER.core },
  coolant: { token: '--line', width: 1.0, opacity: 0.9, dashed: true, dashSize: 4, gapSize: 4, order: ORDER.coolant },
  hgWall: { token: '--ink-faint', width: 1.0, opacity: 0.8, order: ORDER.hgWall },
  baffle: { token: '--gold', width: 1.3, opacity: 1, order: ORDER.baffle },
  amalgam: { token: '--gold-soft', width: 0.7, opacity: 0.7, order: ORDER.baffle },
  flow: { token: '--mercury', width: 0.8, opacity: 0.35, dashed: true, dashSize: 3, gapSize: 4, order: ORDER.hgWall },
  beam: { token: '--gold', width: 2.0, opacity: 1, dashed: true, dashSize: 2.5, gapSize: 5.5, order: ORDER.rim },
  rim: { token: '--gold', width: 1.3, opacity: 1, order: ORDER.rim },
  spoke: { token: '--line', width: 0.8, opacity: 0.55, order: ORDER.coolant },
  gic: { token: '--ink', width: 1.5, opacity: 1, order: ORDER.gic },
  gimbal: { token: '--ink-dim', width: 1.0, opacity: 0.9, order: ORDER.gic },
  fuse: { token: '--ink-dim', width: 1.0, opacity: 0.9, order: ORDER.fuse },
  zpe: { token: '--gold', width: 1.2, opacity: 1, order: ORDER.gic },
  throat: { token: '--plasma', width: 1.6, opacity: 1, dashed: true, dashSize: 4, gapSize: 4, order: ORDER.throat },
  fold: { token: '--line-soft', width: 0.8, opacity: 0.6, order: ORDER.fold },
  tick: { token: '--ink-faint', width: 0.8, opacity: 0.8, order: ORDER.tick },
  leader: { token: '--ink-faint', width: 0.7, opacity: 0.7, order: ORDER.tick },
};

function buildThroat() {
  const g = new THREE.Group();
  const rings = [];
  for (let i = 0; i < P.THROAT_RINGS; i++) {
    const l = mkLine(G.circle(0, 0, P.THROAT_MAX_R * (0.45 + 0.275 * i), 128), STYLE.throat);
    glow(l.material, 1, 0.75);
    rings.push(l);
    g.add(l);
  }
  const contours = G.foldContours(0).map((c) => {
    const l = mkLine(c, STYLE.fold);
    g.add(l);
    return l;
  });
  g.position.x = THROAT_X;
  return { group: g, rings, contours };
}

/* ------------------------------------------------------------------ A ---- */

function buildMeridional() {
  const view = new THREE.Group();
  const craft = new THREE.Group();
  view.add(craft);

  const envelope = mkLine(G.lensOutline(P.ENVELOPE), STYLE.envelope);
  glow(envelope.material, 0.6, 0.4);
  craft.add(envelope);
  craft.add(mkLine(G.lensOutline(P.SKIN), STYLE.skin));
  const mid = mkLine(G.lensOutline(P.MID), STYLE.mid);
  craft.add(mid);
  craft.add(mkLine(G.lensOutline(P.CORE), STYLE.core));

  // Superfluid cryogenic loop, seen as bores through the quartz layer.
  const coolant = [];
  for (const rs of P.COOLANT_RS) {
    for (const s of [-1, 1]) {
      const c = mkLine(G.circle(s * P.R * rs, 0, 2.1, 40), STYLE.coolant);
      coolant.push(c);
      craft.add(c);
    }
  }

  // Rim synchrotron bore, with the two counter-rotating beams in section.
  const beamDots = [];
  for (const s of [-1, 1]) {
    craft.add(mkLine(G.circle(s * P.R, 0, P.RIM_BORE_R, 48), STYLE.rim));
    for (const b of [-1, 1]) {
      const d = mkLine(G.circle(s * P.R, (b * P.BEAM_SEP) / 2, 0.75, 16), STYLE.beam);
      d.material.dashed = false;
      d.material.needsUpdate = true;
      glow(d.material, 1, 0.8);
      beamDots.push(d);
      craft.add(d);
    }
  }

  // Mercury gyro channel bores, with a slug orbiting inside each.
  for (const s of [-1, 1]) {
    craft.add(mkLine(G.circle(s * P.HG_R, 0, P.HG_SECT_R, 48), STYLE.hgWall));
    const teeth = [];
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * TAU;
      const r0 = P.HG_SECT_R;
      const r1 = P.HG_SECT_R * (1 - P.BAFFLE_DEPTH * 0.5);
      teeth.push(
        s * P.HG_R + r0 * Math.cos(t), r0 * Math.sin(t),
        s * P.HG_R + r1 * Math.cos(t), r1 * Math.sin(t)
      );
    }
    craft.add(mkSegs(new Float32Array(teeth), STYLE.baffle));
  }
  const sectionSlugs = mkSlugs(2);
  craft.add(sectionSlugs);

  // Gyroscopic isolation cabin inside its ferrofluidic gimbal ring.
  craft.add(mkLine(G.ellipse(0, 0, P.GIC_RX, P.GIC_RY), STYLE.gic));
  const gimbal = mkLine(G.ellipse(0, 0, P.GIMBAL_RX, P.GIMBAL_RY), STYLE.gimbal);
  craft.add(gimbal);
  const gimbalTick = mkSegs(
    new Float32Array([P.GIMBAL_RX * 0.82, 0, P.GIMBAL_RX * 1.06, 0]),
    STYLE.tick
  );
  craft.add(gimbalTick);
  craft.add(mkLine(G.circle(0, 0, P.ZPE_R, 40), STYLE.zpe));

  // Quantum-dot fuse bay, immediately outside the cabin.
  for (const s of [-1, 1]) {
    craft.add(mkLine(G.rect(s * P.FUSE_X, 0, P.FUSE_W, P.FUSE_H), STYLE.fuse));
  }
  const fuseCells = [];
  for (const s of [-1, 1]) {
    for (const cell of G.fuseCells(s * P.FUSE_X, 0)) {
      const c = mkLine(cell, { ...STYLE.fuse, token: '--line', width: 0.8 });
      fuseCells.push(c);
      craft.add(c);
    }
  }

  view.add(mkSegs(leaderSegments('A'), STYLE.leader));

  const throat = buildThroat();
  view.add(throat.group);

  return {
    group: view,
    craft,
    throat,
    frame: { halfHeight: 76, halfWidth: 152, bounds: { x: 175, y: 105 }, center: { x: 0, y: 0 } },
    parts: { envelope, mid, coolant, beamDots, gimbal, gimbalTick, fuseCells, sectionSlugs },
  };
}

/* ------------------------------------------------------------------ B ---- */

function buildPlan() {
  const view = new THREE.Group();
  const craft = new THREE.Group();
  view.add(craft);

  const envelope = mkLine(G.circle(0, 0, P.R * P.ENVELOPE.rs, 256), STYLE.envelope);
  glow(envelope.material, 0.6, 0.4);
  craft.add(envelope);
  craft.add(mkLine(G.circle(0, 0, P.R, 256), STYLE.skin));
  craft.add(mkLine(G.circle(0, 0, P.R * P.MID.rs, 256), STYLE.mid));
  craft.add(mkLine(G.circle(0, 0, P.R * P.CORE.rs, 256), STYLE.core));

  // The rim ring: two counter-rotating beams on the same circle geometry.
  // Increasing dashOffset travels backward along vertex order, so one beam
  // decrements and the other increments.
  const beams = [-1, 1].map((s) => {
    const l = mkLine(G.circle(0, 0, P.BEAM_R + (s * P.BEAM_SEP) / 2, 320), STYLE.beam);
    glow(l.material, 1, 0.8);
    craft.add(l);
    return l;
  });

  const spokes = mkSegs(G.spokesPlan(), STYLE.spoke);
  craft.add(spokes);

  const [wIn, wOut] = G.hgWallsPolar();
  craft.add(mkLine(G.toPlan(wIn), STYLE.hgWall));
  craft.add(mkLine(G.toPlan(wOut), STYLE.hgWall));
  craft.add(mkSegs(G.toPlan(G.baffleTeethPolar()), STYLE.baffle));
  const flow = mkLine(G.toPlan(G.hgFlowPolar()), STYLE.flow);
  craft.add(flow);

  const slugs = mkSlugs(P.SLUG_N);
  craft.add(slugs);

  craft.add(mkLine(G.circle(0, 0, P.GIC_PLAN_R, 96), STYLE.gic));
  const gimbal = mkLine(G.circle(0, 0, P.GIMBAL_PLAN_R, 96), STYLE.gimbal);
  craft.add(gimbal);
  const gimbalTick = mkSegs(
    new Float32Array([P.GIMBAL_PLAN_R * 0.78, 0, P.GIMBAL_PLAN_R * 1.12, 0]),
    STYLE.tick
  );
  craft.add(gimbalTick);
  craft.add(mkLine(G.circle(0, 0, P.ZPE_R, 40), STYLE.zpe));

  craft.add(mkLine(G.rect(P.FUSE_X, 0, P.FUSE_W, P.FUSE_H), STYLE.fuse));
  const fuseCells = G.fuseCells(P.FUSE_X, 0).map((cell) => {
    const c = mkLine(cell, { ...STYLE.fuse, token: '--line', width: 0.8 });
    craft.add(c);
    return c;
  });

  view.add(mkSegs(leaderSegments('B'), STYLE.leader));

  const throat = buildThroat();
  view.add(throat.group);

  return {
    group: view,
    craft,
    throat,
    frame: { halfHeight: 142, halfWidth: 152, bounds: { x: 190, y: 165 }, center: { x: 0, y: 0 } },
    parts: { envelope, beams, spokes, gimbal, gimbalTick, fuseCells, slugs, flow },
  };
}

/* ------------------------------------------------------------------ C ---- */

function buildDeveloped() {
  const view = new THREE.Group();
  const X = G.DEV_HALF_X;

  const wall = (y) => mkLine(new Float32Array([-X, y, X, y]), STYLE.hgWall);
  view.add(wall(-P.HG_W / 2));
  view.add(wall(P.HG_W / 2));

  // The gold-mercury surface amalgam: a hairline just inside each wall.
  const amalgam = [];
  for (const s of [-1, 1]) {
    const l = mkLine(new Float32Array([-X, (s * P.HG_W) / 2 - s * 0.5, X, (s * P.HG_W) / 2 - s * 0.5]), STYLE.amalgam);
    amalgam.push(l);
    view.add(l);
  }

  view.add(mkSegs(G.toDeveloped(G.baffleTeethPolar()), STYLE.baffle));
  const flow = mkLine(G.toDeveloped(G.hgFlowPolar()), STYLE.flow);
  view.add(flow);

  const slugs = mkSlugs(P.SLUG_N);
  view.add(slugs);

  // Rim induction nanowire bus above the channel: voltage spikes arrive as
  // dashes travelling toward the baffles.
  const busY = P.HG_W / 2 + 7;
  const bus = mkLine(new Float32Array([-X, busY, X, busY]), {
    ...STYLE.beam,
    width: 1.4,
    dashSize: 3,
    gapSize: 9,
  });
  glow(bus.material, 1, 0.8);
  view.add(bus);

  const taps = [];
  const dth = TAU / P.BAFFLE_N;
  for (let i = 0; i < P.BAFFLE_N; i += 2) {
    const x = P.HG_R * (i * dth - Math.PI);
    taps.push(x, busY, x, P.HG_W / 2 + 1.2);
  }
  const tapSegs = mkSegs(new Float32Array(taps), { ...STYLE.spoke, token: '--gold-soft', opacity: 0.5 });
  view.add(tapSegs);

  // Break symbols: this is a developed strip, not a real straight channel.
  for (const s of [-1, 1]) {
    view.add(mkLine(G.breakSymbol(s * X, -P.HG_W / 2 - 4, P.HG_W / 2 + 4), STYLE.tick));
  }

  view.add(mkSegs(leaderSegments('C'), STYLE.leader));

  return {
    group: view,
    craft: null,
    throat: null,
    frame: { halfHeight: 23, halfWidth: 55, bounds: { x: X, y: 26 }, center: { x: 0, y: 1 } },
    parts: { slugs, flow, bus, tapSegs, amalgam },
  };
}

/* ------------------------------------------------------------------ API -- */

export function buildViews() {
  const A = buildMeridional();
  const B = buildPlan();
  const C = buildDeveloped();
  const views = { A, B, C };

  // One shared phase array so the plan and developed views show the same
  // mercury at the same moment.
  const u = new Float32Array(P.SLUG_N);
  for (let i = 0; i < P.SLUG_N; i++) u[i] = i / P.SLUG_N;

  const dummy = new THREE.Object3D();
  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), THROAT_X);
  const baseColor = new THREE.Color();
  const plasma = new THREE.Color();
  const mercury = new THREE.Color();
  let dash = 0;

  // Craft materials get the transit clipping plane. LineMaterial declares
  // clipping:true and includes <clipping_planes_fragment>, so fat lines really
  // are clipped rather than faded.
  for (const v of [A, B]) {
    v.craft.traverse((o) => {
      if (o.material) o.material.clippingPlanes = [clip];
    });
  }

  function applyThemeColors(values) {
    plasma.set(values['--plasma'] || '#e07a4e');
    mercury.set(values['--mercury'] || '#8fb4c4');
  }

  function placeSlugs(mesh, mode, count) {
    for (let i = 0; i < count; i++) {
      const th = u[i] * TAU;
      const brake = G.hgBrake(th);
      const r = G.hgFlowR(th);
      if (mode === 'plan') {
        dummy.position.set(r * Math.cos(th), r * Math.sin(th), 0);
      } else {
        dummy.position.set(P.HG_R * (th - Math.PI), r - P.HG_R, 0);
      }
      dummy.rotation.z = mode === 'plan' ? th : 0;
      // Slugs compress and stretch as they are braked past each tooth.
      dummy.scale.set(P.SLUG_R * (0.55 + 0.95 * brake), P.SLUG_R * (1.35 - 0.5 * brake), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt, t, d) {
    // --- mercury -----------------------------------------------------------
    for (let i = 0; i < P.SLUG_N; i++) {
      const th = u[i] * TAU;
      u[i] = (u[i] + dt * SLUG_SPEED * d.hgRate * G.hgBrake(th) + 1) % 1;
    }
    placeSlugs(B.parts.slugs, 'plan', P.SLUG_N);
    placeSlugs(C.parts.slugs, 'dev', P.SLUG_N);

    // Section view: one slug orbiting each channel bore.
    for (let s = 0; s < 2; s++) {
      const th = (u[0] * TAU + s * Math.PI) % TAU;
      const sign = s === 0 ? -1 : 1;
      dummy.position.set(
        sign * P.HG_R + P.HG_SECT_R * 0.55 * Math.cos(th),
        P.HG_SECT_R * 0.55 * Math.sin(th),
        0
      );
      dummy.rotation.z = 0;
      dummy.scale.setScalar(P.SLUG_R * 1.1);
      dummy.updateMatrix();
      A.parts.sectionSlugs.setMatrixAt(s, dummy.matrix);
    }
    A.parts.sectionSlugs.instanceMatrix.needsUpdate = true;

    // Slugs flash to plasma on the collision.
    for (const mesh of [A.parts.sectionSlugs, B.parts.slugs, C.parts.slugs]) {
      baseColor.copy(mercury).lerp(plasma, d.collide);
      mesh.material.color.copy(baseColor);
    }

    // --- beams -------------------------------------------------------------
    dash += dt * (2 + 46 * d.beamRate);
    B.parts.beams[0].material.dashOffset = -dash;
    B.parts.beams[1].material.dashOffset = dash;
    const beamOpacity = 0.12 + 0.88 * d.beamGlow;
    for (const b of B.parts.beams) {
      b.material.userData.baseOpacity = beamOpacity;
      b.material.linewidth = 1.6 + 1.4 * d.beamGlow;
    }
    for (const dot of A.parts.beamDots) {
      dot.material.userData.baseOpacity = beamOpacity;
    }

    // --- induction grid ----------------------------------------------------
    B.parts.spokes.material.userData.baseOpacity = 0.25 + 0.6 * d.spokes;
    C.parts.bus.material.dashOffset = -dash * 1.6;
    C.parts.bus.material.userData.baseOpacity = 0.2 + 0.8 * d.spokes;
    C.parts.tapSegs.material.userData.baseOpacity = 0.15 + 0.6 * d.spokes;

    // --- coolant + flow guides --------------------------------------------
    for (const c of A.parts.coolant) c.material.dashOffset = -dash * 0.35;
    A.parts.mid.material.dashOffset = dash * 0.12;
    B.parts.flow.material.dashOffset = -dash * 0.5;
    C.parts.flow.material.dashOffset = -dash * 0.5;

    // --- envelope breathing ------------------------------------------------
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.9);
    for (const v of [A, B]) {
      v.parts.envelope.material.userData.baseOpacity = (0.22 + 0.5 * breathe) * (0.5 + 0.5 * d.hgRate);
    }

    // --- gyro counter-torque ----------------------------------------------
    // The disc spins one way, the cabin gimbal counter-rotates the other.
    const spin = t * (0.25 + 1.9 * d.beamRate);
    for (const v of [A, B]) {
      v.parts.gimbalTick.rotation.z = -spin * (0.3 + 0.7 * d.torque);
      v.parts.gimbal.material.userData.baseOpacity = 0.6 + 0.4 * d.torque;
    }
    B.parts.spokes.rotation.z = spin * 0.25;

    // --- fuse bay ----------------------------------------------------------
    // Load lights cartridges left to right; they hold, they do not trip.
    for (const v of [A, B]) {
      v.parts.fuseCells.forEach((c, i) => {
        const lit = d.fuseLoad * v.parts.fuseCells.length > i;
        c.material.userData.baseOpacity = lit ? 1 : 0.25;
      });
    }

    // --- wormhole ----------------------------------------------------------
    for (const v of [A, B]) {
      const th = v.throat;
      th.group.visible = d.throat > 0.001 || d.foldWarp > 0.001;
      th.group.scale.setScalar(Math.max(0.001, d.throat));
      th.rings.forEach((ring, i) => {
        ring.material.userData.baseOpacity = d.throat * (1 - i * 0.22);
        ring.material.dashOffset = dash * 1.3; // negative energy: dashes run inward
      });
      th.contours.forEach((c, i) => {
        c.material.userData.baseOpacity = d.foldWarp * 0.5 * (1 - i * 0.13);
      });
      // Collision flash brightens the throat rings for a beat.
      if (d.collide > 0.001) {
        th.group.visible = true;
        th.group.scale.setScalar(Math.max(0.06, d.throat));
        th.rings.forEach((r) => (r.material.userData.baseOpacity = d.collide));
      }
    }

    // --- transit -----------------------------------------------------------
    const x = d.transit * TRAVEL;
    A.craft.position.x = x;
    B.craft.position.x = x;
    clip.constant = THROAT_X;
  }

  return { views, update, applyThemeColors, THROAT_X };
}
