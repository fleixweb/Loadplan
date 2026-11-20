import { expect, test } from "@playwright/test";
import {
  calculate,
  chooseContainerMode,
  configureContainers,
  openCargoEditor,
  prepareCargo,
} from "./workflow";

test("单品超过1500件可以计算单柜、指定多柜和自动估算，剩余件数正确", async ({
  page,
}) => {
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
  const quantity = page.getByLabel("数量 / 箱", { exact: true });
  await quantity.fill("2001");
  await expect(quantity).toHaveAttribute("aria-invalid", "false");
  await configureContainers(page);
  await calculate(page);
  await expect(page.locator(".input-overview")).toContainText("2,001");
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toBeEnabled();
  for (const mode of ["fixed", "auto"] as const) {
    await chooseContainerMode(page, mode);
    if (mode === "fixed")
      await page.getByLabel("柜型 1 数量", { exact: true }).fill("2");
    else await page.getByLabel("最多试算柜数", { exact: true }).fill("2");
    await calculate(page);
    await expect(page.locator(".fleet-preview-item")).toHaveCount(2);
    const totals = await page.locator(".fleet-totals strong").allTextContents();
    expect(
      Number(totals[1].replaceAll(",", "")) +
        Number(totals[2].replaceAll(",", "")),
    ).toBe(2001);
    await expect(
      page.getByRole("region", { name: "整批装载结果" }),
    ).toContainText("剩余");
    await expect(
      page.getByRole("button", { name: "导出方案", exact: true }),
    ).toBeEnabled();
  }
});

test("单柜可实际装入 30000 件小货物", async ({ page }) => {
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
  const card = page.locator(".cargo-card");
  for (const [name, value] of [
    ["长 (mm)", "20"],
    ["宽 (mm)", "20"],
    ["高 (mm)", "50"],
    ["数量 / 箱", "30000"],
    ["毛重 / kg", "0.1"],
    ["最多层数", "20"],
  ])
    await card.getByLabel(name, { exact: true }).fill(value);

  await configureContainers(page);
  for (const name of ["柜内长", "柜内宽", "柜内高"])
    await page.getByLabel(name, { exact: true }).fill("1000");
  await page.locator(".door-settings:not(.clearance-settings) > summary").click();
  for (const name of ["柜门宽", "柜门高"])
    await page.getByLabel(name, { exact: true }).fill("1000");
  await calculate(page);
  await expect(page.getByTestId("packed-count")).toContainText("30,000");
});
