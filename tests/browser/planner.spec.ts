import { prepareCargo, chooseMixed } from "./workflow";
import { startCalculation } from "./workflow";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  initialResult,
  configureContainers,
  calculate,
  openCargoEditor,
} from "./workflow";

test("sample computes, camera/layer controls work, edited results cannot export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await prepareCargo(page);
  await expect(page).toHaveTitle(/柜算/);
  await initialResult(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("packed-count")).not.toContainText("—");
  const top = page.getByRole("button", { name: "俯视", exact: true });
  await top.click();
  await expect(top).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("slider", { name: "显示层数" }).fill("1");
  await expect(page.locator(".layer-control output")).toHaveText("≤ 第 1 层");
  await page.getByRole("button", { name: "柜壁", exact: true }).click();
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载当前视图 PNG" }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = await png.path();
  const image = await readFile(pngPath!);
  expect(image.byteLength).toBeGreaterThan(5000);
  await page.getByRole("button", { name: "修改柜子", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "柜内长", exact: true })
    .fill("6000");
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toHaveCount(0);
  await startCalculation(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("invalid input is explained; malformed Excel files are rejected", async ({
  page,
}) => {
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
  await configureContainers(page);
  await page.getByRole("spinbutton", { name: "柜内长", exact: true }).fill("0");
  await startCalculation(page);
  await expect(page.getByRole("alert")).toContainText("正数");
  await page
    .getByRole("spinbutton", { name: "柜内长", exact: true })
    .fill("5898");
  await startCalculation(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByRole("button", { name: "修改货物", exact: true }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "导入 Excel", exact: true }).click();
  await page.getByLabel("选择 Excel 文件").setInputFiles({
    name: "invalid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("invalid-workbook"),
  });
  await expect(page.locator(".import-message")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "确认导入" })).toHaveCount(0);
});

test("cargo add/remove, container presets and help dialog are usable", async ({
  page,
}) => {
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
  await chooseMixed(page);
  await page.getByRole("button", { name: "添加货物规格" }).click();
  await expect(
    page.getByRole("textbox", { name: "货物 2 名称" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除货物 2" }).click();
  await expect(page.getByRole("textbox", { name: "货物 2 名称" })).toHaveCount(
    0,
  );
  await configureContainers(page);
  await page.getByRole("button", { name: "40HQ 高柜" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "柜内高", exact: true }),
  ).toHaveValue("2698");
  await startCalculation(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByRole("button", { name: "使用说明" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "使用说明" })).toBeFocused();
});

test("mobile viewport has no horizontal page overflow and can calculate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await prepareCargo(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await configureContainers(page);
  await page.getByRole("button", { name: "40HQ 高柜" }).click();
  await startCalculation(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByTestId("scene").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
