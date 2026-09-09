// Copyright (C) 2026 Fleix. AGPL-3.0-only; see ADDITIONAL_TERMS.md.
import { isTauri } from '@tauri-apps/api/core';

export const isDesktop = () => isTauri();

export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  if (isDesktop()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const extension = filename.split('.').pop()!;
    const path = await save({ defaultPath: filename, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

export function installDesktopLinks() {
  if (!isDesktop()) return;
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href')!;
    if (/^https:\/\/github\.com\/fleixweb\/Loadplan(?:[\/#?]|$)/.test(href) || href === 'mailto:45186482@qq.com') {
      event.preventDefault();
      void import('@tauri-apps/plugin-opener').then(({openUrl}) => openUrl(href)).catch(() => window.alert('无法打开链接，请使用浏览器访问：' + href));
    } else if (anchor.hasAttribute('download')) {
      event.preventDefault();
      void fetch(anchor.href).then(r => { if (!r.ok) throw new Error(); return r.blob(); }).then(blob => saveFile(blob, href.split('/').pop()!)).catch(() => window.alert('文件保存失败，请重试。'));
    } else if (anchor.target === '_blank' && new URL(anchor.href).origin === location.origin) {
      event.preventDefault();
      location.href = anchor.href;
    }
  });
}
