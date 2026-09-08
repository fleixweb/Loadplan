import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("load hand-calculated case, compare real solvers, switch view and export selected result", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.locator(".case-library > summary").click();
  await page.getByLabel("选择例子").selectOption("regular");
  await expect(page.locator(".case-explanation")).toContainText(
    "2 × 2 × 2 = 8",
  );
  await page.getByRole("button", { name: "用这个例子试算" }).click();
  await expect(page.getByTestId("algorithm-baseline")).toContainText("装入 8");
  await expect(page.getByTestId("algorithm-maxrects")).toContainText("装入 8");
  await expect(page.getByTestId("algorithm-maxrects")).toContainText(
    "与手算一致",
  );
  await page.getByRole("button", { name: "查看装法二摆放图" }).click();
  await expect(page.locator(".active-algorithm-label")).toHaveText("装法二");
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
    page.getByText("货物已修改，请重新比较。下方仍是上次的结果。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看装法二摆放图" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "比较两种装法" }).click();
  await expect(
    page.getByRole("button", { name: "查看装法二摆放图" }),
  ).toBeEnabled();
  await expect(page.getByText("正在试算：整齐排列")).not.toBeVisible();
  await expect(page.getByTestId("algorithm-baseline")).toContainText(
    "符合当前尺寸、重量和摆放限制",
  );
  expect(errors).toEqual([]);
});

test("run complete case suite without replacing current inputs; distinguish rules-only result", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const oldCount = await page.getByTestId("packed-count").innerText();
  await page.locator(".case-library > summary").click();
  await page.locator(".example-checks > summary").click();
  await page.getByRole("button", { name: "检查全部例子" }).click();
  await expect(page.getByText("已通过：14 / 14 项计算检查")).toBeVisible();
  await expect(page.locator(".suite-results tbody tr")).toHaveCount(8);
  const business = page
    .locator(".suite-results tr")
    .filter({ hasText: "450 箱混装样例" });
  await expect(business).toContainText("最多能装多少尚不确定");
  await expect(business.locator(".case-outcome")).toHaveCount(2);
  await expect(business).toContainText("符合已设置的限制");
  await expect(
    page.getByRole("spinbutton", { name: "柜内长", exact: true }),
  ).toHaveValue("5898");
  await expect(page.getByTestId("packed-count")).toHaveText(oldCount);
  await page.getByLabel("选择例子").selectOption("upright");
  await page.getByRole("button", { name: "用这个例子试算" }).click();
  await expect(page.getByTestId("algorithm-maxrects")).toContainText("装入 0");
  await expect(page.getByTestId("algorithm-maxrects")).toContainText(
    "与手算一致",
  );
});

test("mobile case comparison fits screen and preserves controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.locator(".case-library > summary").click();
  await page.getByLabel("选择例子").selectOption("rotation");
  await page.getByRole("button", { name: "用这个例子试算" }).click();
  await expect(page.getByTestId("algorithm-maxrects")).toContainText("装入 1");
  await page.getByRole("button", { name: "查看装法二摆放图" }).click();
  await expect(page.locator(".active-algorithm-label")).toHaveText("装法二");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
