import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  collectImport,
  defaultImportOptions,
  guessMapping,
  parseNumber,
  previewImport,
  readWorkbook,
} from "../src/domain/excelImport";

describe("通用 Excel 导入", () => {
  it("三种中文圆柱形态互不混淆，含支架尺寸单独校验", () => {
    const sheet = {
      name: "表",
      rows: [
        ["型号", "长", "宽", "高", "圆柱直径", "轴向长度", "货物形态", "毛重"],
        ["管", "1200", "400", "500", "250", "1000", "圆柱（沿柜长横放）", "10"],
      ],
    };
    const rows = previewImport(sheet, {
      ...defaultImportOptions(),
      mapping: guessMapping(sheet.rows[0]),
      dimensionBasis: "shipping",
    });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].cargo.shape).toBe("cylinder-x");
    expect(rows[0].cargo.size).toEqual({ x: 1200, y: 400, z: 500 });
    expect(rows[0].cargo.bodySize).toEqual({ x: 1000, y: 250, z: 250 });
    expect(rows[0].cargo.support).toBe(true);
  });
  it("歧义逗号不静默当千分位处理", () => {
    expect(parseNumber("1,500")).toBe(1500);
    expect(parseNumber("1,5")).toBeNaN();
  });
  it("分列尺寸、单位换算、同型号序列号汇总，保留原始行号", () => {
    const headers = [
      "Model",
      "Length",
      "Width",
      "Height",
      "Qty",
      "Weight",
      "Serial number",
    ];
    const sheet = {
      name: "产品",
      rows: [
        headers,
        ["M001", "270", "160", "69", "1", "15000", "001"],
        ["M001", "270", "160", "69", "1", "15000", "002"],
      ],
    };
    const options = {
      ...defaultImportOptions(),
      mapping: guessMapping(headers),
      lengthUnit: "cm" as const,
      weightUnit: "g" as const,
    };
    const rows = previewImport(sheet, options);
    expect(rows.every((r) => !r.errors.length)).toBe(true);
    const result = collectImport(rows, true);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(result[0].size).toEqual({ x: 2700, y: 1600, z: 690 });
    expect(result[0].weight).toBe(15);
    expect(result[0].serialNumbers).toEqual(["001", "002"]);
    expect(result[0].sources).toEqual([
      { sheet: "产品", row: 2 },
      { sheet: "产品", row: 3 },
    ]);
  });
  it("组合尺寸、混合形态和行级补充使用相同占位逻辑", () => {
    const sheet = {
      name: "清单",
      rows: [
        ["品名", "尺寸", "形态", "数量", "毛重"],
        ["箱", "600×400×400", "box", "2", "15"],
        ["管", "11800*250*250", "cylinder-x", "3", "10"],
      ],
    };
    const rows = previewImport(sheet, {
      ...defaultImportOptions(),
      mapping: guessMapping(sheet.rows[0]),
    });
    expect(rows[1].cargo.size).toEqual({ x: 11800, y: 250, z: 250 });
    expect(collectImport(rows, true)).toHaveLength(2);
    const edited = previewImport(
      sheet,
      { ...defaultImportOptions(), mapping: guessMapping(sheet.rows[0]) },
      { 3: { cylinderDiameter: 300 } },
    );
    expect(edited[1].cargo.size.y).toBe(300);
  });
  it("缺重量、重复编号、序列号与数量不符都阻止确认", () => {
    const headers = ["型号", "尺寸", "数量", "序列号"];
    const sheet = {
      name: "表",
      rows: [headers, ["M", "1x2x3", "2", "001"], ["M", "1x2x3", "1", "001"]],
    };
    const rows = previewImport(sheet, {
      ...defaultImportOptions(),
      mapping: guessMapping(headers),
    });
    expect(rows[0].errors.join()).toContain("毛重");
    expect(rows[0].errors.join()).toContain("序列号数量");
    expect(rows[1].errors.join()).toContain("重复");
    expect(() => collectImport(rows, true)).toThrow();
  });
  it("同型号不同尺寸或重量不能合并，空行与合计行可跳过", () => {
    const sheet = {
      name: "表",
      rows: [
        ["型号", "尺寸", "毛重"],
        ["M", "1x2x3", "1"],
        ["M", "1x2x4", "1"],
        ["M", "1x2x3", "2"],
        [],
        ["合计", "", "4"],
      ],
    };
    const rows = previewImport(sheet, {
      ...defaultImportOptions(),
      mapping: guessMapping(sheet.rows[0]),
    });
    expect(collectImport(rows, true)).toHaveLength(3);
  });
  it("读取真实工作簿结构：多行表头、合并单元格、前导零及缓存公式", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("设备");
    ws.mergeCells("A1:G1");
    ws.getCell("A1").value = "装箱清单";
    ws.addRow(["型号", "长", "宽", "高", "数量", "毛重", "序列号"]);
    ws.addRow(["M", 2700, 1600, 690, 1, { formula: "10+5", result: 15 }, 1]);
    ws.getCell("G3").numFmt = "0000";
    const bytes = await workbook.xlsx.writeBuffer();
    const sheets = await readWorkbook(new Uint8Array(bytes).buffer);
    expect(sheets[0].rows[2][6]).toBe("0001");
    const rows = previewImport(sheets[0], {
      ...defaultImportOptions(),
      header: 2,
      start: 3,
      mapping: guessMapping(sheets[0].rows[1]),
    });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].cargo.weight).toBe(15);
  });
});
