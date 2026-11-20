import { prepareCargo } from "./workflow";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  calculate,
  configureContainers,
  exportFile,
  initialResult,
  openCargoEditor,
} from "./workflow";
import type { SuiteEntry } from "../../src/domain/cases";

test("compare real solvers, switch view and export selected result", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await prepareCargo(page);
  await configureContainers(page);
  for (const label of ["柜内长", "柜内宽", "柜内高"])
    await page
      .getByRole("spinbutton", { name: label, exact: true })
      .fill("1000");
  await page
    .locator(".door-settings:not(.clearance-settings) > summary")
    .click();
  for (const label of ["柜门宽", "柜门高"])
    await page
      .getByRole("spinbutton", { name: label, exact: true })
      .fill("1000");
  await openCargoEditor(page);
  await openCargoEditor(page);
  const card = page.locator(".cargo-card");
  for (const label of ["长 (mm)", "宽 (mm)", "高 (mm)"])
    await card
      .getByRole("spinbutton", { name: label, exact: true })
      .fill("500");
  await card
    .getByRole("spinbutton", { name: "数量 / 箱", exact: true })
    .fill("8");
  await card
    .getByRole("spinbutton", { name: "最多层数", exact: true })
    .fill("2");
  await configureContainers(page);
  await calculate(page);
  for (const id of ["baseline", "maxrects"])
    await expect(page.getByTestId(`algorithm-${id}`)).toContainText("装入 8");
  await page
    .getByRole("button", { name: "查看柜底矩形排布（MaxRects）摆放图" })
    .click();
  await expect(page.locator(".active-algorithm-label")).toHaveText(
    "柜底矩形排布（MaxRects）",
  );
  const download = page.waitForEvent("download");
  await exportFile(page, "xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await download).path())!);
  expect(workbook.subject).toContain("maxrects-packer 2.7.3");
  expect(workbook.getWorksheet("装柜方案")!.getCell("A4").value).toContain(
    "已装 8 件",
  );
  await page.getByRole("button", { name: "修改柜子", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "柜内长", exact: true })
    .fill("1200");
  await expect(page.locator(".stale-preview")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出方案", exact: true }),
  ).toHaveCount(0);
  await calculate(page);
  await expect(
    page.getByRole("button", { name: "查看柜底矩形排布（MaxRects）摆放图" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("browser Worker runs complete case suite without replacing current inputs", async ({
  page,
}) => {
  await page.goto("/");
  await prepareCargo(page);
  await initialResult(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  const before = await page.getByTestId("packed-count").innerText();
  const suite = await page.evaluate(
    () =>
      new Promise<SuiteEntry[]>((resolve, reject) => {
        const worker = new Worker("/src/domain/packing.worker.ts", {
          type: "module",
        });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("suite timeout"));
        }, 15000);
        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.suite);
        };
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error("worker failed"));
        };
        worker.postMessage({ task: "suite" });
      }),
  );
  expect(suite).toHaveLength(8);
  expect(
    suite
      .filter((c) => c.expectedCount !== null)
      .flatMap((c) => c.runs)
      .every((r) => r.status === "pass"),
  ).toBe(true);
  expect(
    suite
      .find((c) => c.expectedCount === null)!
      .runs.every((r) => r.status === "rules-only"),
  ).toBe(true);
  await expect(page.getByTestId("packed-count")).toHaveText(before);
});

test("mobile comparison fits screen and preserves selected algorithm", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await prepareCargo(page);
  await initialResult(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
  await page
    .getByRole("button", { name: /查看柜底矩形排布（MaxRects）.*摆放图/ })
    .click();
  await expect(page.locator(".active-algorithm-label")).toHaveText(
    "柜底矩形排布（MaxRects）",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
