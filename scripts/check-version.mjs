import fs from 'node:fs';
const version=JSON.parse(fs.readFileSync('package.json')).version;
const tauri=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json')).version;
const cargo=fs.readFileSync('src-tauri/Cargo.toml','utf8').match(/^version = "([^"]+)"/m)?.[1];
if(version!==tauri || version!==cargo) throw new Error('Update package.json, Cargo.toml and tauri.conf.json together.');
if(process.env.GITHUB_REF_TYPE==='tag' && process.env.GITHUB_REF_NAME!==`v${version}`) throw new Error('Tag does not match package version.');
console.log(`Version verified: ${version}`);
