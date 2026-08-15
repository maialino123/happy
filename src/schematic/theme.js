/**
 * Canvas colours tracked against the page's CSS custom properties.
 *
 * No material in this project is ever given a literal colour. Each registers
 * against a token name, and applyTheme() walks the registry. That way the
 * schematic re-themes for free and can never drift from the chrome around it.
 *
 * NOTE: THREE.Color.set() parses hex, rgb() and named colours — it does NOT
 * parse oklch(), lab() or color(). If the token block in the page ever moves to
 * a modern colour space, this module has to convert first.
 */

import * as THREE from 'three';

const TOKENS = [
  '--ink',
  '--ink-dim',
  '--ink-faint',
  '--line',
  '--line-soft',
  '--gold',
  '--gold-soft',
  '--mercury',
  '--plasma',
  '--surface-2',
];

const registry = new Map(); // token -> [{ material }]
const glows = new Set(); // materials whose blending flips with the theme
const listeners = new Set();
let values = {};

export function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const t of TOKENS) out[t] = cs.getPropertyValue(t).trim();
  // The page exposes --is-dark so we never have to re-derive the cascade in JS:
  // the token block has three theme states and guessing from the media query
  // alone would miss the explicit data-theme overrides.
  out.isDark = cs.getPropertyValue('--is-dark').trim() === '1';
  return out;
}

/** Register a material against a token. Returns the material for chaining. */
export function themed(material, token) {
  if (!registry.has(token)) registry.set(token, []);
  registry.get(token).push(material);
  if (values[token]) material.color.set(values[token]);
  return material;
}

/**
 * Mark a material as a glow. Additive blending reads correctly on the dark
 * ground but pushes to white on the light one, where the glow would vanish —
 * so blending and opacity flip with the theme.
 */
export function glow(material, darkOpacity = 0.85, lightOpacity = 0.5) {
  glows.add({ material, darkOpacity, lightOpacity });
  return material;
}

export function isDark() {
  return !!values.isDark;
}

export function applyTheme() {
  values = readTokens();
  for (const [token, mats] of registry) {
    const hex = values[token];
    if (!hex) continue;
    for (const m of mats) m.color.set(hex);
  }
  for (const g of glows) {
    g.material.blending = values.isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    g.material.userData.baseOpacity = values.isDark ? g.darkOpacity : g.lightOpacity;
    g.material.needsUpdate = true;
  }
  for (const fn of listeners) fn(values);
}

/** Start watching both theme signals. Returns a teardown function. */
export function initTheme(onChange) {
  if (onChange) listeners.add(onChange);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onMq = () => applyTheme();
  mq.addEventListener('change', onMq);

  const obs = new MutationObserver(applyTheme);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  applyTheme();
  return () => {
    mq.removeEventListener('change', onMq);
    obs.disconnect();
    if (onChange) listeners.delete(onChange);
  };
}
