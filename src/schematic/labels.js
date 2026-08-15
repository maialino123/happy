/**
 * Leader labels, drawn as real DOM through CSS2DRenderer.
 *
 * Real elements inherit --font-data, --ink-dim, letter-spacing and uppercase
 * from the page's existing .sk-label rules, so they re-theme with no JS, stay
 * selectable, and land in the accessibility tree. Canvas-texture sprites would
 * need re-rasterizing on every theme change and would never match the page's
 * font rendering.
 *
 * Positions come from annotations.js, the same source the leader lines use.
 */

import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ANNOTATIONS, THROAT_ANNOTATION } from './annotations.js';

function makeLabel(spec) {
  const el = document.createElement('span');
  el.className = `ltv-label${spec.key ? ' is-key' : ''}`;
  el.textContent = spec.text;
  const obj = new CSS2DObject(el);
  obj.position.set(spec.to[0], spec.to[1], 0);
  // The dot sits on the anchor side, so the text always runs away from the leader.
  if (spec.side === 'left') {
    el.classList.add('is-left');
    obj.center.set(1, 0.5);
  } else {
    obj.center.set(0, 0.5);
  }
  return obj;
}

export function createLabels({ views, container }) {
  const renderer = new CSS2DRenderer({ element: container });
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.pointerEvents = 'none';

  const byView = { A: [], B: [], C: [] };
  for (const key of ['A', 'B', 'C']) {
    for (const spec of ANNOTATIONS[key]) {
      const obj = makeLabel(spec);
      views[key].group.add(obj);
      byView[key].push(obj);
    }
    // The aperture label lives inside the throat group, so it appears only
    // while the wormhole is actually open.
    if (views[key].throat) {
      const obj = makeLabel(THROAT_ANNOTATION);
      views[key].throat.group.add(obj);
      byView[key].push(obj);
    }
  }

  return {
    renderer,
    setSize(w, h) {
      renderer.setSize(w, h);
    },
    /** CSS2DObject does not inherit material opacity, so the crossfade drives
     *  the element's own opacity. */
    setOpacity(view, k) {
      for (const l of byView[view]) l.element.style.opacity = String(k);
    },
    setVisible(view, v) {
      for (const l of byView[view]) l.visible = v;
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    },
  };
}
