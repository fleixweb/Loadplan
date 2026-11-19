import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

async function configureSmallLoad(page: Page) {
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  for (const [name, value] of [
    ["柜内长", "1000"],
    ["柜内宽", "500"],
    ["柜内高", "500"],
  ])
    await page.getByRole("spinbutton", { name, exact: true }).fill(value);
  await page
    .locator(".door-settings:not(.clearance-settings) > summary")
    .click();
  await page
    .getByRole("spinbutton", { name: "柜门宽", exact: true })
    .fill("500");
  await page
    .getByRole("spinbutton", { name: "柜门高", exact: true })
    .fill("500");
  const card = page.locator(".cargo-card");
  for (const [name, value] of [
    ["长 (mm)", "500"],
    ["宽 (mm)", "500"],
    ["高 (mm)", "500"],
    ["数量 / 箱", "5"],
    ["毛重 / kg", "10"],
    ["最多层数", "1"],
  ])
    await card.getByRole("spinbutton", { name, exact: true }).fill(value);
  await card.locator(".cargo-identifiers > summary").click();
  await card.getByLabel("货物 1 型号", { exact: true }).fill("M001");
  await card
    .getByLabel("货物 1 序列号", { exact: true })
    .fill("001\n002\n003\n004\n005");
}
async function visibleCargoPixels(page: Page) {
  return page
    .getByTestId("scene")
    .first()
    .locator("canvas")
    .evaluate((source) => {
      const canvas = source as HTMLCanvasElement;
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i] > pixels[i + 1] * 1.15 &&
          pixels[i + 1] > pixels[i + 2] * 1.1
        )
          count++;
      return count;
    });
}

test("通用工作簿映射、重量补充、编号合并与混合形态导入", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("出货清单");
  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = "客户设备清单";
  sheet.addRow([
    "Model",
    "Length",
    "Width",
    "Height",
    "Qty",
    "货物形态",
    "Serial number",
  ]);
  sheet.addRow(["M001", 50, 50, 50, 1, "长方体包装", "001"]);
  sheet.addRow(["M001", 50, 50, 50, 1, "长方体包装", "002"]);
  sheet.addRow(["PIPE", 80, 20, 20, 2, "圆柱（沿柜长横放）", ""]);
  await page.getByRole("button", { name: "导入 Excel", exact: true }).click();
  await page.getByLabel("选择 Excel 文件").setInputFiles({
    name: "customer.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  await page
    .getByRole("spinbutton", { name: "表头所在行", exact: true })
    .fill("2");
  await page.getByLabel("导入尺寸单位").selectOption("cm");
  await expect(
    page.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("spinbutton", { name: "缺失毛重 / kg", exact: true })
    .fill("10");
  await expect(page.locator(".import-preview tbody tr")).toHaveCount(3);
  await expect(page.getByLabel("第 5 行形态")).toHaveValue("cylinder-x");
  await expect(
    page.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "保存映射", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "缺失毛重 / kg", exact: true })
    .fill("20");
  await page.getByRole("button", { name: "使用已存映射", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "缺失毛重 / kg", exact: true }),
  ).toHaveValue("10");
  await page.getByLabel("导入加入方式").selectOption("replace");
  await page
    .locator(".import-workspace")
    .screenshot({ path: testInfo.outputPath("import-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".import-workspace")
    .screenshot({ path: testInfo.outputPath("import-mobile.png") });
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.locator(".cargo-card")).toHaveCount(2);
  await page.getByRole("button", { name: "展开货物 2" }).click();
  await expect(page.getByLabel("货物 2 货物形态")).toHaveValue("cylinder-x");
  await expect(
    page
      .locator(".cargo-card")
      .nth(1)
      .getByRole("spinbutton", { name: "轴向长度 (mm)", exact: true }),
  ).toHaveValue("800");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(page.getByTestId("packed-count")).toContainText("4");
  await expect(
    page.getByTestId("scene").first().locator("canvas"),
  ).toHaveAttribute("data-cylinder-count", "2");
  expect(errors).toEqual([]);
});

test("指定多柜分配、逐柜预览、整批报告和 OBJ ZIP", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await configureSmallLoad(page);
  await page.getByLabel("计算方式", { exact: true }).selectOption("fixed");
  await page
    .getByRole("spinbutton", { name: "当前柜型数量", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "整批装载结果" }),
  ).toContainText("装入 5 件");
  await expect(page.getByLabel("当前查看柜子").locator("option")).toHaveCount(
    3,
  );
  await expect(page.locator(".fleet-preview-item")).toHaveCount(3);
  await expect(page.getByTestId("packed-count")).toContainText("2");
  await expect.poll(() => visibleCargoPixels(page)).toBeGreaterThan(100);
  await page
    .locator(".workbench")
    .screenshot({ path: testInfo.outputPath("fleet-desktop.png") });
  await page.getByLabel("当前查看柜子").selectOption("C003");
  await expect(page.getByTestId("packed-count")).toContainText("1");
  await page.locator(".traceability > summary").click();
  await expect(page.locator(".traceability")).toContainText("005");
  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Excel", exact: true }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await xlsxDownload).path())!);
  expect(workbook.getWorksheet("整批汇总")!.getCell("A2").value).toContain(
    "已装 5 件",
  );
  expect(workbook.getWorksheet("C001")!.getImages()).toHaveLength(1);
  expect(workbook.getWorksheet("C003")!.getImages()).toHaveLength(1);
  expect(workbook.getImage(0).buffer).toBeDefined();
  expect(workbook.getImage(0).buffer).not.toEqual(workbook.getImage(2).buffer);
  const trace = workbook.getWorksheet("逐件装载明细")!;
  expect(trace.rowCount).toBe(6);
  expect(trace.getCell("D6").value).toBe("005");
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
  expect(
    (await readFile((await (await pdfDownload).path())!))
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  const objDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 OBJ", exact: true }).click();
  const archive = unzipSync(
    await readFile((await (await objDownload).path())!),
  );
  expect(
    Object.keys(archive).filter((name) => name.endsWith(".obj")),
  ).toHaveLength(3);
  expect(
    new OBJLoader().parse(strFromU8(archive["C001.obj"])).children,
  ).toHaveLength(2);
  expect(strFromU8(archive["C003.obj"])).toContain("005");
  await page.locator(".export-options > summary").click();
  await page.getByLabel("导出范围", { exact: true }).selectOption("current");
  await page.getByLabel("OBJ 包含柜体框架", { exact: true }).check();
  await page.getByLabel("OBJ 与颜色材质打包", { exact: true }).check();
  const materialDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 OBJ", exact: true }).click();
  const materialArchive = unzipSync(
    await readFile((await (await materialDownload).path())!),
  );
  expect(strFromU8(materialArchive["C003.mtl"])).toContain("Kd ");
  expect(
    new OBJLoader().parse(strFromU8(materialArchive["C003.obj"])).children,
  ).toHaveLength(13);
  await page.getByLabel("OBJ 包含柜体框架", { exact: true }).uncheck();
  await page.getByLabel("OBJ 与颜色材质打包", { exact: true }).uncheck();
  const singleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 OBJ", exact: true }).click();
  const single = await singleDownload;
  expect(single.suggestedFilename()).toBe("C003.obj");
  expect(
    new OBJLoader().parse(await readFile((await single.path())!, "utf8"))
      .children,
  ).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("scene").first().scrollIntoViewIfNeeded();
  await expect.poll(() => visibleCargoPixels(page)).toBeGreaterThan(100);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".viewer")
    .first()
    .screenshot({ path: testInfo.outputPath("fleet-mobile.png") });
  await page.getByLabel("计算方式", { exact: true }).selectOption("single");
  await expect(
    page.getByRole("button", { name: "导出 OBJ", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".stale-preview")).toBeVisible();
  expect(errors).toEqual([]);
});

test("取消 Worker 计算后可以重新计算，旧响应不会覆盖结果", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown) {
        setTimeout(() => super.postMessage(message), 2500);
      }
      terminate() {
        (window as unknown as { terminated: number }).terminated =
          ((window as unknown as { terminated: number }).terminated ?? 0) + 1;
        super.terminate();
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "取消计算", exact: true }).click();
  await expect(
    page.getByText("本次计算已取消", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { terminated: number }).terminated,
    ),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出 OBJ", exact: true }),
  ).toBeEnabled();
});

