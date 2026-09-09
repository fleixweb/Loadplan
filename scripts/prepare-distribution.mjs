// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Fleix. Additional terms: ../ADDITIONAL_TERMS.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
for (const name of ['LICENSE', 'NOTICE', 'ADDITIONAL_TERMS.md']) {
  fs.copyFileSync(path.join(root, name), path.join(publicDir, name));
}
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const notices = ['Third-party components retain the licenses reproduced below.\n'];
for (const [location, meta] of Object.entries(lock.packages)) {
  if (!location || meta.dev || meta.optional) continue;
  const dir = path.join(root, location);
  if (!fs.existsSync(dir)) throw new Error(`Missing dependency: ${location}. Run npm ci.`);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const files = fs.readdirSync(dir).filter(name => /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(name) && fs.statSync(path.join(dir,name)).isFile());
  if (!files.length) {
    // Some packages publish notices only in README or package metadata.
    files.push('package.json', ...fs.readdirSync(dir).filter(name => /^readme/i.test(name)));
  }
  notices.push(`\n${'='.repeat(72)}\n${pkg.name} ${pkg.version} (${pkg.license ?? 'see below'})\n`);
  for (const name of files) notices.push(fs.readFileSync(path.join(dir,name),'utf8'));
}
fs.writeFileSync(path.join(publicDir,'third-party-notices.txt'),notices.join('\n').replace(/[ \t]+$/gm,'').replace(/^={7}$/gm,'-------'));

// Explicit project directories only: never include .git, secrets or local outputs.
const archive = {};
function add(relative) {
  const absolute = path.join(root, relative);
  if (fs.statSync(absolute).isDirectory()) {
    for (const name of fs.readdirSync(absolute)) {
      if (name.startsWith('.') || ['source.zip','target','gen'].includes(name)) continue;
      add(`${relative}/${name}`);
    }
  } else archive[`container-planner/${relative}`] = new Uint8Array(fs.readFileSync(absolute));
}
for (const name of ['src','src-tauri','tests','docs','scripts','public','.github','README.md','LICENSE','NOTICE','ADDITIONAL_TERMS.md','package.json','package-lock.json','index.html','license.html','vite.config.ts','vercel.json','tsconfig.json','playwright.config.ts']) add(name);
fs.writeFileSync(path.join(publicDir,'source.zip'),zipSync(archive));
console.log('Prepared licenses, third-party notices and corresponding source archive.');
