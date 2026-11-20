import { prepareCargo } from "./workflow";
import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  calculate,
  configureContainers,
  exportFile,
  openCargoEditor,
} from "./workflow";
test("长圆柱叠放、底层切换、Excel 报告和三维分层", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
  await configureContainers(page);
  await page.getByRole("button", { name: "40GP 标准柜", exact: true }).click();
  await openCargoEditor(page);
  await openCargoEditor(page);
  const card = page.locator(".cargo-card").first();
  for (const [name, value] of [
    ["长 (mm)", "11800"],
    ["宽 (mm)", "250"],
    ["高 (mm)", "250"],
    ["最多层数", "20"],
  ]) {
    await card.getByRole("spinbutton", { name, exact: true }).fill(value);
  }
  await card.getByLabel("货物 1 货物形态").selectOption("cylinder-x");
  const stackable = card.getByLabel("允许叠放", { exact: true });
  const bottomOnly = card.getByLabel("只能放底层", { exact: true });
  const canvas = page.getByTestId("scene").locator("canvas");
  await configureContainers(page);
  await calculate(page);
  await expect(canvas).toHaveAttribute("data-cylinder-count", "9");
  await page.getByRole("button", { name: "修改货物" }).click();
  await stackable.check();
  await configureContainers(page);
  await calculate(page);
  for (const id of ["baseline", "maxrects"]) {
    await expect(page.getByTestId(`algorithm-${id}`)).toContainText(
      "装入 81 件",
    );
  }
  await expect(canvas).toHaveAttribute("data-cylinder-count", "81");
  const pending = page.waitForEvent("download");
  await exportFile(page, "xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await pending).path())!);
  expect(workbook.getWorksheet("装柜方案")!.getCell("A4").value).toContain(
    "已装 81 件 · 未装 19 件",
  );
  const slider = page.getByRole("slider", { name: "显示层数" });
  await expect(slider).toHaveAttribute("max", "9");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await expect(page.locator(".layer-control output")).toHaveText("≤ 第 1 层");
  await slider.press("Home");

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1100 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await canvas.scrollIntoViewIfNeeded();
    // Read the rendered WebGL canvas through a 2D copy to detect visible cargo.
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          const source = element as HTMLCanvasElement;
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const context = copy.getContext("2d")!;
          context.drawImage(source, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            copy.width,
            copy.height,
          ).data;
          let cargoPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              pixels[i] > pixels[i + 1] * 1.15 &&
              pixels[i + 1] > pixels[i + 2] * 1.1
            )
              cargoPixels++;
          }
          return cargoPixels;
        }),
      )
      .toBeGreaterThan(100);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".viewer").screenshot({
      path: testInfo.outputPath(`horizontal-stacked-${name}.png`),
    });
  }
  const before = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 60,
    bounds.y + bounds.height / 2 + 20,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()),
    )
    .not.toBe(before);
  await page.getByRole("button", { name: "修改货物" }).click();
  await bottomOnly.check();
  await configureContainers(page);
  await calculate(page);
  await expect(canvas).toHaveAttribute("data-cylinder-count", "9");
  await page.getByRole("button", { name: "修改货物" }).click();
  await bottomOnly.uncheck();
  await configureContainers(page);
  await calculate(page);
  await expect(canvas).toHaveAttribute("data-cylinder-count", "81");
  expect(errors).toEqual([]);
});

test("横放方向、支架占位、木包装与导出", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await prepareCargo(page);
  await prepareCargo(page, true);
  await openCargoEditor(page);
  const cards = page.locator(".cargo-card");
  await cards.nth(0).getByLabel("货物 1 货物形态").selectOption("cylinder-x");
  await expect(cards.nth(0).getByLabel("货物 1 摆放方向")).toBeDisabled();
  const stackable = cards.nth(0).getByLabel("允许叠放", { exact: true });
  const bottomOnly = cards.nth(0).getByLabel("只能放底层", { exact: true });
  await expect(stackable).toBeEnabled();
  await expect(stackable).not.toBeChecked();
  await expect(bottomOnly).toBeEnabled();
  await expect(bottomOnly).not.toBeChecked();
  await stackable.check();
  await cards
    .nth(0)
    .getByRole("spinbutton", { name: "圆柱直径 (mm)", exact: true })
    .fill("300");
  await cards
    .nth(0)
    .getByRole("spinbutton", { name: "轴向长度 (mm)", exact: true })
    .fill("500");
  await page.getByRole("button", { name: "展开货物 2" }).click();
  await cards.nth(1).getByLabel("货物 2 货物形态").selectOption("wood-box");
  await page.getByRole("button", { name: "展开货物 3" }).click();
  await cards.nth(2).getByLabel("货物 3 货物形态").selectOption("wood-frame");
  await configureContainers(page);
  await calculate(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(page.locator(".scene canvas")).toHaveAttribute(
    "data-cylinder-count",
    /^[1-9]/,
  );
  const pending = page.waitForEvent("download");
  await exportFile(page, "xlsx");
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  expect(workbook.getWorksheet("装柜方案")!.getCell("A4").value).toContain(
    "已装",
  );
  await page.getByRole("button", { name: "修改货物" }).click();
  await page.getByRole("button", { name: "展开货物 1" }).click();
  await cards.nth(0).getByLabel("货物 1 货物形态").selectOption("cylinder-y");
  await configureContainers(page);
  await calculate(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
