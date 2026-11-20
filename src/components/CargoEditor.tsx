import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import type { Cargo, Vec3 } from "../domain/types";
import {
  bodySize,
  cargoIssues,
  isCylinder,
  SHAPES,
} from "../domain/cargoModel";
import { countUnit } from "../domain/units";
import NumberField from "./NumberField";

export default function CargoEditor({
  cargo: c,
  index,
  onChange,
  onRemove,
  removable,
  expanded,
  onToggle,
}: {
  cargo: Cargo;
  index: number;
  onChange: (patch: Partial<Cargo>) => void;
  onRemove: () => void;
  removable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cylinder = isCylinder(c);
  const horizontal = c.shape === "cylinder-x" || c.shape === "cylinder-y";
  const body = bodySize(c);
  const issues = cargoIssues(c);
  return (
    <article className="cargo-card">
      <div className="cargo-title">
        <span className="cargo-swatch" style={{ backgroundColor: c.color }}>
          {index + 1}
        </span>
        <label className="cargo-name-editor" title="修改产品名称">
          <input
            aria-label={`货物 ${index + 1} 名称`}
            required
            aria-invalid={!c.name.trim()}
            value={c.name}
            placeholder="请输入产品名称"
            maxLength={200}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Pencil size={13} />
        </label>
        <button
          type="button"
          className="cargo-expand"
          aria-label={`${expanded ? "收起" : "展开"}货物 ${index + 1}`}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button
          title="删除货物"
          aria-label={`删除货物 ${index + 1}`}
          disabled={!removable}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {expanded ? (
        <div className="cargo-editor-fields">
          <label className="number-field shape-field">
            <span>货物形态</span>
            <select
              aria-label={`货物 ${index + 1} 货物形态`}
              value={c.shape ?? "box"}
              onChange={(e) =>
                onChange({ shape: e.target.value as Cargo["shape"] })
              }
            >
              {SHAPES.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          {cylinder ? (
            <div className="two-fields horizontal-dimensions">
              <NumberField
                label={horizontal ? "圆柱直径 (mm)" : "直径 (mm)"}
                value={c.cylinderDiameter ?? body.x}
                onChange={(n) => onChange({ cylinderDiameter: n })}
              />
              <NumberField
                label={horizontal ? "轴向长度 (mm)" : "高度 (mm)"}
                value={c.cylinderLength ?? body.z}
                onChange={(n) => onChange({ cylinderLength: n })}
              />
            </div>
          ) : (
            <div className="three-fields">
              {(["x", "y", "z"] as const).map((axis) => (
                <NumberField
                  key={axis}
                  label={`${c.shape === "bounding-box" ? "最大占位" : c.shape?.startsWith("wood") || c.loadUnit === "pallet" ? "包装外" : ""}${{ x: "长", y: "宽", z: "高" }[axis]} (mm)`}
                  value={body[axis]}
                  onChange={(n) =>
                    onChange({ bodySize: { ...body, [axis]: n } })
                  }
                />
              ))}
            </div>
          )}
          {cylinder && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={c.support === true}
                  onChange={(e) => onChange({ support: e.target.checked })}
                />
                {horizontal ? "有防滚支架" : "有底座"}
              </label>
              {c.support && (
                <div className="support-dimensions">
                  <strong>含{horizontal ? "支架" : "底座"}整体占位</strong>
                  <div className="three-fields">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <NumberField
                        key={axis}
                        label={`占位${{ x: "长", y: "宽", z: "高" }[axis]} (mm)`}
                        value={c.size[axis]}
                        onChange={(n) =>
                          onChange({ size: { ...c.size, [axis]: n } })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
              <p className="envelope-readout">
                计算占位 {c.size.x || "—"} × {c.size.y || "—"} ×{" "}
                {c.size.z || "—"} mm
              </p>
            </>
          )}
          <div className="three-fields cargo-quantities">
            <label className="number-field unit-field">
              <span>装载单位</span>
              <select
                aria-label={`货物 ${index + 1} 装载单位`}
                value={c.loadUnit ?? "carton"}
                onChange={(e) =>
                  onChange({ loadUnit: e.target.value as Cargo["loadUnit"] })
                }
              >
                <option value="carton">
                  {c.shape && c.shape !== "box" ? "单件" : "纸箱"}
                </option>
                <option value="pallet">整托</option>
              </select>
            </label>
            <NumberField
              label={`数量 / ${countUnit([c])}`}
              value={c.quantity}
              onChange={(n) => onChange({ quantity: n })}
            />
            <NumberField
              label={
                c.support ||
                c.loadUnit === "pallet" ||
                c.shape?.startsWith("wood")
                  ? "含包装及支撑毛重 / kg"
                  : "毛重 / kg"
              }
              step={0.1}
              min={0.001}
              value={c.weight}
              onChange={(n) => onChange({ weight: n })}
            />
            <NumberField
              label="最多层数"
              value={c.maxLayers}
              onChange={(n) => onChange({ maxLayers: n })}
            />
          </div>
          <label className="rotation-field">
            <span>摆放方向</span>
            <select
              aria-label={`货物 ${index + 1} 摆放方向`}
              value={c.rotation}
              disabled={cylinder}
              onChange={(e) =>
                onChange({ rotation: e.target.value as Cargo["rotation"] })
              }
            >
              <option value="upright">
                {cylinder
                  ? c.shape === "cylinder-x"
                    ? "固定沿柜长横放"
                    : c.shape === "cylinder-y"
                      ? "固定沿柜宽横放"
                      : "仅支持直立"
                  : "保持直立，可水平旋转"}
              </option>
              <option value="free">允许侧放及倒置</option>
            </select>
          </label>
          <div
            className="cargo-rules"
            aria-label={`货物 ${index + 1} 装载要求`}
          >
            <label>
              <input
                type="checkbox"
                checked={
                  cylinder ? c.stackable === true : c.stackable !== false
                }
                onChange={(e) => onChange({ stackable: e.target.checked })}
              />
              允许叠放
            </label>
            <label>
              <input
                type="checkbox"
                checked={c.bottomOnly === true}
                onChange={(e) => onChange({ bottomOnly: e.target.checked })}
              />
              只能放底层
            </label>
            <NumberField
              label="每垛总重量上限"
              min={0}
              step={0.1}
              suffix="kg"
              value={c.maxStackWeight ?? 0}
              onChange={(n) => onChange({ maxStackWeight: n })}
            />
            <p className="rule-help">包含底层重量；0 表示不限制。</p>
          </div>
          <details className="cargo-identifiers">
            <summary>
              型号与序列号
              {c.serialNumbers?.length ? ` · ${c.serialNumbers.length} 件` : ""}
            </summary>
            <label className="number-field">
              <span>型号</span>
              <input
                aria-label={`货物 ${index + 1} 型号`}
                value={c.model ?? ""}
                onChange={(e) => onChange({ model: e.target.value })}
              />
            </label>
            <label className="number-field">
              <span>序列号（每行一件）</span>
              <textarea
                aria-label={`货物 ${index + 1} 序列号`}
                value={c.serialNumbers?.join("\n") ?? ""}
                onChange={(e) =>
                  onChange({
                    serialNumbers: e.target.value.trim()
                      ? e.target.value.split(/\r?\n/).map((s) => s.trim())
                      : undefined,
                  })
                }
              />
            </label>
            {c.originalUnit && (
              <p className="field-note">原始单位：{c.originalUnit}</p>
            )}
            {c.sources && (
              <p className="field-note">
                来源：
                {c.sources.map((s) => `${s.sheet} 第 ${s.row} 行`).join("、")}
              </p>
            )}
          </details>
          {issues.length > 0 && (
            <ul className="field-errors" role="alert">
              {issues.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="cargo-summary">
          <span>{SHAPES.find(([id]) => id === (c.shape ?? "box"))?.[1]}</span>
          <span>
            {c.size.x} × {c.size.y} × {c.size.z} mm
          </span>
          <span>
            {c.quantity} {countUnit([c])} · {c.weight} kg/件
          </span>
          {issues.length > 0 && <strong>{issues.length} 项需检查</strong>}
        </div>
      )}
    </article>
  );
}
