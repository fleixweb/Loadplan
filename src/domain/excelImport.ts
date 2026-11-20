import type { Cargo } from "./types";
import { changeCargo, cargoIssues, isCylinder, SHAPES } from "./cargoModel";
import { COLORS } from "./sample";

export interface ImportSheet {
  name: string;
  rows: string[][];
}
export const IMPORT_FIELDS = [
  ["name", "产品名称"],
  ["model", "型号"],
  ["quantity", "数量"],
  ["weight", "单件毛重"],
  ["length", "长"],
  ["width", "宽"],
  ["height", "高"],
  ["dimensions", "组合尺寸（长×宽×高）"],
  ["diameter", "圆柱直径"],
  ["axisLength", "圆柱轴向长度 / 高度"],
  ["shape", "货物形态"],
  ["serial", "序列号"],
  ["unit", "装载单位"],
  ["maxLayers", "最多层数"],
  ["stackable", "允许叠放"],
  ["bottomOnly", "只能放底层"],
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number][0];
export interface ImportOptions {
  header: number;
  start: number;
  mapping: Partial<Record<ImportField, number>>;
  lengthUnit: "mm" | "cm" | "m";
  weightUnit: "kg" | "g" | "t";
  shape: NonNullable<Cargo["shape"]>;
  weight: number;
  quantity: number;
  maxLayers: number;
  stackable: boolean;
  bottomOnly: boolean;
  group: boolean;
  dimensionBasis: "body" | "shipping";
}
export const defaultImportOptions = (): ImportOptions => ({
  header: 1,
  start: 2,
  mapping: {},
  lengthUnit: "mm",
  weightUnit: "kg",
  shape: "box",
  weight: NaN,
  quantity: 1,
  maxLayers: 1,
  stackable: false,
  bottomOnly: false,
  group: true,
  dimensionBasis: "body",
});

export async function readWorkbook(bytes: ArrayBuffer): Promise<ImportSheet[]> {
  if (bytes.byteLength > 20 * 1024 * 1024)
    throw new Error("文件超过 20 MB，请拆分后导入。");
  const { unzipSync } = await import("fflate");
  let expanded = 0;
  unzipSync(new Uint8Array(bytes), {
    filter(file) {
      expanded += file.originalSize;
      if (expanded > 60 * 1024 * 1024)
        throw new Error("工作簿解压内容超过 60 MB，请拆分后导入。");
      return false;
    },
  });
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > 10000 || sheet.columnCount > 100)
      throw new Error(
        "每个工作表最多支持 10000 行、100 列，请先删去多余区域。",
      );
    const rows: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = sheet.getCell(r, col);
        let value = cell.value;
        if (value && typeof value === "object" && "formula" in value)
          value = value.result ?? "#公式缺少缓存结果";
        let text =
          value == null
            ? ""
            : typeof value === "object" && "richText" in value
              ? value.richText.map((v) => v.text).join("")
              : typeof value === "object" && "text" in value
                ? value.text
                : String(value);
        if (typeof value === "number" && /^0+$/.test(cell.numFmt))
          text = String(value).padStart(cell.numFmt.length, "0");
        row.push(text.trim());
      }
      rows.push(row);
    }
    return { name: sheet.name, rows };
  });
}