test("正在计算时不允许导入预览覆盖当前清单", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown) {
        setTimeout(() => super.postMessage(message), 2500);
      }
    };
  });
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("货物").addRows([
    ["型号", "尺寸", "毛重"],
    ["NEW", "100x100x100", "10"],
  ]);
  await page.getByRole("button", { name: "导入 Excel", exact: true }).click();
  await page.getByLabel("选择 Excel 文件").setInputFiles({
    name: "new.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  await page.getByLabel("导入加入方式").selectOption("replace");
  await expect(
    page.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.locator(".import-message")).toContainText("等待当前计算");
  await expect(page.locator(".cargo-card")).toHaveCount(1);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.locator(".cargo-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "导出 OBJ", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".stale-preview")).toBeVisible();
});

test("自动估算柜数、柜数上限与不可装入终止", async ({ page }) => {
  await configureSmallLoad(page);
  await page.getByLabel("计算方式", { exact: true }).selectOption("auto");
  await page.getByRole("button", { name: "移除 40HQ" }).click();
  await page.getByRole("button", { name: "移除 40GP" }).click();
  await page
    .getByRole("spinbutton", { name: "最多试算柜数", exact: true })
    .fill("2");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "整批装载结果" }),
  ).toContainText("达到试算上限");
  await expect(
    page.getByRole("region", { name: "整批装载结果" }),
  ).toContainText("剩余 1 件");
  await page
    .getByRole("spinbutton", { name: "最多试算柜数", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "整批装载结果" }),
  ).toContainText("全部装入");
  await expect(page.getByLabel("当前查看柜子").locator("option")).toHaveCount(
    3,
  );
  await page
    .locator(".cargo-card")
    .getByRole("spinbutton", { name: "长 (mm)", exact: true })
    .fill("2000");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "整批装载结果" }),
  ).toContainText("剩余 5 件");
  await expect(page.getByLabel("当前查看柜子").locator("option")).toHaveCount(
    1,
  );
});
