/**
 * Pure geometry generators for the LTV Mk. II schematic.
 *
 * Everything returns a flat Float32Array of 2D pairs [x0,y0, x1,y1, ...].
 * This module imports nothing but `params.js`, so it can be asserted in bare
 * node. `views.js` is the only place that lifts these pairs into three.js.
 *
 * The plan/dorsal view and the developed-channel view are generated from the
 * SAME polar sources (`*Polar()` functions returning [r, theta] pairs) run
 * through two different mappers, so the two views cannot drift apart when a
 * parameter changes.
 */

import { P, TAU } from './params.js';

/* ------------------------------------------------------------------ hull -- */

/**
 * Hull half-height at radial coordinate r for layer L.
 * y(0) = H*hs and y(±R) = RIM_T/2*es, so the outline terminates in a flat rim
 * face of height 2*e — the spec's "flat, circular rim", and the anchor point
 * for the synchrotron ring.
 */
export function lensY(r, L) {
  const R = P.R * L.rs;
  const h = P.H * L.hs;
  const e = (P.RIM_T / 2) * L.es;
  const u = Math.min(1, Math.abs(r) / R);
  return e + (h - e) * Math.pow(1 - u * u, L.p);
}

/** Closed meridional outline of one hull layer. */
export function lensOutline(L, seg = P.SEG) {
  const R = P.R * L.rs;
  const out = new Float32Array(((seg + 1) * 2 + 1) * 2);
  let k = 0;
  for (let i = 0; i <= seg; i++) {
    const r = -R + (2 * R * i) / seg;
    out[k++] = r;
    out[k++] = lensY(r, L);
  }
  for (let i = seg; i >= 0; i--) {
    const r = -R + (2 * R * i) / seg;
    out[k++] = r;
    out[k++] = -lensY(r, L);
  }
  out[k++] = out[0]; // close
  out[k++] = out[1];
  return out;
}

/* --------------------------------------------------------------- helpers -- */

export function circle(cx, cy, rad, seg = 128) {
  const out = new Float32Array((seg + 1) * 2);
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * TAU;
    out[i * 2] = cx + rad * Math.cos(t);
    out[i * 2 + 1] = cy + rad * Math.sin(t);
  }
  return out;
}

export function ellipse(cx, cy, rx, ry, seg = 96) {
  const out = new Float32Array((seg + 1) * 2);
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * TAU;
    out[i * 2] = cx + rx * Math.cos(t);
    out[i * 2 + 1] = cy + ry * Math.sin(t);
  }
  return out;
}

export function rect(cx, cy, w, h) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);
}

/** Disjoint segments, for LineSegments2: pairs of consecutive points. */
export function segments(list) {
  return new Float32Array(list);
}

/* ------------------------------------------- mercury channel, in polar (r,θ) */

/**
 * Flow centreline of the mercury gyro channel.
 *
 * The baffle teeth alternate sides every tooth, so the flow completes one
 * weave cycle every TWO teeth — frequency BAFFLE_N/2. At tooth k the cosine
 * evaluates to (-1)^k, which is exactly the side opposite the intruding tooth.
 * Continuity around the loop requires BAFFLE_N to be even.
 *
 * This closed-form sinusoid IS the spec's "smooth, open, sinusoidal flow
 * path"; it also removes the need for an arc-length table and guarantees the
 * plan and developed views agree exactly.
 */
export function hgFlowR(theta) {
  return P.HG_R + P.HG_W * P.HG_WEAVE * Math.cos((P.BAFFLE_N / 2) * theta);
}

/** Per-slug velocity factor: slowest as it passes each tooth (Lenz braking). */
export function hgBrake(theta) {
  return 1 - P.BRAKE * (0.5 + 0.5 * Math.cos(P.BAFFLE_N * theta));
}

/** Flow centreline sampled as [r, theta] pairs. */
export function hgFlowPolar(seg = P.BAFFLE_N * 8) {
  const out = new Float32Array((seg + 1) * 2);
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * TAU;
    out[i * 2] = hgFlowR(th);
    out[i * 2 + 1] = th;
  }
  return out;
}

/**
 * The zig-zag gold baffle ladder as disjoint segments in [r, theta].
 * Two segments per tooth: root -> skewed tip, skewed tip -> root.
 */
