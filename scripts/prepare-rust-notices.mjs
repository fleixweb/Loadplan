// Copyright (C) 2026 Fleix. AGPL-3.0-only; see ../ADDITIONAL_TERMS.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const metadata=JSON.parse(execFileSync('cargo',['metadata','--manifest-path','src-tauri/Cargo.toml','--locked','--format-version','1'],{maxBuffer:64*1024*1024,stdio:['ignore','pipe','inherit']}).toString());
const texts=['Rust desktop dependencies. Each component retains its original license.\n'];
for(const pkg of metadata.packages){
  if(!pkg.source)continue;
  const dir=path.dirname(pkg.manifest_path);
  texts.push(`\n--- ${pkg.name} ${pkg.version} (${pkg.license ?? 'see package notices'}) ---\n`);
  let files=fs.readdirSync(dir).filter(n=>/^(license|licence|copying|copyright|notice)(\.|-|$)/i.test(n) && fs.statSync(path.join(dir,n)).isFile());
  if(pkg.license_file && fs.existsSync(path.join(dir,pkg.license_file)))files.push(pkg.license_file);
  if(!files.length) files=fs.readdirSync(dir).filter(n=>/^readme/i.test(n) && fs.statSync(path.join(dir,n)).isFile());
  for(const file of new Set(files))texts.push(fs.readFileSync(path.join(dir,file),'utf8'));
}
fs.writeFileSync('public/rust-third-party-notices.txt',texts.join('\n').replace(/[ \t]+$/gm,'').replace(/^={7}$/gm,'-------'));
console.log(`Prepared notices for ${metadata.packages.length} Rust packages.`);
