import { beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({save:vi.fn(),writeFile:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true}));
vi.mock('@tauri-apps/plugin-dialog',()=>({save:mocks.save}));
vi.mock('@tauri-apps/plugin-fs',()=>({writeFile:mocks.writeFile}));
import { saveFile } from '../src/platform/files';
beforeEach(()=>vi.resetAllMocks());
test('cancelled native dialog does not save or report success',async()=>{
  mocks.save.mockResolvedValue(null);
  expect(await saveFile(new Blob(['test']),'report.pdf')).toBe(false);
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
test('writes the actual report bytes only to the user-selected path',async()=>{
  mocks.save.mockResolvedValue('C:/Reports/chosen.xlsx');
  expect(await saveFile(new Blob([new Uint8Array([80,75,3,4])]),'report.xlsx')).toBe(true);
  expect(mocks.writeFile).toHaveBeenCalledWith('C:/Reports/chosen.xlsx',new Uint8Array([80,75,3,4]));
});
test('native disk errors propagate to the UI error handler',async()=>{
  mocks.save.mockResolvedValue('C:/Reports/report.pdf');
  mocks.writeFile.mockRejectedValue(new Error('disk full'));
  await expect(saveFile(new Blob(['report']),'report.pdf')).rejects.toThrow('disk full');
});
