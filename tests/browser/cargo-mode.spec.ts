import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { fillCargo } from "./workflow";

test("空白开始、仅在导航切换货物模式、底部完成与 Excel 混装导入", async ({
  page,
}, info) => {
  await page.goto("/");
  const nav = page.locator(".cargo-nav-panel");
  const importer = nav.getByRole("button", { name: "导入 Excel", exact: true });
  await expect(importer).toHaveCSS("background-color", "rgb(180, 83, 9)");
  await expect(importer).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator(".input-overview tbody tr")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "载入示例", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑货物", exact: true }),
  ).toHaveCount(0);
  await expect(nav).toContainText("点击货物组合方式");
  await nav.getByRole("button", { name: "单一产品装柜", exact: true }).click();
  const form = page.getByRole("dialog", { name: "编辑货物" });
  await expect(
    form.getByRole("group", { name: "货物组合方式", exact: true }),
  ).toHaveCount(0);
  await expect(form.getByLabel("长 (mm)", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("数量 / 箱", { exact: true })).toHaveValue("");
  await expect(
    form.getByLabel("数量 / 箱", { exact: true }),
  ).not.toHaveAttribute("max");
  await expect(form.getByRole("button", { name: "添加货物规格" })).toHaveCount(
    0,
  );
  await fillCargo(page);
  const footer = form.locator(".modal-footer");
  const button = await footer
    .getByRole("button", { name: "完成", exact: true })
    .boundingBox();
  const bounds = await form.boundingBox();
  expect(
    Math.abs(button!.x + button!.width / 2 - bounds!.x - bounds!.width / 2),
  ).toBeLessThan(3);
  await page.screenshot({ path: info.outputPath("cargo-dialog.png") });
  await footer.getByRole("button").click();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("清单").addRows([
    ["型号", "长", "宽", "高", "数量", "毛重"],
    ["ONE", 500, 400, 300, 2001, 10],
    ["TWO", 600, 400, 300, 3, 15],
  ]);
  const file = {
    name: "mixed.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
  await importer.click();
  const importDialog = page.getByRole("dialog", {
    name: "导入 Excel",
    exact: true,
  });
  await expect(importDialog).toHaveCSS("border-radius", "0px");
  expect((await importDialog.boundingBox())!.width).toBeLessThanOrEqual(620);
  await expect(
    importDialog.getByRole("button", { name: "选择 Excel 文件", exact: true }),
  ).toHaveCSS("background-color", "rgb(180, 83, 9)");
  await page.screenshot({ path: info.outputPath("excel-empty-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("excel-empty-narrow.png") });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("选择 Excel 文件").setInputFiles(file);
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.locator(".import-message")).toContainText(
    "单一产品装柜模式",
  );
  await page.getByRole("button", { name: "关闭导入", exact: true }).click();
  await nav.getByRole("button", { name: "多种产品混装", exact: true }).click();
  await expect(
    form.getByRole("button", { name: "单一产品装柜", exact: true }),
  ).toHaveCount(0);
  await form.getByRole("button", { name: "完成", exact: true }).click();
  await importer.click();
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    data.items.add(
      new File([new Uint8Array(bytes)], "mixed.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    return data;
  }, Array.from(file.buffer));
  await page
    .locator(".import-file-area")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator(".import-file-name")).toHaveText("mixed.xlsx");
  await page.getByLabel("导入加入方式").selectOption("replace");
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(nav.locator("li")).toHaveCount(2);
  await expect(page.locator(".input-overview tbody tr").first()).toContainText(
    "2,001",
  );
});

test("指定多柜统一选择柜型、默认参数、添加删除与底部完成", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("group", { name: "柜子计算方式", exact: true })
    .getByRole("button", { name: "指定多个柜子", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "设置柜子", exact: true });
  await expect(form.getByLabel("计算方式", { exact: true })).toHaveCount(0);
  await expect(form.getByLabel("柜型 1", { exact: true })).toHaveValue("20GP");
  await form.getByLabel("柜型 1", { exact: true }).selectOption("40HQ");
  await expect(form.locator(".extra-container").first()).toContainText(
    "12032 × 2352 × 2698",
  );
  await form.getByRole("button", { name: "添加柜型", exact: true }).click();
  await form.getByLabel("柜型 2", { exact: true }).selectOption("40GP");
  await expect(form.locator(".extra-container").nth(1)).toContainText(
    "12032 × 2352 × 2393",
  );
  await form.getByRole("button", { name: "删除柜型 1", exact: true }).click();
  await expect(form.getByLabel("柜型 1", { exact: true })).toHaveValue("40GP");
  await expect(
    form.getByRole("button", { name: "删除柜型 1", exact: true }),
  ).toBeDisabled();
  await form.locator(".extra-container summary").click();
  await expect(
    form.getByLabel("柜型 1 柜内长 / mm", { exact: true }),
  ).toHaveValue("12032");
  await expect(form.getByLabel("柜型 1 门高", { exact: true })).toHaveValue(
    "2280",
  );
  await page.screenshot({
    path: info.outputPath("fixed-container-dialog.png"),
  });
  const button = await form.locator(".modal-footer button").boundingBox();
  const bounds = await form.boundingBox();
  expect(
    Math.abs(button!.x + button!.width / 2 - bounds!.x - bounds!.width / 2),
  ).toBeLessThan(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await form.getByRole("button", { name: "完成柜子设置", exact: true }).click();
  await expect(form).toHaveCount(0);
});
