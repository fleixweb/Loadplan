import fs from 'node:fs';
import path from 'node:path';
const [target,asset]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(target??'') || !/^Loadplan-[\w-]+\.(exe|dmg)$/.test(asset??'')) throw new Error('Invalid release arguments');
const root=`src-tauri/target/${target}/release/bundle`;
const matches=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(p.endsWith(path.extname(asset)))matches.push(p);}}
walk(root);
if(matches.length!==1)throw new Error(`Expected one installer, found ${matches.length}`);
fs.mkdirSync('release-files',{recursive:true});
fs.copyFileSync(matches[0],`release-files/${asset}`);
if(target==='x86_64-pc-windows-msvc'){
  fs.copyFileSync('public/source.zip','release-files/Loadplan-source.zip');
  fs.copyFileSync('LICENSE','release-files/LICENSE.txt');
  fs.copyFileSync('ADDITIONAL_TERMS.md','release-files/ADDITIONAL_TERMS.md');
  fs.copyFileSync('public/third-party-notices.txt','release-files/third-party-notices.txt');
  fs.copyFileSync('public/rust-third-party-notices.txt','release-files/rust-third-party-notices.txt');
}