const aliases: Record<ImportField, string[]> = {
  name: ["产品名称", "货物名称", "品名", "name", "productname", "description"],
  model: ["型号", "model", "sku", "itemno"],
  quantity: ["数量", "qty", "quantity", "件数"],
  weight: ["毛重", "单件毛重", "单重", "grossweight", "weight", "gw"],
  length: ["长", "长度", "length", "l"],
  width: ["宽", "宽度", "width", "w"],
  height: ["高", "高度", "height", "h"],
  dimensions: ["尺寸", "产品规格", "productsize", "dimensions", "size", "lwh"],
  diameter: ["直径", "圆柱直径", "外径", "diameter"],
  axisLength: ["轴向长度", "轴长", "axislength"],
  shape: ["形态", "货物形态", "shape"],
  serial: ["序列号", "serialnumber", "serial", "sn"],
  unit: ["单位", "unit"],
  maxLayers: ["最多层数", "最大层数", "maxlayers"],
  stackable: ["允许叠放", "stackable"],
  bottomOnly: ["只能放底层", "bottomonly"],
};
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
const shapeKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
export function guessMapping(headers: string[]): ImportOptions["mapping"] {
  const mapping: ImportOptions["mapping"] = {};
  for (const [field] of IMPORT_FIELDS) {
    const col = headers.findIndex((h) =>
      aliases[field].some((a) => key(h) === key(a)),
    );
    if (col >= 0) mapping[field] = col;
  }
  return mapping;
}
export function parseNumber(s: string): number {
  if (!s.trim()) return NaN;
  if (s.includes(",") && !/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s.trim()))
    return NaN;
  const clean = s.trim().replace(/,/g, "");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean) ? Number(clean) : NaN;
}
export interface ImportRow {
  row: number;
  cargo: Cargo;
  errors: string[];
}
export function previewImport(
  sheet: ImportSheet,
  options: ImportOptions,
  edits: Record<number, Partial<Cargo>> = {},
): ImportRow[] {
  const scale = { mm: 1, cm: 10, m: 1000 }[options.lengthUnit];
  const weightScale = { kg: 1, g: 0.001, t: 1000 }[options.weightUnit];
  const rows: ImportRow[] = [];
  for (let i = options.start - 1; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i];
    if (raw.every((v) => !v)) continue;
    const mappedColumns = Object.values(options.mapping).filter(
      (col): col is number => col !== undefined,
    );
    if (
      mappedColumns.length >= 2 &&
      mappedColumns.every(
        (col) => raw[col] === sheet.rows[options.header - 1]?.[col],
      )
    )
      continue;
    const get = (field: ImportField) => raw[options.mapping[field] ?? -1] ?? "";
    const name = get("name") || get("model");
    if (/^(合计|小计|total|subtotal)$/i.test(name.trim())) continue;
    const errors: string[] = [];
    const dimensionText = get("dimensions").trim();
    const dimensions = dimensionText
      ? dimensionText.split(/\s*[xX×*＊]\s*/).map(parseNumber)
      : [];
    if (dimensionText && dimensions.length !== 3)
      errors.push("组合尺寸必须包含按长、宽、高排列的三个数字。");
    const shapeText = get("shape");
    const shape =
      SHAPES.find(
        ([id, title]) =>
          shapeKey(id) === shapeKey(shapeText) ||
          shapeKey(title) === shapeKey(shapeText),
      )?.[0] ?? options.shape;
    if (
      shapeText &&
      !SHAPES.some(
        ([id, title]) =>
          shapeKey(id) === shapeKey(shapeText) ||
          shapeKey(title) === shapeKey(shapeText),
      )
    )
      errors.push("形态无法识别，请在预览中选择。");
    const numeric = (field: ImportField, fallback: number) =>
      get(field) ? parseNumber(get(field)) : fallback;
    const flag = (field: ImportField, fallback: boolean) => {
      const value = get(field).toLowerCase();
      if (!value) return fallback;
      if (["是", "允许", "true", "yes", "1"].includes(value)) return true;
      if (["否", "不允许", "false", "no", "0"].includes(value)) return false;
      errors.push(`${field === "stackable" ? "叠放" : "底层"}设置应为是或否。`);
      return fallback;
    };
    const x = numeric("length", dimensions[0] ?? NaN) * scale;
    const y = numeric("width", dimensions[1] ?? NaN) * scale;
    const z = numeric("height", dimensions[2] ?? NaN) * scale;
    const cylinder = shape.startsWith("cylinder");
    const shipping = cylinder && options.dimensionBasis === "shipping";
    const diameter =
      numeric(
        "diameter",
        shipping ? NaN : (shape === "cylinder-x" ? y : x) / scale,
      ) * scale;
    const length =
      numeric(
        "axisLength",
        shipping
          ? NaN
          : (shape === "cylinder-x" ? x : shape === "cylinder-y" ? y : z) /
              scale,
      ) * scale;
    const cargo: Cargo = {
      id: `import-${i + 1}`,
      name: name || `第 ${i + 1} 行货物`,
      model: get("model") || undefined,
      originalUnit: get("unit") || undefined,
      support: shipping,
      size: { x, y, z },
      shape,
      cylinderDiameter: cylinder ? diameter : undefined,
      cylinderLength: cylinder ? length : undefined,
      quantity: numeric("quantity", options.quantity),
      weight: numeric("weight", options.weight) * weightScale,
      maxLayers: numeric("maxLayers", options.maxLayers),
      rotation: "upright",
      stackable: flag("stackable", options.stackable),
      bottomOnly: flag("bottomOnly", options.bottomOnly),
      loadUnit: /^(托|整托|pallet)$/i.test(get("unit")) ? "pallet" : "carton",
      color: COLORS[rows.length % COLORS.length],
      serialNumbers: get("serial") ? [get("serial")] : undefined,
      sources: [{ sheet: sheet.name, row: i + 1 }],
    };
    const palletCylinder = cylinder && cargo.loadUnit === "pallet";
    const edited = changeCargo(
      palletCylinder ? cargo : changeCargo(cargo, {}),
      edits[i + 1] ?? {},
    );
    // Preserve the supplied outer dimensions while the pallet shape is unresolved.
    if (palletCylinder && edited.loadUnit === "pallet" && isCylinder(edited))
      edited.size = cargo.size;
    if (
      shipping &&
      ![edited.size.x, edited.size.y, edited.size.z].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    )
      errors.push("请映射含支撑的整体长、宽、高。");
    if (edits[i + 1]?.shape) {
      const index = errors.indexOf("形态无法识别，请在预览中选择。");
      if (index >= 0) errors.splice(index, 1);
    }
    errors.push(...cargoIssues(edited));
    if (!Number.isSafeInteger(edited.quantity) || edited.quantity < 1)
      errors.push("数量必须为正整数。");
    if (!Number.isSafeInteger(edited.maxLayers) || edited.maxLayers < 1)
      errors.push("最多层数必须为正整数。");
    rows.push({ row: i + 1, cargo: edited, errors });
  }
  const serials = new Set<string>();
  for (const row of rows)
    for (const s of row.cargo.serialNumbers ?? []) {
      const id = `${row.cargo.model ?? row.cargo.name}/${s}`;
      if (serials.has(id)) row.errors.push("同产品序列号重复。");
      serials.add(id);
    }
  return rows;
}

export function collectImport(rows: ImportRow[], group: boolean): Cargo[] {
  if (!rows.length || rows.some((r) => r.errors.length))
    throw new Error("请先修正预览中的错误。");
  const groups = new Map<string, Cargo>();
  for (const row of rows) {
    const c = structuredClone(row.cargo);
    const { id, quantity, serialNumbers, sources, color, ...definition } = c;
    const signature = group
      ? JSON.stringify({ ...definition, hasSerials: !!serialNumbers?.length })
      : id;
    const previous = groups.get(signature);
    if (previous) {
      previous.quantity += quantity;
      previous.sources!.push(...sources!);
      if (serialNumbers) previous.serialNumbers!.push(...serialNumbers);
    } else groups.set(signature, c);
  }
  const cargo = [...groups.values()].map((c, i) => ({
    ...c,
    id: `SKU-${crypto.randomUUID()}`,
    color: COLORS[i % COLORS.length],
  }));
  if (cargo.length > 200)
    throw new Error("导入后最多支持 200 种规格，请拆分清单。");
  if (!Number.isSafeInteger(cargo.reduce((sum, c) => sum + c.quantity, 0)))
    throw new Error("货物总数量超出可精确计算的整数范围。");
  return cargo;
}
