// Copyright (C) 2026 Fleix. AGPL-3.0-only; see ADDITIONAL_TERMS.md.
import { installDesktopLinks, isDesktop } from './platform/files';
installDesktopLinks();
if (isDesktop()) {
  document.addEventListener('click', event => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a');
    const href = anchor?.getAttribute('href');
    if (!href || !['LICENSE','NOTICE','ADDITIONAL_TERMS.md','third-party-notices.txt','rust-third-party-notices.txt'].includes(href)) return;
    event.preventDefault();
    void fetch(href).then(r => {if (!r.ok) throw new Error();return r.text();}).then(content => {
      const dialog=document.createElement('dialog');dialog.style.cssText='width:min(850px,90vw);max-height:85vh;border:1px solid #ddd;border-radius:8px;padding:24px';
      const button=document.createElement('button');button.textContent='关闭';button.onclick=()=>dialog.close();
      const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 monospace';pre.textContent=content;
      dialog.append(button,pre);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
    }).catch(()=>window.alert('无法读取许可文件，请重试。'));
  });
}
