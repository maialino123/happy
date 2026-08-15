/**
 * Two-stage Primary Trigger state machine (spec §IV, "Primary Trigger").
 *
 * Owns a flat set of normalized scalars ("drivers"). Rendering code reads only
 * these — it never inspects the state name — so reduced-motion support is just
 * a collapsed duration, with no branching in the render path.
 *
 * Imports nothing. Testable in bare node against a fake clock.
 */

export const IDLE_DRIVERS = Object.freeze({
  beamRate: 0, // ion beam velocity, fraction of nominal
  beamGlow: 0, // beam brightness / apparent width
  hgRate: 0.25, // mercury circulation rate
  torque: 0, // fluid gyro counter-torque
  spokes: 0, // rim induction grid energization
  collide: 0, // collision flash envelope
  throat: 0, // wormhole throat radius, fraction of THROAT_MAX_R
  foldWarp: 0, // space-time fold contour intensity
  transit: 0, // vessel position along the transit axis
  fuseLoad: 0, // quantum-dot fuse bay load
});

const ARMED_DRIVERS = {
  beamRate: 1,
  beamGlow: 1,
  hgRate: 1,
  torque: 1,
  spokes: 1,
  collide: 0,
  throat: 0,
  foldWarp: 0,
  transit: 0,
  fuseLoad: 0.35,
};

/**
 * `dur` in seconds; `next` auto-advances when the state completes.
 * States with no `next` wait for input.
 */
export const STATES = {
  IDLE: { dur: 0, to: { ...IDLE_DRIVERS } },

  // Stage 1 — "spins up the relativistic particle beams in the rim accelerator,
  // automatically scaling fluid gyro counter-torque to brace the crew cabin"
  SPINUP: { dur: 3.2, to: { ...ARMED_DRIVERS }, next: 'ARMED', ease: 'outCubic' },
  ARMED: { dur: 0, to: { ...ARMED_DRIVERS } },

  // Stage 2 — "commands the particle collision, activates the negative-energy
  // expansion, and drives the vessel forward through the space-time fold"
  COLLISION: {
    dur: 0.5,
    to: { ...ARMED_DRIVERS, collide: 1, fuseLoad: 0.9 },
    next: 'THROAT',
    ease: 'outQuad',
  },
  THROAT: {
    dur: 1.8,
    to: { ...ARMED_DRIVERS, collide: 0, throat: 1, foldWarp: 1, hgRate: 1.35, fuseLoad: 0.7 },
    next: 'TRANSIT',
    ease: 'inOutCubic',
  },
  TRANSIT: {
    dur: 1.7,
    to: { ...ARMED_DRIVERS, throat: 1, foldWarp: 1, transit: 1, hgRate: 1.2, fuseLoad: 0.5 },
    next: 'TRANSITED',
    ease: 'inOutCubic',
  },
  TRANSITED: { dur: 0, to: { ...ARMED_DRIVERS, throat: 0, foldWarp: 0.2, transit: 1, hgRate: 0.6 } },

  // Spin-down never snaps: a snap reads as a crash.
  SPINDOWN: { dur: 2.0, to: { ...IDLE_DRIVERS }, next: 'IDLE', ease: 'inOutCubic' },
  RESETTING: { dur: 0.6, to: { ...IDLE_DRIVERS }, next: 'IDLE', ease: 'inOutCubic' },
};

const EASES = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** Label for the primary button in each state. */
export function primaryLabel(state) {
  if (state === 'IDLE' || state === 'SPINDOWN' || state === 'RESETTING') return 'Spin up';
  if (state === 'SPINUP') return 'Spinning up…';
  if (state === 'ARMED') return 'Full depress';
  if (state === 'TRANSITED') return 'Reset';
  return 'Transiting…';
}

/** Short human-readable status line, sufficient on its own without the visuals. */
export function readout(state, d) {
  const pct = (v) => Math.round(v * 100);
  switch (state) {
    case 'IDLE':
      return 'Standby — gyro loop at idle circulation, beams cold.';
    case 'SPINUP':
      return `Stage 1 — beams ${pct(d.beamRate)}% of nominal, counter-torque ${pct(d.torque)}%.`;
    case 'ARMED':
      return 'Armed — beams v≈c, counter-torque 100%. Full depress to commit.';
    case 'COLLISION':
      return 'Stage 2 — particle collision commanded; fuse bay holding at 90% load.';
    case 'THROAT':
      return `Negative-energy expansion — throat at ${pct(d.throat)}% of maximum aperture.`;
    case 'TRANSIT':
      return `Transiting the fold — ${pct(d.transit)}% through the aperture.`;
    case 'TRANSITED':
      return 'Transit complete — throat collapsed, gyro loop settling.';
    case 'SPINDOWN':
      return `Aborting — beams ${pct(d.beamRate)}% and falling.`;
    case 'RESETTING':
      return 'Resetting to standby.';
    default:
      return '';
  }
}

export function createSequence({ onState } = {}) {
  const drivers = { ...IDLE_DRIVERS };
  let state = 'IDLE';
  let from = { ...IDLE_DRIVERS };
  let elapsed = 0;
  let reduced = false;

  const keys = Object.keys(IDLE_DRIVERS);

  function enter(next) {
    state = next;
    from = { ...drivers };
    elapsed = 0;
    const spec = STATES[state];
    if (effDur(spec) === 0) Object.assign(drivers, spec.to);
    onState?.(state, drivers);
  }

  // Reduced motion collapses every transition to a short crossfade: the change
  // stays perceivable, but nothing travels.
  function effDur(spec) {
    if (!spec.dur) return 0;
    return reduced ? 0.15 : spec.dur;
  }

  function update(dt) {
    const spec = STATES[state];
    const dur = effDur(spec);
    if (dur === 0) return false;

    elapsed += dt;
    const t = Math.min(1, elapsed / dur);
    const e = (reduced ? EASES.linear : EASES[spec.ease] || EASES.linear)(t);
    for (const k of keys) drivers[k] = from[k] + (spec.to[k] - from[k]) * e;

    if (t >= 1) {
      if (spec.next) enter(spec.next);
      else onState?.(state, drivers);
    }
    return true; // still animating
  }

  return {
    drivers,
    get state() {
      return state;
    },
    /** True while a timed transition is in flight. */
    get running() {
      return effDur(STATES[state]) > 0;
    },
    update,
    setReducedMotion(v) {
      reduced = !!v;
    },
    /** Advance the trigger: IDLE -> stage 1, ARMED -> stage 2, TRANSITED -> reset. */
    press() {
      if (state === 'IDLE' || state === 'SPINDOWN' || state === 'RESETTING') enter('SPINUP');
      else if (state === 'ARMED') enter('COLLISION');
      else if (state === 'TRANSITED') enter('RESETTING');
      return state;
    },
    /** Abort is only meaningful before the collision is commanded. */
    get canAbort() {
      return state === 'SPINUP' || state === 'ARMED';
    },
    abort() {
      if (state === 'SPINUP' || state === 'ARMED') enter('SPINDOWN');
      return state;
    },
    reset() {
      enter('RESETTING');
      return state;
    },
  };
}
