/**
 * LTV Mk. II — schematic parameters.
 *
 * Every dimension in the drawing derives from these. Schematic unit: the hull
 * semi-diameter R = 100. Nothing here imports anything, so the numbers can be
 * asserted in bare node without a browser.
 *
 * Layer descriptors are { rs, hs, es, p }:
 *   rs  radius scale     (fraction of R)
 *   hs  height scale     (fraction of H, the centreline semi-thickness)
 *   es  rim-edge scale   (fraction of RIM_T/2, the half-thickness at the rim)
 *   p   shoulder exponent — p > 1 drives slope to zero at the rim, giving the
 *       lenticular shoulder; p < 1 would round the silhouette into a blimp.
 */

export const TAU = Math.PI * 2;

export const P = {
  // --- hull envelope -------------------------------------------------------
  R: 100, // rim radius
  H: 28, // semi-thickness at the centreline
  RIM_T: 7.2, // full hull thickness at the flat rim
  LENS_P: 1.45, // default shoulder exponent

  // --- tri-layered nano-matrix (spec §I), outermost first ------------------
  ENVELOPE: { rs: 1.075, hs: 1.3, es: 1.9, p: 1.25 }, // plasma flight envelope
  SKIN: { rs: 1.0, hs: 1.0, es: 1.0, p: 1.45 }, // smart catalytic skin
  MID: { rs: 0.955, hs: 0.8, es: 0.6, p: 1.45 }, // quartz fluid grid
  CORE: { rs: 0.79, hs: 0.585, es: 0.34, p: 1.6 }, // titanium pressure hull

  // --- rim-mounted synchrotron ring (spec §II) -----------------------------
  RIM_BORE_R: 2.6, // accelerator bore, seen in section (must fit inside RIM_T/2)
  BEAM_SEP: 2.0, // separation of the counter-rotating beams
  BEAM_R: 97.4, // beam centreline radius — in the rim band, outboard of MID

  // --- mercury gyro channel (spec §III) ------------------------------------
  HG_R: 54, // channel centreline radius — set for bore clearance inside CORE
  HG_W: 11, // channel width (radial)
  HG_SECT_R: 5.5, // channel bore radius, seen in section

  // --- zig-zag gold baffle ladder (spec §III) ------------------------------
  BAFFLE_N: 48, // teeth around the annulus
  BAFFLE_DEPTH: 0.62, // tooth depth as a fraction of channel width
  BAFFLE_SKEW: 0.35, // tip offset along theta, as a fraction of pitch
  HG_WEAVE: 0.3, // how far the flow path weaves off centreline

  // --- gyroscopic isolation cabin (spec §III) ------------------------------
  GIC_RX: 19,
  GIC_RY: 12,
  GIMBAL_RX: 26,
  GIMBAL_RY: 17,
  GIC_PLAN_R: 20,
  GIMBAL_PLAN_R: 27,

  // --- quantum-dot fuse bay (spec §IV) -------------------------------------
  FUSE_X: 34, // immediately outside the gimbal ring (spec §IV)
  FUSE_W: 11,
  FUSE_H: 11,
  FUSE_CELLS: 6,

  // --- power (spec §II) ----------------------------------------------------
  ZPE_R: 7,
  SPOKE_N: 24, // rim induction grid nanowire spokes
  COOLANT_RS: [0.88, 0.93], // superfluid cryogenic loop, as fractions of R

  // --- wormhole (spec §II) -------------------------------------------------
  THROAT_MAX_R: 42,
  THROAT_RINGS: 3,

  // --- flow ----------------------------------------------------------------
  SLUG_N: 72, // mercury slugs in the plan/developed views
  SLUG_R: 1.25,
  BRAKE: 0.42, // per-slug velocity modulation at each baffle tooth

  // --- tessellation --------------------------------------------------------
  SEG: 256,
};

/** Radial extents, outermost first, used for framing and for the ordering assertion. */
export const EXTENT = P.R * P.ENVELOPE.rs;
