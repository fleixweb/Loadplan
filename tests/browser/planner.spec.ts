import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("sample computes, camera/layer controls work, edited results cannot export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/柜算/);
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
  await page
    .getByRole("spinbutton", { name: "柜内长", exact: true })
    .fill("6000");
  await expect(page.getByText("输入已修改 · 请重新计算")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("invalid input is explained; JSON export/import round-trips inputs and rejects malformed files", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByRole("spinbutton", { name: "柜内长", exact: true }).fill("0");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("正数");
  await page
    .getByRole("spinbutton", { name: "柜内长", exact: true })
    .fill("5898");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出方案", exact: true }).click();
  const saved = await pending;
  const path = await saved.path();
  const json = JSON.parse(await readFile(path!, "utf8"));
  expect(json.schemaVersion).toBe(1);
  expect(json.validation.valid).toBe(true);
  expect(json.placements.length).toBeGreaterThan(0);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":1,"cargo":null}'),
    });
  await expect(page.getByRole("alert")).toContainText("货柜");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "plan.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(json)),
    });
  await expect(
    page.getByText("已导入货物与柜型。", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(page.getByTestId("packed-count")).toContainText(
    String(json.placements.length),
  );
});

test("cargo add/remove, container presets and help dialog are usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByRole("button", { name: "添加货物规格" }).click();
  await expect(
    page.getByRole("textbox", { name: "货物 4 名称" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除货物 4" }).click();
  await expect(page.getByRole("textbox", { name: "货物 4 名称" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "40HQ 高柜" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "柜内高", exact: true }),
  ).toHaveValue("2698");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
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
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "40HQ 高柜" }).click();
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByTestId("scene").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
