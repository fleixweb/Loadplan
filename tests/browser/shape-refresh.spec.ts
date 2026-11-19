import { test, expect } from "@playwright/test";
test("切换形态自动刷新结果并可查看另一侧", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const shape = page.getByLabel("货物 1 货物形态");
  for (const value of ["cylinder", "wood-box", "wood-frame"]) {
    await shape.selectOption(value);
    await expect(page.getByText("基础规则校验通过")).toBeVisible();
    await expect(shape).toHaveValue(value);
    await expect(
      page.getByRole("button", { name: "导出 OBJ", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".scene canvas")).toHaveAttribute(
      "data-cylinder-count",
      value === "cylinder" ? /^[1-9]/ : "0",
    );
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
