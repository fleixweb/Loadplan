import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Save, Upload, X } from "lucide-react";
import type { Cargo } from "../domain/types";
import { bodySize, changeCargo, SHAPES } from "../domain/cargoModel";
import {
  collectImport,
  defaultImportOptions,
  guessMapping,
  IMPORT_FIELDS,
  previewImport,
  readWorkbook,
  type ImportOptions,
  type ImportSheet,
} from "../domain/excelImport";
import NumberField from "./NumberField";
import { saveFile } from "../platform/files";

const MAPPING_KEY = "loadplan-excel-mapping-v1";
export default function ExcelImport({
  onImport,
  onClose,
  defaultReplace = false,
}: {
  onImport: (cargo: Cargo[], replace: boolean) => void;
  onClose: () => void;
  defaultReplace?: boolean;
}) {
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [selected, setSelected] = useState(0);
  const [options, setOptions] = useState<ImportOptions>(defaultImportOptions);
  const [edits, setEdits] = useState<Record<number, Partial<Cargo>>>({});
  const [replace, setReplace] = useState(defaultReplace);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const sheet = sheets[selected];
  const headers = sheet?.rows[options.header - 1] ?? [];
  const rows = useMemo(
    () => (sheet ? previewImport(sheet, options, edits) : []),
    [sheet, options, edits],
  );
  const invalid = rows.filter((r) => r.errors.length).length;
  const filteredRows = rows.filter((r) =>
    `${r.cargo.name} ${r.cargo.model ?? ""}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const update = (patch: Partial<ImportOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
    setPage(0);
    setMessage("");
    if (
      patch.mapping ||
      patch.header !== undefined ||
      patch.start !== undefined ||
      patch.lengthUnit ||
      patch.weightUnit ||
      patch.dimensionBasis
    ) {
      setEdits({});
      setChecked([]);
    }
  };
  const resetSheet = (index: number) => {
    setSelected(index);
    setEdits({});
    setPage(0);
    setChecked([]);
    setFilter("");
    setOptions((o) => ({
      ...o,
      header: 1,
      start: 2,
      mapping: guessMapping(sheets[index].rows[0] ?? []),
    }));
  };
  const editRow = (row: number, patch: Partial<Cargo>) => {
    const current = rows.find((r) => r.row === row)?.cargo;
    if (current)
      setEdits((old) => ({ ...old, [row]: changeCargo(current, patch) }));
  };
  const load = async (selectedFile: File) => {
    setBusy(true);
    setMessage("");
    try {
      if (!/\.xlsx$/i.test(selectedFile.name))
        throw new Error("请选择 .xlsx 工作簿；旧版 .xls 请先另存为 .xlsx。");
      const data = await readWorkbook(await selectedFile.arrayBuffer());
      if (!data.length) throw new Error("工作簿没有可用工作表。");
      setFileName(selectedFile.name);
      setSheets(data);
      setSelected(0);
      setEdits({});
      setPage(0);
      setChecked([]);
      setFilter("");
      setOptions({
        ...defaultImportOptions(),
        mapping: guessMapping(data[0].rows[0] ?? []),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取工作簿失败。");
    } finally {
      setBusy(false);
    }
  };
  const saveMapping = () => {
    try {
      localStorage.setItem(
        MAPPING_KEY,
        JSON.stringify({
          headers,
          options: {
            ...options,
            weight: Number.isFinite(options.weight) ? options.weight : null,
          },
        }),
      );
      setMessage("字段映射已保存在本机。");
    } catch {
      setMessage("浏览器无法保存映射；仍可继续导入。");
    }
  };
  const restoreMapping = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? "null");
      if (!saved) throw new Error("本机尚未保存字段映射。");
      if (JSON.stringify(saved.headers) !== JSON.stringify(headers))
        throw new Error("列名称或顺序与保存时不同，请重新映射后保存。");
      setOptions({
        ...defaultImportOptions(),
        ...saved.options,
        weight: saved.options.weight ?? NaN,
      });
      setEdits({});
      setPage(0);
      setMessage("已应用本机映射，请核对单位与预览。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "映射无法读取。");
    }
  };
  const template = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("货物清单");
      ws.addRow([
        "产品名称",
        "型号",
        "数量",
        "单件毛重(kg)",
        "长(mm)",
        "宽(mm)",
        "高(mm)",
        "货物形态",
        "圆柱直径(mm)",
        "轴向长度(mm)",
        "序列号",
        "允许叠放",
        "最多层数",
      ]);
      ws.getRow(1).font = { bold: true };
      ws.columns.forEach((col) => (col.width = 20));
      const buffer = await workbook.xlsx.writeBuffer();
      await saveFile(
        new Blob([new Uint8Array(buffer)]),
        "Loadplan-货物导入模板.xlsx",
      );
    } catch {
      setMessage("模板生成失败，请重试。");
    }
  };
  return (
    <section
      className={`import-workspace ${sheet ? "has-workbook" : "is-empty"}`}
      aria-label="Excel 导入"
    >
      <div className="section-heading">
        <h2>
          <FileSpreadsheet size={20} />
          Excel 导入
        </h2>
        <button
          className="icon-button"
          title="关闭导入"
          aria-label="关闭导入"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div
        className={`import-file-area ${dragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped && !busy) void load(dropped);
        }}
      >
        {!sheet && (
          <FileSpreadsheet
            className="import-file-symbol"
            size={40}
            strokeWidth={1.4}
            aria-hidden="true"
          />
        )}
        {sheet && (
          <span className="import-file-name" title={fileName}>
            <FileSpreadsheet size={18} />
            {fileName}
          </span>
        )}
        <div className="import-toolbar import-file-actions">
          <input
            ref={file}
            aria-label="选择 Excel 文件"
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void load(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            className="button primary"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            {busy ? "正在读取…" : "选择 Excel 文件"}
          </button>
          <button className="button" onClick={() => void template()}>
            <FileSpreadsheet size={16} />
            下载空白模板
          </button>
          {sheets.length > 0 && (
            <label className="inline-field">
              工作表
              <select
                aria-label="导入工作表"
                value={selected}
                onChange={(e) => resetSheet(Number(e.target.value))}
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {message && (
        <p className="import-message" role="status">
          {message}
        </p>
      )}
      {sheet && (
        <>
          <div className="import-settings">
            <NumberField
              label="表头所在行"
              min={1}
              max={sheet.rows.length}
              value={options.header}
              onChange={(n) =>
                update({
                  header: n,
                  start: n + 1,
                  mapping: guessMapping(sheet.rows[n - 1] ?? []),
                })
              }
            />
            <NumberField
              label="数据起始行"
              min={1}
              max={sheet.rows.length}
              value={options.start}
              onChange={(n) => update({ start: n })}
            />
            <label className="number-field">
              <span>尺寸单位</span>
              <select
                aria-label="导入尺寸单位"
                value={options.lengthUnit}
                onChange={(e) =>
                  update({
                    lengthUnit: e.target.value as ImportOptions["lengthUnit"],
                  })
                }
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </label>
            <label className="number-field">
              <span>重量单位</span>
              <select
                aria-label="导入重量单位"
                value={options.weightUnit}
                onChange={(e) =>
                  update({
                    weightUnit: e.target.value as ImportOptions["weightUnit"],
                  })
                }
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="t">t</option>
              </select>
            </label>
          </div>
          <label className="number-field import-dimension-basis">
            <span>表中长宽高的含义</span>
            <select
              aria-label="导入尺寸含义"
              value={options.dimensionBasis}
              onChange={(e) =>
                update({
                  dimensionBasis: e.target
                    .value as ImportOptions["dimensionBasis"],
                })
              }
            >
              <option value="body">产品本体 / 普通包装外尺寸</option>
              <option value="shipping">
                圆柱含底座或支架整体占位（另映射本体直径与轴长）
              </option>
            </select>
          </label>
          <details className="raw-sheet">
            <summary>原始工作表预览</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>原始行</th>
                    {Array.from(
                      {
                        length: Math.max(
                          0,
                          ...sheet.rows.slice(0, 15).map((r) => r.length),
                        ),
                      },
                      (_, i) => (
                        <th key={i}>列 {i + 1}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 15).map((row, i) => (
                    <tr key={i}>
                      <th>{i + 1}</th>
                      {row.map((value, j) => (
                        <td key={j}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="import-toolbar">
            <h3>字段对应</h3>
            <button className="button" onClick={saveMapping}>
              <Save size={14} />
              保存映射
            </button>
            <button className="button" onClick={restoreMapping}>
              使用已存映射
            </button>
          </div>
          <div className="mapping-grid">
            {IMPORT_FIELDS.map(([id, title]) => (
              <label className="number-field" key={id}>
                <span>{title}</span>
                <select
                  aria-label={`映射${title}`}
                  value={options.mapping[id] ?? ""}
                  onChange={(e) =>
                    update({
                      mapping: {
                        ...options.mapping,
                        [id]:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      },
                    })
                  }
                >
                  <option value="">不使用此列</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      第 {i + 1} 列 · {h || "无表头"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <details className="import-defaults" open>
            <summary>未提供字段的补充设置</summary>
            <div className="import-settings">
              <label className="number-field">
                <span>默认货物形态</span>
                <select
                  aria-label="导入默认形态"
                  value={options.shape}
                  onChange={(e) =>
                    update({ shape: e.target.value as Cargo["shape"] })
                  }
                >
                  {SHAPES.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label={`缺失毛重 / ${options.weightUnit}`}
                value={options.weight}
                min={0.001}
                step={0.1}
                onChange={(n) => update({ weight: n })}
              />
              <NumberField
                label="缺失数量"
                value={options.quantity}
                onChange={(n) => update({ quantity: n })}
              />
              <NumberField
                label="默认最多层数"
                value={options.maxLayers}
                onChange={(n) => update({ maxLayers: n })}
              />
            </div>
            <div className="import-toolbar">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={options.stackable}
                  onChange={(e) => update({ stackable: e.target.checked })}
                />
                默认允许叠放
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={options.bottomOnly}
                  onChange={(e) => update({ bottomOnly: e.target.checked })}
                />
                默认只能放底层
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={options.group}
                  onChange={(e) => update({ group: e.target.checked })}
                />
                合并相同产品、尺寸与装载规则
              </label>
            </div>
          </details>
          <div className="import-toolbar">
            <h3>导入预览</h3>
            <span>
              {rows.length} 行 · {invalid} 行待修正
            </span>
            <label className="inline-field">
              加入方式
              <select
                aria-label="导入加入方式"
                value={replace ? "replace" : "append"}
                onChange={(e) => setReplace(e.target.value === "replace")}
              >
                <option value="append">追加到现有清单</option>
                <option value="replace">替换现有清单</option>
              </select>
            </label>
          </div>
          <div className="import-toolbar">
            <label className="inline-field">
              筛选产品
              <input
                aria-label="筛选导入产品"
                placeholder="名称或型号"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={
                  filteredRows.length > 0 &&
                  filteredRows.every((r) => checked.includes(r.row))
                }
                onChange={(e) =>
                  setChecked(
                    e.target.checked
                      ? [
                          ...new Set([
                            ...checked,
                            ...filteredRows.map((r) => r.row),
                          ]),
                        ]
                      : checked.filter(
                          (n) => !filteredRows.some((r) => r.row === n),
                        ),
                  )
                }
              />
              选择筛选结果
            </label>
            <button
              className="button"
              disabled={!checked.length}
              onClick={() => {
                const patch: Partial<Cargo> = {
                  shape: options.shape,
                  maxLayers: options.maxLayers,
                  stackable: options.stackable,
                  bottomOnly: options.bottomOnly,
                };
                if (Number.isFinite(options.weight))
                  patch.weight =
                    options.weight *
                    { kg: 1, g: 0.001, t: 1000 }[options.weightUnit];
                setEdits((old) => {
                  const next = { ...old };
                  for (const row of rows.filter((r) => checked.includes(r.row)))
                    next[row.row] = changeCargo(row.cargo, patch);
                  return next;
                });
              }}
            >
              对选中 {checked.length} 行应用补充设置
            </button>
          </div>
          <div className="table-scroll import-preview">
            <table>
              <thead>
                <tr>
                  <th>原始行</th>
                  <th>产品 / 型号</th>
                  <th>货物形态</th>
                  <th>本体尺寸 / mm</th>
                  <th>数量</th>
                  <th>毛重 / kg</th>
                  <th>序列号</th>
                  <th>检查</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows
                  .slice(page * 25, (page + 1) * 25)
                  .map(({ row, cargo: c, errors }) => {
                    const b = bodySize(c);
                    return (
                      <tr key={row}>
                        <td>
                          <label className="check-row">
                            <input
                              aria-label={`选择第 ${row} 行`}
                              type="checkbox"
                              checked={checked.includes(row)}
                              onChange={(e) =>
                                setChecked(
                                  e.target.checked
                                    ? [...checked, row]
                                    : checked.filter((n) => n !== row),
                                )
                              }
                            />
                            {row}
                          </label>
                        </td>
                        <td>
                          {c.name}
                          <small>{c.model}</small>
                        </td>
                        <td>
                          <select
                            aria-label={`第 ${row} 行形态`}
                            value={c.shape}
                            onChange={(e) =>
                              editRow(row, {
                                shape: e.target.value as Cargo["shape"],
                              })
                            }
                          >
                            {SHAPES.map(([id, title]) => (
                              <option key={id} value={id}>
                                {title}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="preview-size">
                            {(c.shape?.startsWith("cylinder")
                              ? ["diameter", "length"]
                              : ["x", "y", "z"]
                            ).map((axis) => (
                              <input
                                key={axis}
                                aria-label={`第 ${row} 行${axis}`}
                                type="number"
                                min={0.001}
                                value={
                                  Number.isFinite(
                                    axis === "diameter"
                                      ? c.cylinderDiameter
                                      : axis === "length"
                                        ? c.cylinderLength
                                        : b[axis as keyof typeof b],
                                  )
                                    ? axis === "diameter"
                                      ? c.cylinderDiameter
                                      : axis === "length"
                                        ? c.cylinderLength
                                        : b[axis as keyof typeof b]
                                    : ""
                                }
                                onChange={(e) =>
                                  editRow(
                                    row,
                                    axis === "diameter"
                                      ? {
                                          cylinderDiameter: Number(
                                            e.target.value,
                                          ),
                                        }
                                      : axis === "length"
                                        ? {
                                            cylinderLength: Number(
                                              e.target.value,
                                            ),
                                          }
                                        : {
                                            bodySize: {
                                              ...b,
                                              [axis]: Number(e.target.value),
                                            },
                                          },
                                  )
                                }
                              />
                            ))}
                          </div>
                        </td>
                        <td>
                          <input
                            aria-label={`第 ${row} 行数量`}
                            type="number"
                            value={
                              Number.isFinite(c.quantity) ? c.quantity : ""
                            }
                            onChange={(e) =>
                              editRow(row, { quantity: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`第 ${row} 行毛重`}
                            type="number"
                            step="0.1"
                            value={Number.isFinite(c.weight) ? c.weight : ""}
                            onChange={(e) =>
                              editRow(row, { weight: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`第 ${row} 行序列号`}
                            value={c.serialNumbers?.join(", ") ?? ""}
                            onChange={(e) =>
                              editRow(row, {
                                serialNumbers: e.target.value.trim()
                                  ? e.target.value
                                      .split(/[,，]/)
                                      .map((s) => s.trim())
                                  : undefined,
                              })
                            }
                          />
                        </td>
                        <td className={errors.length ? "failed" : "passed"}>
                          {errors.join(" ") || "可导入"}
                          <details className="row-loading-rules">
                            <summary>装载规则</summary>
                            <NumberField
                              label={`第 ${row} 行最多层数`}
                              value={c.maxLayers}
                              onChange={(n) => editRow(row, { maxLayers: n })}
                            />
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={c.stackable === true}
                                onChange={(e) =>
                                  editRow(row, { stackable: e.target.checked })
                                }
                              />
                              允许叠放
                            </label>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={c.bottomOnly === true}
                                onChange={(e) =>
                                  editRow(row, { bottomOnly: e.target.checked })
                                }
                              />
                              只能放底层
                            </label>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="import-toolbar">
            <button
              className="button"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(filteredRows.length / 25))}
            </span>
            <button
              className="button"
              disabled={(page + 1) * 25 >= filteredRows.length}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !rows.length ||
                invalid > 0 ||
                !Number.isSafeInteger(options.start) ||
                options.start < 1
              }
              onClick={() => {
                try {
                  onImport(collectImport(rows, options.group), replace);
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "导入失败。",
                  );
                }
              }}
            >
              <Upload size={16} />
              确认导入
            </button>
          </div>
        </>
      )}
    </section>
  );
}
