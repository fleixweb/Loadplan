import { prepareCargo } from "./workflow";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  calculate,
  configureContainers,
  exportFile,
  openCargoEditor,
} from "./workflow";

test("圆柱填写、默认不叠、两种计算、三维显示和报告", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await prepareCargo(page);
  await openCargoEditor(page);
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
  await configureContainers(page);
  await calculate(page);
  for (const id of ["baseline", "maxrects"])
    await expect(page.getByTestId(`algorithm-${id}`)).toContainText("共 6 件");
  await page.getByTestId("algorithm-maxrects").getByRole("button").click();
  const canvas = page.getByTestId("scene").locator("canvas");
  await expect(canvas).toHaveAttribute("data-cylinder-count", "6");
  await expect(page.getByText("占位空间利用率", { exact: true })).toBeVisible();
  const pending = page.waitForEvent("download");
  await exportFile(page, "xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await pending).path())!);
  expect(workbook.getWorksheet("装柜方案")!.getCell("A4").value).toContain(
    "已装 6 件",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "修改货物" }).click();
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
