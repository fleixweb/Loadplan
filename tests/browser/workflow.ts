import { expect, type Page } from "@playwright/test";
import { SAMPLE_CARGO } from "../../src/domain/sample";

export async function fillCargo(
  page: Page,
  index = 0,
  fixture = SAMPLE_CARGO[0],
) {
  const card = page.locator(".cargo-card").nth(index);
  if (!(await card.locator(".cargo-editor-fields").isVisible()))
    await card
      .getByRole("button", { name: `展开货物 ${index + 1}`, exact: true })
      .click();
  await card
    .getByLabel(`货物 ${index + 1} 名称`, { exact: true })
    .fill(fixture.name);
  await card
    .getByLabel(`货物 ${index + 1} 摆放方向`, { exact: true })
    .selectOption(fixture.rotation);
  for (const [label, value] of [
    ["长 (mm)", fixture.size.x],
    ["宽 (mm)", fixture.size.y],
    ["高 (mm)", fixture.size.z],
    ["数量 / 箱", fixture.quantity],
    ["毛重 / kg", fixture.weight],
    ["最多层数", fixture.maxLayers],
  ] as const)
    await card.getByLabel(label, { exact: true }).fill(String(value));
}

export async function prepareCargo(page: Page, mixed = false) {
  await page
    .getByRole("group", { name: "货物组合方式", exact: true })
    .getByRole("button", {
      name: mixed ? "多种产品混装" : "单一产品装柜",
      exact: true,
    })
    .click();
  const fixtures = mixed ? SAMPLE_CARGO : SAMPLE_CARGO.slice(0, 1);
  for (let i = 0; i < fixtures.length; i++) {
    if (i)
      await page
        .getByRole("button", { name: "添加货物规格", exact: true })
        .click();
    await fillCargo(page, i, fixtures[i]);
  }
  if (mixed)
    await page.getByRole("button", { name: "展开货物 1", exact: true }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
}

export async function chooseContainerMode(
  page: Page,
  mode: "single" | "fixed" | "auto",
) {
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "柜子计算方式", exact: true })
    .getByRole("button", {
      name: { single: "单柜计算", fixed: "指定多个柜子", auto: "自动估算柜数" }[
        mode
      ],
      exact: true,
    })
    .click();
}

export async function chooseMixed(page: Page) {
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "货物组合方式", exact: true })
    .getByRole("button", { name: "多种产品混装", exact: true })
    .click();
}

export async function configureContainers(page: Page) {
  if (await page.getByRole("dialog", { name: "编辑货物" }).isVisible())
    await page.getByRole("button", { name: "完成", exact: true }).click();
  if (
    !(await page
      .getByRole("dialog", { name: "设置柜子", exact: true })
      .isVisible())
  )
    await page
      .getByRole("group", { name: "柜子计算方式", exact: true })
      .locator('button[aria-pressed="true"]')
      .click();
  await expect(page.locator('.wizard-step[aria-current="step"]')).toContainText(
    "设置柜子",
  );
}

export async function openCargoEditor(page: Page) {
  if (
    await page
      .getByRole("dialog", { name: "设置柜子", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "完成柜子设置", exact: true })
      .click();
  if (await page.getByRole("dialog", { name: "编辑货物" }).isVisible()) return;
  await page
    .getByRole("group", { name: "货物组合方式", exact: true })
    .locator('button[aria-pressed="true"]')
    .click();
  await expect(page.getByRole("dialog", { name: "编辑货物" })).toBeVisible();
}

export async function calculate(page: Page) {
  await startCalculation(page);
  await expect(page.getByText("基础规则校验通过")).toBeVisible();
}

export async function startCalculation(page: Page) {
  if (
    await page
      .getByRole("dialog", { name: "设置柜子", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "完成柜子设置", exact: true })
      .click();
    if (
      await page
        .getByRole("dialog", { name: "设置柜子", exact: true })
        .isVisible()
    )
      return;
  }
  await page.getByRole("button", { name: "计算装柜方案", exact: true }).click();
}

export async function initialResult(page: Page) {
  await configureContainers(page);
  await calculate(page);
}

export async function exportFile(page: Page, format: "xlsx" | "pdf" | "obj") {
  if (!(await page.getByLabel("导出格式", { exact: true }).isVisible()))
    await page.getByRole("button", { name: "导出方案", exact: true }).click();
  await page.getByLabel("导出格式", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "生成文件", exact: true }).click();
}
