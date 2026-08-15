/**
 * Browser half of the verification suite.
 *
 * Written so a sandbox without working WebGL still produces a meaningful pass:
 * it asserts the static SVG fallback took over, which is itself a real test of
 * the fallback path. An environment quirk must not masquerade as a product bug.
 */

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, resolve, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serve(root) {
  return new Promise((res) => {
    const server = createServer(async (req, rep) => {
      try {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path === '/favicon.ico') return void rep.writeHead(204).end();
        let file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
        if (path.endsWith('/')) file = join(file, 'index.html');
        const body = await readFile(file);
        rep.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        rep.end(body);
      } catch {
        rep.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

/** Non-transparent pixel count, via a 2D copy (a WebGL canvas cannot be read directly). */
const PIXEL_PROBE = `(() => {
  const src = document.getElementById('ltv-canvas');
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
  return { lit, total: d.length / 4, url: src.toDataURL().slice(0, 20000) };
})()`;

/** Probe repeatedly: a resize clears the drawing buffer, so one sample can
 *  legitimately land between the clear and the next frame. */
async function probeLit(page, tries = 10) {
  let best = { lit: 0, total: 0, url: '' };
  for (let i = 0; i < tries; i++) {
    const p = await page.evaluate(PIXEL_PROBE);
    if (p.lit > best.lit) best = p;
    if (best.lit > 0) return best;
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    await page.waitForTimeout(120);
  }
  return best;
}

export async function runBrowserSuite({ ROOT, ok, section, mkdirSync, statSync }) {
  // playwright is not a dependency of this project: it ships with the
  // environment. Try a normal resolve first, then the global npm root, and skip
  // the suite cleanly if neither works.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    try {
      const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
      const mod = await import(pathToFileURL(join(root, 'playwright', 'index.js')).href);
      chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium) throw new Error('no chromium export');
    } catch (err) {
      return { skipped: `playwright not resolvable (${String(err).split('\n')[0]})` };
    }
  }

  const shots = resolve(ROOT, 'dist/shots');
  mkdirSync(shots, { recursive: true });

  const { server, port } = await serve(ROOT);
  const base = `http://127.0.0.1:${port}/docs/`;

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    });
  } catch {
    // Fall back to whatever build is available rather than reporting a product bug.
    browser = await chromium.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    });
  }

  const problems = [];
  async function newPage(ctx) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
    });
    return page;
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: 'dark' });
  const page = await newPage(ctx);

  try {
    /* ------------------------------------------------------------- boot -- */
    section('Browser — boot');
    await page.goto(base + '?ltvtest=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__LTV?.ready === true, null, { timeout: 20000 });
    const webgl = await page.evaluate(() => window.__LTV.webgl);
    ok('page boots and reports ready', true);

    if (!webgl) {
      const fbVisible = await page.isVisible('#ltv-fallback');
      const stageHidden = await page.evaluate(() => document.getElementById('ltv-stage').hidden);
      ok('WebGL unavailable — static plate took over', fbVisible && stageHidden);
      ok('no page errors', problems.length === 0, problems.join(' | '));
      return { skipped: 'no WebGL in this environment; fallback path asserted instead' };
    }

    ok('WebGL renderer initialised', true);
    ok('static fallback stepped aside', await page.evaluate(() => document.getElementById('ltv-fallback').hidden));

    /* ----------------------------------------------------------- render -- */
    section('Browser — render');
    const first = await page.evaluate(PIXEL_PROBE);
    ok('canvas actually drew something', first.lit > 500, `${first.lit} lit pixels of ${first.total}`);

    await page.evaluate(() => window.__LTV.seq.press());
    await page.waitForTimeout(450);
    const second = await page.evaluate(PIXEL_PROBE);
    ok('pixels change while animating', first.url !== second.url);
    ok('spin-up is running', await page.evaluate(() => window.__LTV.seq.state) === 'SPINUP');

    /* --------------------------------------------------------- sequence -- */
    section('Browser — two-stage sequence');
    // dt is clamped to 1/20 s per frame, so on a slow rasterizer sequence time
    // advances well behind wall clock. These ceilings are generous by design.
    await page.waitForFunction(() => window.__LTV.seq.state === 'ARMED', null, { timeout: 60000 });
    ok('stage 1 reaches ARMED in the browser clock', true);

    await page.screenshot({ path: join(shots, 'A-dark-armed.png') });

    await page.evaluate(() => window.__LTV.seq.press());
    await page.waitForFunction(() => window.__LTV.seq.state === 'THROAT', null, { timeout: 60000 });
    await page.screenshot({ path: join(shots, 'A-dark-throat.png') });
    ok('stage 2 opens the throat', true);

    await page.waitForFunction(() => window.__LTV.seq.state === 'TRANSITED', null, { timeout: 90000 });
    ok('transit completes in the browser', true);
    const transited = await page.evaluate(PIXEL_PROBE);
    ok('craft is clipped away after transit', transited.lit < first.lit, `${transited.lit} vs ${first.lit} lit`);

    await page.evaluate(() => window.__LTV.seq.reset());
    await page.waitForFunction(() => window.__LTV.seq.state === 'IDLE', null, { timeout: 60000 });
    ok('reset returns to standby', true);

    /* ------------------------------------------------------------ views -- */
    section('Browser — projections & themes');
    for (const v of ['A', 'B', 'C']) {
      await page.evaluate((k) => window.__LTV.setView(k), v);
      await page.waitForFunction(() => window.__LTV.fading === false, null, { timeout: 20000 });
      const p = await probeLit(page);
      ok(`view ${v} renders`, p.lit > 300, `${p.lit} lit pixels`);
      await page.screenshot({ path: join(shots, `${v}-dark.png`) });
    }

    // Force the theme both ways: the token block has three states, and only
    // exercising the media query would miss the explicit data-theme overrides.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(200);
    ok('light via media query is picked up', await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--is-dark').trim() === '0'));
    await page.evaluate(() => window.__LTV.setView('B'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(shots, 'B-light.png') });
    const lightPix = await probeLit(page);
    ok('canvas still draws on the light ground', lightPix.lit > 300, `${lightPix.lit} lit pixels`);

    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await page.waitForTimeout(200);
    ok('data-theme override beats the media query', await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--is-dark').trim() === '1'));
    await page.evaluate(() => delete document.documentElement.dataset.theme);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    ok('dark ground restored', await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--is-dark').trim() === '1'));

    /* ----------------------------------------------------------- resize -- */
    section('Browser — resize');
    // Regression guard for LineMaterial.resolution: if three ever drops the
    // onBeforeRender auto-update, fat lines collapse to nothing and this fails.
    await page.evaluate(() => window.__LTV.setView('A'));
    // Keep the plate on screen: the loop parks when the stage scrolls out, and
    // waiting on a fixed sleep is unreliable at software-rasterizer frame rates.
    const settle = async () => {
      await page.evaluate(() => document.getElementById('ltv-stage').scrollIntoView({ block: 'center' }));
      const start = await page.evaluate(() => window.__LTV.frames);
      await page.waitForFunction((f) => window.__LTV.frames > f + 2, start, { timeout: 20000 });
    };
    await page.setViewportSize({ width: 1400, height: 900 });
    await settle();
    const wide = await probeLit(page);
    ok('renders after growing the viewport', wide.lit > 300, `${wide.lit} lit pixels`);

    await page.setViewportSize({ width: 380, height: 700 });
    await settle();
    const narrow = await probeLit(page);
    ok('renders after collapsing to mobile', narrow.lit > 200, `${narrow.lit} lit pixels`);
    await page.screenshot({ path: join(shots, 'A-mobile.png') });

    const sized = await page.evaluate(() => {
      const c = document.getElementById('ltv-canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      return Math.abs(c.width - Math.round(c.clientWidth * dpr)) <= 1;
    });
    ok('backing store matches CSS size × DPR', sized);
    await page.setViewportSize({ width: 1280, height: 820 });

    /* -------------------------------------------------- reduced motion -- */
    section('Browser — reduced motion');
    const rmCtx = await browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
    const rm = await newPage(rmCtx);
    await rm.goto(base + '?ltvtest=1', { waitUntil: 'load' });
    await rm.waitForFunction(() => window.__LTV?.ready === true, null, { timeout: 20000 });
    // Wait for quiescence rather than a fixed sleep: boot and a late reflow
    // legitimately draw a few frames, and sampling across them is what made an
    // earlier version of this check flaky. Once the count stops moving, a truly
    // parked loop draws exactly zero more.
    const frames = () => rm.evaluate(() => window.__LTV.frames);
    let prev = -1;
    let cur = await frames();
    for (let i = 0; i < 12 && cur !== prev; i++) {
      prev = cur;
      await rm.waitForTimeout(1000);
      cur = await frames();
    }
    const f0 = cur;
    await rm.waitForTimeout(1500);
    const f1 = await frames();
    ok('idle animation is parked under reduced motion', f1 === f0, `frames ${f0} -> ${f1}`);
    await rm.evaluate(() => window.__LTV.seq.press());
    await rm.waitForFunction(() => window.__LTV.seq.state === 'ARMED', null, { timeout: 30000 });
    ok('the sequence still runs when explicitly triggered', true);
    ok('drivers still reach terminal values', await rm.evaluate(() => window.__LTV.seq.drivers.beamRate > 0.99));
    await rmCtx.close();

    /* ------------------------------------------------ artifact isolation -- */
    section('Browser — artifact isolation');
    const artifact = resolve(ROOT, 'dist/ltv-artifact.html');
    const isoCtx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    // Exactly the artifact CSP: nothing may leave the file.
    await isoCtx.route('**', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
    const iso = await newPage(isoCtx);
    await iso.goto(pathToFileURL(artifact).href + '?ltvtest=1', { waitUntil: 'load' });
    await iso.waitForFunction(() => window.__LTV?.ready === true, null, { timeout: 20000 });
    ok('artifact boots with every external request blocked', await iso.evaluate(() => window.__LTV.webgl === true));
    const isoPix = await probeLit(iso);
    ok('artifact canvas renders', isoPix.lit > 500, `${isoPix.lit} lit pixels`);
    await iso.evaluate(() => window.__LTV.seq.press());
    await iso.waitForFunction(() => window.__LTV.seq.state === 'ARMED', null, { timeout: 60000 });
    ok('artifact sequence runs', true);
    await iso.screenshot({ path: join(shots, 'artifact-armed.png') });
    await isoCtx.close();

    const bytes = statSync(artifact).size;
    const pct = (bytes / (16 * 1024 * 1024)) * 100;
    console.log(`  · artifact size: ${(bytes / 1024 / 1024).toFixed(2)} MB (${pct.toFixed(1)}% of the 16 MB ceiling)`);
    ok('artifact is within the publish ceiling', bytes < 16 * 1024 * 1024);

    section('Browser — errors');
    ok('no page errors or console errors anywhere', problems.length === 0, problems.slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  return {};
}
