import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("横放方向、支架占位、木包装与导出", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const cards = page.locator(".cargo-card");
  await cards.nth(0).getByLabel("货物 1 货物形态").selectOption("cylinder-x");
  await expect(cards.nth(0).getByLabel("货物 1 摆放方向")).toBeDisabled();
  await expect(
    cards.nth(0).getByLabel("允许叠放", { exact: true }),
  ).toBeDisabled();
  await cards
    .nth(0)
    .getByRole("spinbutton", { name: "圆柱直径 (mm)", exact: true })
    .fill("300");
  await cards
    .nth(0)
    .getByRole("spinbutton", { name: "轴向长度 (mm)", exact: true })
    .fill("500");
  await cards.nth(1).getByLabel("货物 2 货物形态").selectOption("wood-box");
  await cards.nth(2).getByLabel("货物 3 货物形态").selectOption("wood-frame");
  await page.getByRole("button", { name: "重新比较", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await expect(page.locator(".scene canvas")).toHaveAttribute(
    "data-cylinder-count",
    /^[1-9]/,
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出方案", exact: true }).click();
  const data = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(data.cargo.map((c: { shape: string }) => c.shape)).toEqual([
    "cylinder-x",
    "wood-box",
    "wood-frame",
  ]);
  await cards.nth(0).getByLabel("货物 1 货物形态").selectOption("cylinder-y");
  await page.getByRole("button", { name: "重新比较", exact: true }).click();
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
