// COPPERLINE — the entry program (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files a
// browser loads as ES modules, three.js arriving through the import map in
// game/index.html. This program hands it in — it copies game/ and
// screenshots/ to the output directory and writes dossier.json there with
// buildDossier from the vendored make.fun library, so the dossier is exactly
// the one the scorer would build from the same files.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's sandbox, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (reference/gate.json): the dossier text the
// judge reads is capped at 163,840 bytes; screenshots at 4 files of 256 KiB;
// game/ at 993 entries and 48 MiB. buildDossier is given the same numbers so
// what is handed in is what the gate would compute.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

// A hand-in manifest on stdout: every file that was handed in, with its
// size, so a build log shows at a glance that the game, the four
// screenshots and the dossier all made it — and what each one weighs
// against the caps above.
function listFiles(dir, prefix = '') {
  const rows = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) rows.push(...listFiles(path, `${prefix}${name}/`));
    else rows.push([`${prefix}${name}`, statSync(path).size]);
  }
  return rows;
}

const manifest = listFiles(out);
let totalBytes = 0;
for (const [name, size] of manifest) {
  totalBytes += size;
  console.log(`  ${name} — ${size} bytes`);
}
console.log(`COPPERLINE handed in: ${manifest.length} files, ${totalBytes} bytes total.`);
