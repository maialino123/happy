/**
 * Orthographic 2D camera with zoom, pan and per-view framing.
 *
 * Hand-rolled rather than OrbitControls: we need clamped pan and per-view fit
 * regardless, one-finger pan is the expected gesture for a schematic (Orbit
 * maps that to rotate), and dropping the dependency keeps the inlined artifact
 * build smaller.
 */

import * as THREE from 'three';

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 16;
const ZOOM_K = 0.0016;

export function createCamera2D({ canvas, stage, onChange }) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  camera.position.set(0, 0, 100);

  // Framing for the current view: world half-height, and the extents pan is
  // clamped to so a flung pointer can never lose the craft off-screen.
  let frame = { halfHeight: 80, halfWidth: 0, bounds: { x: 140, y: 90 }, center: { x: 0, y: 0 } };
  let width = 1;
  let height = 1;
  let effHalfHeight = 80;

  function applyProjection() {
    const aspect = width / height || 1;
    // Frame by whichever dimension binds. Without this the subject is cropped
    // on narrow viewports, where the plate goes from 20:9 to 4:3.
    effHalfHeight = Math.max(frame.halfHeight, (frame.halfWidth || 0) / aspect);
    camera.left = -effHalfHeight * aspect;
    camera.right = effHalfHeight * aspect;
    camera.top = effHalfHeight;
    camera.bottom = -effHalfHeight;
    camera.updateProjectionMatrix();
  }

  function setSize(w, h) {
    width = w;
    height = h;
    applyProjection();
  }

  function setFrame(next, { keepView = false } = {}) {
    frame = { ...frame, ...next };
    applyProjection();
    if (!keepView) fit();
    else clampPan();
  }

  function fit() {
    camera.zoom = 1;
    camera.position.x = frame.center.x;
    camera.position.y = frame.center.y;
    camera.updateProjectionMatrix();
    onChange?.();
  }

  function clampPan() {
    const halfW = (camera.right - camera.left) / 2 / camera.zoom;
    const halfH = effHalfHeight / camera.zoom;
    // Allow the view to reach the extents but not wander past them. When the
    // whole subject already fits, lock to its centre.
    const mx = Math.max(0, frame.bounds.x - halfW);
    const my = Math.max(0, frame.bounds.y - halfH);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, frame.center.x - mx, frame.center.x + mx);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, frame.center.y - my, frame.center.y + my);
  }

  function screenToWorld(clientX, clientY, out = new THREE.Vector2()) {
    const r = canvas.getBoundingClientRect();
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = -(((clientY - r.top) / r.height) * 2 - 1);
    out.x = camera.position.x + (ndcX * (camera.right - camera.left)) / 2 / camera.zoom;
    out.y = camera.position.y + (ndcY * (camera.top - camera.bottom)) / 2 / camera.zoom;
    return out;
  }

  function zoomAt(clientX, clientY, factor) {
    const before = screenToWorld(clientX, clientY);
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    camera.updateProjectionMatrix();
    const after = screenToWorld(clientX, clientY);
    camera.position.x += before.x - after.x;
    camera.position.y += before.y - after.y;
    clampPan();
    onChange?.();
  }

  /* ------------------------------------------------------------- input -- */

  // A non-passive wheel handler mid-document would hijack page scroll, and the
  // plate sits inside a long dossier. So a bare wheel scrolls the page as
  // usual; zoom needs either the modifier or focus on the canvas.
  function onWheel(e) {
    const wantsZoom = e.ctrlKey || e.metaKey || document.activeElement === canvas;
    if (!wantsZoom) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * ZOOM_K));
  }

  const pointers = new Map();
  let pinchDist = 0;
  let pinchMid = null;

  function onPointerDown(e) {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  function onPointerMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchDist > 0) {
        zoomAt(mid.x, mid.y, dist / pinchDist);
        panByPixels(mid.x - pinchMid.x, mid.y - pinchMid.y);
      }
      pinchDist = dist;
      pinchMid = mid;
      return;
    }

    panByPixels(cur.x - prev.x, cur.y - prev.y);
  }

  function panByPixels(dxPx, dyPx) {
    const wpp = (camera.right - camera.left) / camera.zoom / (canvas.clientWidth || 1);
    camera.position.x -= dxPx * wpp;
    camera.position.y += dyPx * wpp;
    clampPan();
    onChange?.();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchDist = 0;
      pinchMid = null;
    }
  }

  function onKeyDown(e) {
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (e.key === '+' || e.key === '=') zoomAt(cx, cy, 1.25);
    else if (e.key === '-' || e.key === '_') zoomAt(cx, cy, 1 / 1.25);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  }

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('dblclick', fit);
  canvas.addEventListener('keydown', onKeyDown);

  /* ------------------------------------------------------------ resize -- */

  // ResizeObserver on the stage, not window.resize: the dossier collapses its
  // rail at 900px and the plate reflows inside a max-width grid, so the element
  // can change size with no window event at all.
  const ro = new ResizeObserver(() => onChange?.(true));
  ro.observe(stage);

  return {
    camera,
    setSize,
    setFrame,
    fit,
    zoomAt,
    screenToWorld,
    get zoom() {
      return camera.zoom;
    },
    dispose() {
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('dblclick', fit);
      canvas.removeEventListener('keydown', onKeyDown);
    },
  };
}
