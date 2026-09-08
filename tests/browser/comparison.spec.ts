import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("load hand-calculated case, compare real solvers, switch view and export selected result", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.locator(".case-library summary").click();
  await page.getByLabel("选择测试案例").selectOption("regular");
  await expect(page.locator(".case-explanation")).toContainText(
    "2 × 2 × 2 = 8",
  );
  await page.getByRole("button", { name: "加载并比较" }).click();
  await expect(page.getByTestId("algorithm-baseline")).toContainText("8 / 10");
  await expect(page.getByTestId("algorithm-maxrects")).toContainText("8 / 10");
  await expect(page.getByTestId("algorithm-maxrects")).toContainText(
    "符合预期",
  );
  await page.getByRole("button", { name: "查看开源 MaxRects结果" }).click();
  await expect(page.locator(".active-algorithm-label")).toHaveText(
    "开源 MaxRects 适配",
  );
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出方案", exact: true }).click();
  const file = await pending;
  const result = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(result.strategy).toContain("maxrects-packer 2.7.3");
  expect(result.placements).toHaveLength(8);
  expect(result.validation.valid).toBe(true);
  await page
    .getByRole("spinbutton", { name: "柜内长", exact: true })
    .fill("1200");
  await expect(
    page.getByText("输入已修改，以下为上次比较，请重新比较后选择。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看开源 MaxRects结果" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "比较当前货物" }).click();
  await expect(
    page.getByRole("button", { name: "查看开源 MaxRects结果" }),
  ).toBeEnabled();
  await expect(page.getByText("正在查看案例：整齐排列")).not.toBeVisible();
  await expect(page.getByTestId("algorithm-baseline")).toContainText(
    "约束通过",
  );
  expect(errors).toEqual([]);
});

test("run complete case suite without replacing current inputs; distinguish rules-only result", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const oldCount = await page.getByTestId("packed-count").innerText();
  await page.locator(".case-library summary").click();
  await page.getByRole("button", { name: "运行全部标准案例" }).click();
  await expect(
    page.getByText("手算案例：14 / 14 项算法结果符合预期"),
  ).toBeVisible();
  await expect(page.locator(".suite-results tbody tr")).toHaveCount(8);
  const business = page
    .locator(".suite-results tr")
    .filter({ hasText: "450 箱混装样例" });
  await expect(business).toContainText("不设最优答案");
  await expect(business.locator(".case-outcome")).toHaveCount(2);
  await expect(business).toContainText("仅规则校验");
  await expect(
    page.getByRole("spinbutton", { name: "柜内长", exact: true }),
  ).toHaveValue("5898");
  await expect(page.getByTestId("packed-count")).toHaveText(oldCount);
  await page.getByLabel("选择测试案例").selectOption("upright");
  await page.getByRole("button", { name: "加载并比较" }).click();
  await expect(page.getByTestId("algorithm-maxrects")).toContainText("0 / 1");
  await expect(page.getByTestId("algorithm-maxrects")).toContainText(
    "符合预期",
  );
});

test("mobile case comparison fits screen and preserves controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.locator(".case-library summary").click();
  await page.getByLabel("选择测试案例").selectOption("rotation");
  await page.getByRole("button", { name: "加载并比较" }).click();
  await expect(page.getByTestId("algorithm-maxrects")).toContainText("1 / 1");
  await page.getByRole("button", { name: "查看开源 MaxRects结果" }).click();
  await expect(page.locator(".active-algorithm-label")).toHaveText(
    "开源 MaxRects 适配",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
