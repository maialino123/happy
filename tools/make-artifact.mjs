/**
 * Produces the self-contained artifact build.
 *
 * The Artifact CSP blocks every external host, so the page must carry
 * everything inline. It is also wrapped in its own doctype/head/body skeleton
 * at publish time, so this strips ours and emits title + style + body content.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = resolve(ROOT, 'docs/index.html');
const BUNDLE = resolve(ROOT, 'docs/vendor/ltv-schematic.bundle.js');
const OUT = resolve(ROOT, 'dist/ltv-artifact.html');

const SCRIPT_TAG = '<script defer src="./vendor/ltv-schematic.bundle.js"></script>';

export function makeArtifact({ quiet = false } = {}) {
  const page = readFileSync(PAGE, 'utf8');
  const bundle = readFileSync(BUNDLE, 'utf8');

  const title = page.match(/<title>[\s\S]*?<\/title>/i)?.[0];
  const style = page.match(/<style>[\s\S]*?<\/style>/i)?.[0];
  const body = page.match(/<body>([\s\S]*?)<\/body>/i)?.[1];
  if (!title || !style || !body) throw new Error('could not extract title/style/body from docs/index.html');
  if (!body.includes(SCRIPT_TAG)) throw new Error(`expected script tag not found: ${SCRIPT_TAG}`);

  // Unconditional: inside JS this is an identical string literal, and it
  // removes any chance of a premature </script> ending the block.
  const safe = bundle.replaceAll('</script', () => '<\\/script');

  // Replacement MUST be a function. A minified bundle is full of $& / $' / $`
  // sequences, and with a string replacement those are substitution patterns —
  // $& would splice the original <script src> tag straight back into the page.
  const inlined = body.replace(SCRIPT_TAG, () => `<script>\n${safe}\n</script>`);

  const out = [title, style, inlined].join('\n');

  // The artifact must not reach for anything off-host.
  const banned = [/src=["']https?:/i, /href=["']https?:/i, /@import\s+url\(\s*["']?https?:/i, /<link[^>]+href=["']https?:/i];
  for (const re of banned) {
    const hit = out.match(re);
    if (hit) throw new Error(`artifact references an external host: ${hit[0]}`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out, 'utf8');

  const bytes = statSync(OUT).size;
  if (!quiet) {
    console.log(`wrote dist/ltv-artifact.html — ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`);
    console.log(`Artifact ceiling is 16 MB; this is ${((bytes / (16 * 1024 * 1024)) * 100).toFixed(1)}% of it.`);
  }
  return { path: OUT, bytes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  makeArtifact();
}
