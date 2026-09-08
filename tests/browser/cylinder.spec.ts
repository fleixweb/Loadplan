import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("圆柱填写、默认不叠、两种计算、三维显示和导出重导入", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page.getByRole("button", { name: "删除货物 3" }).click();
  await page.getByRole("button", { name: "删除货物 2" }).click();
  const card = page.locator(".cargo-card").first();
  await card.getByLabel("货物 1 货物形态").selectOption("cylinder");
  await expect(
    card.getByRole("spinbutton", { name: "直径 (mm)", exact: true }),
  ).toHaveValue("600");
  await expect(card.getByLabel("允许叠放", { exact: true })).not.toBeChecked();
  await expect(card.getByLabel("货物 1 摆放方向")).toBeDisabled();
  await card
    .getByRole("spinbutton", { name: "直径 (mm)", exact: true })
    .fill("500");
  await card
    .getByRole("spinbutton", { name: "高度 (mm)", exact: true })
    .fill("700");
  await card
    .getByRole("spinbutton", { name: "数量 / 件", exact: true })
    .fill("6");
  await page.getByRole("button", { name: "重新比较", exact: true }).click();
  for (const id of ["baseline", "maxrects"])
    await expect(page.getByTestId(`algorithm-${id}`)).toContainText("共 6 件");
  await page.getByTestId("algorithm-maxrects").getByRole("button").click();
  const canvas = page.getByTestId("scene").locator("canvas");
  await expect(canvas).toHaveAttribute("data-cylinder-count", "6");
  await expect(page.getByText("占位空间利用率", { exact: true })).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出方案", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(saved.cargo[0].shape).toBe("cylinder");
  expect(saved.cargo[0].size).toEqual({ x: 500, y: 500, z: 700 });
  expect(
    saved.placements.every(
      (p: { position: { z: number } }) => p.position.z === 0,
    ),
  ).toBe(true);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "cylinders.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await expect(card.getByLabel("货物 1 货物形态")).toHaveValue("cylinder");
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-cylinder-count", "6");
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByLabel("货物 1 装载单位").selectOption("pallet");
  await expect(card.getByLabel("货物 1 货物形态")).toHaveValue("box");
  await expect(
    card.getByRole("spinbutton", { name: "数量 / 托", exact: true }),
  ).toHaveValue("6");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
