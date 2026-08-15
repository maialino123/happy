/**
 * Entry point. Boots the schematic into #ltv-stage, or leaves the static SVG
 * fallback in place if WebGL is unavailable.
 */

import * as THREE from 'three';
import { buildViews } from './views.js';
import { createCamera2D } from './camera2d.js';
import { createLabels } from './labels.js';
import { initTheme, applyTheme } from './theme.js';
import { createSequence, primaryLabel, readout } from './sequence.js';

const FADE = 0.32; // seconds
const TEST = /(?:^|[?&])ltvtest=1(?:&|$)/.test(location.search);

function boot() {
  const stage = document.getElementById('ltv-stage');
  const canvas = document.getElementById('ltv-canvas');
  const labelHost = document.getElementById('ltv-labels');
  const fallback = document.getElementById('ltv-fallback');
  if (!stage || !canvas || !labelHost) return;

  const ui = {
    primary: document.getElementById('ltv-primary'),
    abort: document.getElementById('ltv-abort'),
    fit: document.getElementById('ltv-fit'),
    status: document.getElementById('ltv-status'),
    telemetry: document.getElementById('ltv-telemetry'),
    viewBtns: [...document.querySelectorAll('[data-ltv-view]')],
  };

  // Render-loop state, declared up front: initTheme() applies synchronously and
  // the camera's ResizeObserver can fire during construction, so invalidate()
  // is reachable well before the loop section below.
  let raf = null;
  let last = 0;
  let time = 0;
  let frames = 0;
  let onScreen = true;

  /* ------------------------------------------------------------ renderer -- */

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: TEST,
      powerPreference: 'low-power',
    });
  } catch (err) {
    console.warn('[LTV] WebGL unavailable, keeping the static plate.', err);
    window.__LTV = { ready: true, webgl: false, reason: String(err) };
    return;
  }

  renderer.setClearColor(0x000000, 0); // CSS paints the ground, so the canvas
  renderer.localClippingEnabled = true; // background tracks the theme for free

  function showFallback() {
    if (fallback) fallback.hidden = false;
    stage.hidden = true;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showFallback();
  });

  if (fallback) fallback.hidden = true;
  stage.hidden = false;

  /* --------------------------------------------------------------- scene -- */

  const scene = new THREE.Scene();
  const built = buildViews();
  const { views } = built;
  for (const k of ['A', 'B', 'C']) scene.add(views[k].group);

  const labels = createLabels({ views, container: labelHost });

  const motionMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const seq = createSequence({
    onState(state, d) {
      // aria-live updated on state change only: a live region refreshed at
      // 60 Hz floods a screen reader.
      if (ui.status) ui.status.textContent = readout(state, d);
      if (ui.primary) {
        ui.primary.textContent = primaryLabel(state);
        ui.primary.disabled = !(state === 'IDLE' || state === 'ARMED' || state === 'TRANSITED');
      }
      if (ui.abort) ui.abort.disabled = !seq.canAbort;
      invalidate();
    },
  });
  seq.setReducedMotion(motionMQ.matches);

  // Declared before construction: the ResizeObserver inside createCamera2D can
  // fire its first callback before the constructor returns, and resize() would
  // otherwise hit the temporal dead zone.
  let cam = null;
  cam = createCamera2D({
    canvas,
    stage,
    onChange(isResize) {
      if (isResize) resize();
      invalidate();
    },
  });

  /* --------------------------------------------------------------- theme -- */

  initTheme((values) => {
    built.applyThemeColors(values);
    invalidate();
  });

  /* -------------------------------------------------------------- layout -- */

  let dprMQ = null;
  function watchDpr() {
    dprMQ?.removeEventListener('change', onDpr);
    dprMQ = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMQ.addEventListener('change', onDpr, { once: true });
  }
  function onDpr() {
    resize();
    watchDpr();
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h || !cam) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false); // false: the stylesheet owns the CSS size
    labels.setSize(w, h);
    cam.setSize(w, h);
  }

  /* --------------------------------------------------------- view switch -- */

  let current = 'A';
  let fade = null;

  function setGroupOpacity(key, k) {
    views[key].group.traverse((o) => {
      const m = o.material;
      if (m && !Array.isArray(m)) m.opacity = (m.userData.baseOpacity ?? 1) * k;
    });
    labels.setOpacity(key, k);
  }

  function setView(next, { immediate = false } = {}) {
    if (!views[next] || next === current) return;
    const from = current;
    current = next;
    views[next].group.visible = true;
    cam.setFrame(views[next].frame);
    ui.viewBtns.forEach((b) => {
      const on = b.dataset.ltvView === next;
      b.setAttribute('aria-selected', String(on));
    });
    if (immediate || motionMQ.matches) {
      views[from].group.visible = false;
      labels.setVisible(from, false);
      setGroupOpacity(next, 1);
      fade = null;
    } else {
      fade = { from, to: next, t: 0 };
    }
    invalidate();
  }

  for (const k of ['A', 'B', 'C']) {
    views[k].group.visible = k === current;
    labels.setVisible(k, k === current);
    setGroupOpacity(k, k === current ? 1 : 0);
  }
  cam.setFrame(views.A.frame);

  /* ---------------------------------------------------------------- loop -- */

  const io = new IntersectionObserver(
    ([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) invalidate();
    },
    { rootMargin: '120px' }
  );
  io.observe(stage);

  function shouldAnimate() {
    if (document.visibilityState !== 'visible' || !onScreen) return false;
    return !motionMQ.matches || seq.running || !!fade;
  }

  function invalidate() {
    if (raf == null) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = null;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;

    seq.update(dt);
    built.update(dt, time, seq.drivers);

    if (fade) {
      fade.t = Math.min(1, fade.t + dt / FADE);
      setGroupOpacity(fade.from, 1 - fade.t);
      setGroupOpacity(fade.to, fade.t);
      if (fade.t >= 1) {
        views[fade.from].group.visible = false;
        labels.setVisible(fade.from, false);
        labels.setVisible(fade.to, true);
        fade = null;
      }
    } else {
      setGroupOpacity(current, 1);
    }

    renderer.render(scene, cam.camera);
    labels.render(scene, cam.camera);
    frames++;

    if (ui.telemetry) {
      const d = seq.drivers;
      ui.telemetry.textContent =
        `beam ${Math.round(d.beamRate * 100)}%  ·  ` +
        `torque ${Math.round(d.torque * 100)}%  ·  ` +
        `Hg ${Math.round(d.hgRate * 100)}%  ·  ` +
        `throat ${Math.round(d.throat * 42)} m`;
    }

    if (shouldAnimate()) raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ ui -- */

  ui.primary?.addEventListener('click', () => {
    seq.press();
    invalidate();
  });
  ui.abort?.addEventListener('click', () => {
    seq.abort();
    invalidate();
  });
  ui.fit?.addEventListener('click', () => cam.fit());
  ui.viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.ltvView)));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === '1') setView('A');
    else if (e.key === '2') setView('B');
    else if (e.key === '3') setView('C');
    else if (e.key === 'Escape' && seq.canAbort) seq.abort();
    else return;
    invalidate();
  });

  document.addEventListener('visibilitychange', invalidate);
  motionMQ.addEventListener('change', () => {
    seq.setReducedMotion(motionMQ.matches);
    invalidate();
  });

  /* ---------------------------------------------------------------- boot -- */

  watchDpr();
  resize();
  applyTheme();
  if (ui.status) ui.status.textContent = readout(seq.state, seq.drivers);
  if (ui.primary) ui.primary.textContent = primaryLabel(seq.state);
  if (ui.abort) ui.abort.disabled = true;
  invalidate();

  window.__LTV = {
    ready: true,
    webgl: true,
    seq,
    cam,
    setView,
    get view() {
      return current;
    },
    get frames() {
      return frames;
    },
    get fading() {
      return !!fade;
    },
    canvas,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