export function baffleTeethPolar() {
  const dth = TAU / P.BAFFLE_N;
  const out = new Float32Array(P.BAFFLE_N * 4 * 2);
  let k = 0;
  for (let i = 0; i < P.BAFFLE_N; i++) {
    const th = i * dth;
    const side = i % 2 ? 1 : -1; // staggered, alternating
    const rRoot = P.HG_R + (side * P.HG_W) / 2;
    const rTip = rRoot - side * P.HG_W * P.BAFFLE_DEPTH;
    const thTip = th + P.BAFFLE_SKEW * dth;
    out[k++] = rRoot;
    out[k++] = th - dth * 0.5;
    out[k++] = rTip;
    out[k++] = thTip;
    out[k++] = rTip;
    out[k++] = thTip;
    out[k++] = rRoot;
    out[k++] = th + dth * 0.5;
  }
  return out;
}

/** Channel walls as [r, theta] polylines (inner, outer). */
export function hgWallsPolar(seg = 256) {
  const mk = (r) => {
    const a = new Float32Array((seg + 1) * 2);
    for (let i = 0; i <= seg; i++) {
      a[i * 2] = r;
      a[i * 2 + 1] = (i / seg) * TAU;
    }
    return a;
  };
  return [mk(P.HG_R - P.HG_W / 2), mk(P.HG_R + P.HG_W / 2)];
}

/* ---------------------------------------------------------------- mappers -- */

/** [r,theta] -> plan/dorsal cartesian. */
export function toPlan(polar) {
  const out = new Float32Array(polar.length);
  for (let i = 0; i < polar.length; i += 2) {
    const r = polar[i];
    const t = polar[i + 1];
    out[i] = r * Math.cos(t);
    out[i + 1] = r * Math.sin(t);
  }
  return out;
}

/**
 * [r,theta] -> developed (unrolled) channel.
 * x = HG_R * (theta - PI) so theta = PI sits at the origin; y = r - HG_R.
 */
export function toDeveloped(polar) {
  const out = new Float32Array(polar.length);
  for (let i = 0; i < polar.length; i += 2) {
    out[i] = P.HG_R * (polar[i + 1] - Math.PI);
    out[i + 1] = polar[i] - P.HG_R;
  }
  return out;
}

/** Half-length of the developed strip, for camera clamping. */
export const DEV_HALF_X = P.HG_R * Math.PI;

/* ------------------------------------------------------------------ misc -- */

/** Rim induction grid: radial nanowire spokes, as disjoint segments. */
export function spokesPlan(r0 = P.GIMBAL_PLAN_R + 4, r1 = P.BEAM_R - 2) {
  const out = new Float32Array(P.SPOKE_N * 4);
  for (let i = 0; i < P.SPOKE_N; i++) {
    const t = (i / P.SPOKE_N) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out[i * 4] = r0 * c;
    out[i * 4 + 1] = r0 * s;
    out[i * 4 + 2] = r1 * c;
    out[i * 4 + 3] = r1 * s;
  }
  return out;
}

/** Quantum-dot fuse bay cartridges, as a run of small rects. */
export function fuseCells(cx, cy) {
  const cells = [];
  const w = P.FUSE_W / P.FUSE_CELLS;
  for (let i = 0; i < P.FUSE_CELLS; i++) {
    const x = cx - P.FUSE_W / 2 + w * (i + 0.5);
    cells.push(rect(x, cy, w * 0.72, P.FUSE_H * 0.72));
  }
  return cells;
}

/**
 * Space-time fold contours around the throat focus: concentric ellipses
 * elongated along the transit axis. Scaled and faded at runtime by `foldWarp`.
 */
export function foldContours(fx, n = 6) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    out.push(ellipse(fx, 0, P.THROAT_MAX_R * (0.5 + 1.9 * k), P.THROAT_MAX_R * (0.5 + 1.1 * k), 96));
  }
  return out;
}

/** Drawing break symbol (a zig-zag) for the ends of the developed strip. */
export function breakSymbol(x, y0, y1, amp = 2.4) {
  const n = 8;
  const out = new Float32Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out[i * 2] = x + (i % 2 ? amp : -amp);
    out[i * 2 + 1] = y0 + (y1 - y0) * t;
  }
  return out;
}
