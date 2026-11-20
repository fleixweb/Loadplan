import { prepareCargo, fillCargo } from "./workflow";
import { expect, test } from "@playwright/test";
import { calculate } from "./workflow";

test("常驻导航打开对应弹窗，重复选择可编辑，混装切单品需确认", async ({
  page,
}, info) => {
  await page.goto("/");
  await prepareCargo(page);
  const goods = page.getByRole("group", { name: "货物组合方式", exact: true });
  const containers = page.getByRole("group", {
    name: "柜子计算方式",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "计算步骤提示", exact: true }),
  ).toBeVisible();
  await expect(goods).toBeVisible();
  await expect(containers).toBeVisible();
  await expect(containers.getByRole("button")).toHaveCount(3);
  await goods
    .getByRole("button", { name: "多种产品混装", exact: true })
    .click();
  const cargoDialog = page.getByRole("dialog", {
    name: "编辑货物",
    exact: true,
  });
  await page.getByRole("button", { name: "添加货物规格", exact: true }).click();
  await fillCargo(page, 1);
  await expect(cargoDialog.locator(".cargo-card")).toHaveCount(2);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await goods
    .getByRole("button", { name: "单一产品装柜", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "选择保留的货物" }),
  ).toBeVisible();
  await expect(cargoDialog.locator(".cargo-card")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".cargo-nav-list li")).toHaveCount(2);
  await goods
    .getByRole("button", { name: "单一产品装柜", exact: true })
    .click();
  await page.getByLabel("保留货物", { exact: true }).selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "确认仅保留所选规格", exact: true })
    .click();
  await expect(cargoDialog.locator(".cargo-card")).toHaveCount(1);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".input-overview tbody tr")).toHaveCount(1);
  for (const mode of ["单柜计算", "指定多个柜子", "自动估算柜数"]) {
    await containers.getByRole("button", { name: mode, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "设置柜子", exact: true });
    await expect(
      dialog.getByRole("heading", { name: mode, exact: true }),
    ).toBeVisible();
    if (mode === "指定多个柜子")
      await expect(
        page.getByLabel("柜型 1 数量", { exact: true }),
      ).toBeVisible();
    if (mode === "自动估算柜数")
      await expect(
        page.getByLabel("自动估算组合目标", { exact: true }),
      ).toBeVisible();
    await page
      .getByRole("button", { name: "完成柜子设置", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await containers.getByRole("button", { name: mode, exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.screenshot({
    path: info.outputPath("navigation-desktop.png"),
    fullPage: true,
  });
  await expect(
    page.locator(
      ".cargo-nav-mode, .nav-setting-summary, .input-panel .input-summary",
    ),
  ).toHaveCount(0);
  const overview = page.locator(".input-overview");
  await expect(overview.locator(".overview-selection")).toHaveText([
    "单一产品装柜",
    "自动估算柜数",
  ]);
  await expect(overview).toContainText("可用柜型：");
  await expect(overview).toContainText("每柜尽量多装 · 最多 20 柜");
  await expect(overview.locator(".overview-selection").first()).toHaveCSS(
    "color",
    "rgb(180, 83, 9)",
  );
  await containers
    .getByRole("button", { name: "自动估算柜数", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("container-dialog-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "完成柜子设置", exact: true }).click();
  await page.getByRole("button", { name: "导入 Excel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "导入 Excel", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await calculate(page);
  await expect(goods).toBeVisible();
  await expect(containers).toBeVisible();
  await expect(
    page.getByRole("button", { name: "计算装柜方案", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
