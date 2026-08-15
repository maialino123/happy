/**
 * Label placement, as data.
 *
 * Kept separate so both the leader lines (drawn as geometry in views.js) and
 * the DOM text (placed by labels.js) come from one source — a label and its
 * leader can never point at different things.
 *
 * `at` is the feature being called out; `to` is where the text sits. The leader
 * runs at -> [at.x, to.y] -> to, the same dog-leg the original plate used.
 * `side: 'left'` puts the dot on the text's right, so the text runs leftward.
 */

import { P } from './params.js';
import { lensY } from './geometry.js';

const ang = (r, t) => [r * Math.cos(t), r * Math.sin(t)];

export const ANNOTATIONS = {
  A: [
    { text: 'Rim synchrotron ring', at: [-P.R, 0], to: [-108, 64], side: 'left', key: true },
    { text: 'Catalytic skin', at: [-58, lensY(-58, P.SKIN)], to: [-46, 64], side: 'right' },
    { text: 'Gyroscopic isolation cabin', at: [0, P.GIMBAL_RY], to: [26, 50], side: 'right', key: true },
    { text: 'Plasma flight envelope', at: [88, lensY(88, P.ENVELOPE)], to: [104, 64], side: 'right' },

    { text: 'Quartz fluid grid', at: [-78, -lensY(-78, P.MID)], to: [-96, -52], side: 'right' },
    { text: 'Hg gyro channel', at: [-P.HG_R, -P.HG_SECT_R], to: [-36, -52], side: 'right' },
    { text: 'ZPE core', at: [0, -P.ZPE_R], to: [-4, -66], side: 'left' },
    { text: 'Quantum-dot fuse bay', at: [P.FUSE_X, -P.FUSE_H / 2], to: [24, -66], side: 'right' },
    { text: 'Titanium shell', at: [76, -lensY(76, P.CORE)], to: [96, -52], side: 'right' },
  ],

  B: [
    { text: 'Counter-rotating ion beams', at: ang(P.BEAM_R, 1.95), to: [-52, 132], side: 'right', key: true },
    { text: 'Mercury gyro annulus', at: ang(P.HG_R + P.HG_W / 2, 2.5), to: [-118, 92], side: 'right' },
    { text: 'Isolation cabin', at: ang(P.GIMBAL_PLAN_R, 2.1), to: [-124, 56], side: 'right' },
    { text: 'Zig-zag gold baffle ladder', at: ang(P.HG_R + P.HG_W / 2, -2.45), to: [-122, -96], side: 'right', key: true },
    { text: 'Rim induction grid', at: ang((P.GIMBAL_PLAN_R + P.BEAM_R) / 2, -0.62), to: [72, -120], side: 'right' },
    { text: 'Fuse bay', at: [P.FUSE_X, -P.FUSE_H / 2], to: [16, -132], side: 'right' },
  ],

  C: [
    { text: 'Gold-mercury amalgam', at: [-16, P.HG_W / 2 - 0.5], to: [-32, 17], side: 'right' },
    { text: 'Rim induction bus', at: [26, P.HG_W / 2 + 7], to: [8, 17], side: 'right' },
    { text: 'Channel wall', at: [-44, -P.HG_W / 2], to: [-50, -15], side: 'right' },
    { text: 'Staggered gold tooth', at: [-24, -P.HG_W / 2], to: [-28, -15], side: 'right', key: true },
    { text: 'Sinusoidal flow path', at: [16, -1.5], to: [8, -15], side: 'right', key: true },
  ],
};

/** Labels that belong to the wormhole and must appear only once it opens. */
export const THROAT_ANNOTATION = { text: 'Transit aperture', to: [0, P.THROAT_MAX_R * 0.62], side: 'right', key: true };

/** Leader polylines for one view, as disjoint segments [x0,y0,x1,y1, ...]. */
export function leaderSegments(view) {
  const out = [];
  for (const a of ANNOTATIONS[view]) {
    const [ax, ay] = a.at;
    const [tx, ty] = a.to;
    out.push(ax, ay, ax, ty); // riser
    out.push(ax, ty, tx, ty); // run to the text
  }
  return new Float32Array(out);
}
