import { prepareCargo } from "./workflow";
import { test, expect } from "@playwright/test";
import { configureContainers, calculate, openCargoEditor } from "./workflow";
test("分步修改形态并重新计算后可查看另一侧", async ({ page }) => {
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
  const shape = page.getByLabel("货物 1 货物形态");
  for (const value of ["cylinder", "wood-box", "wood-frame"]) {
    await shape.selectOption(value);
    await expect(shape).toHaveValue(value);
    await configureContainers(page);
    await calculate(page);
    await expect(page.getByText("基础规则校验通过")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "导出方案", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".scene canvas")).toHaveAttribute(
      "data-cylinder-count",
      value === "cylinder" ? /^[1-9]/ : "0",
    );
    if (value !== "wood-frame")
      await page.getByRole("button", { name: "修改货物" }).click();
  }
  await page.getByRole("button", { name: "另一侧", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "另一侧", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
