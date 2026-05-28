#!/usr/bin/env node
// Patches specific ncc-compiled packages in next/dist/compiled/ that are shipped
// as external modules in the Edge v8-worker runtime but contain __dirname references.
//
// Context: Vercel packages certain compiled packages as external node_modules
// alongside middleware.func/middleware.js. When the v8-worker evaluates these
// files at startup, it throws ReferenceError: __dirname is not defined.
// Removing the __nccwpck_require__.ab assignment is safe — it only sets an asset
// base path for Node.js loading and is never used in the Edge runtime.
//
// Only specific files that are known Edge externals are patched to avoid breaking
// Node.js build tools (like jest-worker) that legitimately need __dirname.
const fs = require('fs');
const path = require('path');

const PATTERN = /if\(typeof __nccwpck_require__!=="undefined"\)__nccwpck_require__\.ab=__dirname\+"\/";/g;
const COMPILED_DIR = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'compiled');

// Files known to be packaged as Edge runtime externals that must not reference __dirname.
// ua-parser-js ends up in middleware.func/node_modules/ and is evaluated by the v8-worker.
const EDGE_EXTERNAL_FILES = [
  'ua-parser-js/ua-parser.js',
];

if (!fs.existsSync(COMPILED_DIR)) {
  process.exit(0);
}

let patched = 0;
for (const rel of EDGE_EXTERNAL_FILES) {
  const file = path.join(COMPILED_DIR, rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (!PATTERN.test(src)) continue;
  PATTERN.lastIndex = 0;
  fs.writeFileSync(file, src.replace(PATTERN, ''));
  patched++;
}

if (patched > 0) {
  console.log(`[patch-ncc-edge] Patched __dirname in ${patched} Edge external file(s)`);
}
