import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

test('exports Excel and PDF reports and blocks stale results', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '导入方案' })).toHaveCount(0);
  for (const format of ['Excel', 'PDF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `导出 ${format}` }).click();
    const file = await download;
    expect(await file.failure()).toBeNull();
    const path = (await file.path())!;
    if (format === 'Excel') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path);
      expect(workbook.worksheets).toHaveLength(1);
      const sheet = workbook.getWorksheet('装柜方案')!;
      expect(sheet.getImages()).toHaveLength(2);
      expect(sheet.pageSetup.fitToWidth).toBe(1);
      expect(sheet.pageSetup.fitToHeight).toBe(0);
      let detailRow = 0;
      sheet.eachRow((row, n) => { if (row.getCell(1).value === 'C 产品 · 小型箱') detailRow = n; });
      expect(detailRow).toBeGreaterThan(10);
      expect(sheet.getCell(`E${detailRow}`).value).toBe(200);
      expect(sheet.getCell(`F${detailRow}`).value).toBe(100);
      expect(sheet.getCell(`G${detailRow}`).value).toBe(100);
    } else {
      expect((await readFile(path)).subarray(0, 5).toString()).toBe('%PDF-');
    }
  }
  await page.getByRole('textbox', { name: '货物 1 名称', exact: true }).fill('新名称');
  await expect(page.getByRole('button', { name: '导出 Excel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出 PDF' })).toBeDisabled();
});
