import { prepareCargo, chooseContainerMode } from "./workflow";
import { expect, test } from "@playwright/test";
import { calculate, configureContainers, openCargoEditor } from "./workflow";

test("步骤校验、返回修改和按格式展示导出设置", async ({ page }, info) => {
  await page.goto("/");
  await prepareCargo(page);
  await expect(page.locator(".cargo-nav-list li")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "计算步骤提示", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "待计算货物摘要" }),
  ).toBeVisible();
  const left = (await page.locator(".input-panel").boundingBox())!;
  const right = (await page.locator(".result-panel").boundingBox())!;
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "3 查看方案" })).toBeDisabled();
  await openCargoEditor(page);
  const length = page.getByRole("spinbutton", { name: "长 (mm)", exact: true });
  await length.fill("0");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("alert").first(),
  ).toContainText("正数");
  await expect(length).toBeFocused();
  await length.fill("600");
  await page.screenshot({
    path: info.outputPath("wizard-cargo-desktop.png"),
    fullPage: true,
  });
  await configureContainers(page);
  await expect(page.locator(".cargo-form")).toBeHidden();
  await expect(page.locator(".container-form")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "待计算货物摘要" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("wizard-containers-desktop.png"),
    fullPage: true,
  });
  await calculate(page);
  await expect(
    page.getByRole("button", { name: "3 查看方案" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("导出格式", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "导出方案", exact: true }).click();
  await expect(page.getByLabel("OBJ 包含柜体框架")).toHaveCount(0);
  await page.getByLabel("导出格式", { exact: true }).selectOption("obj");
  await expect(page.getByLabel("OBJ 包含柜体框架")).toBeVisible();
  await page.getByLabel("导出格式", { exact: true }).selectOption("pdf");
  await expect(page.getByLabel("OBJ 包含柜体框架")).toHaveCount(0);
  await page.getByRole("button", { name: "修改货物", exact: true }).click();
  await expect(length).toHaveValue("600");
  await length.fill("650");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByRole("button", { name: "3 查看方案" })).toBeDisabled();
  await expect(page.locator(".stale-preview")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("wizard-cargo-mobile.png"),
    fullPage: true,
  });
});

test("自动估算在结果步骤同时展示所有完整场景", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await prepareCargo(page);
  await configureContainers(page);
  await chooseContainerMode(page, "auto");
  await page.getByRole("button", { name: "移除 40HQ" }).click();
  await page.getByRole("button", { name: "移除 40GP" }).click();
  await page.locator(".candidate-details > summary").click();
  for (const [name, value] of [
    ["20GP 柜内长 / mm", "1200"],
    ["20GP 柜内宽 / mm", "800"],
    ["20GP 柜内高 / mm", "800"],
    ["20GP 柜门宽 / mm", "800"],
    ["20GP 柜门高 / mm", "800"],
  ])
    await page.getByRole("spinbutton", { name, exact: true }).fill(value);
  await page
    .getByRole("spinbutton", { name: "最多试算柜数", exact: true })
    .fill("3");
  await page.screenshot({
    path: info.outputPath("wizard-auto-desktop.png"),
    fullPage: true,
  });
  await calculate(page);
  const canvases = page.locator(".fleet-preview-item canvas");
  await expect(canvases).toHaveCount(3);
  for (const canvas of await canvases.all()) {
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          const source = element as HTMLCanvasElement;
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const ctx = copy.getContext("2d")!;
          ctx.drawImage(source, 0, 0);
          const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (
              pixels[i] > pixels[i + 1] * 1.15 &&
              pixels[i + 1] > pixels[i + 2] * 1.1
            )
              count++;
          return count;
        }),
      )
      .toBeGreaterThan(100);
  }
  await page.screenshot({
    path: info.outputPath("wizard-results-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("wizard-results-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
