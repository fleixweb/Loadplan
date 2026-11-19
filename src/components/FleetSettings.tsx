import { Plus, Trash2 } from "lucide-react";
import type { Container } from "../domain/types";
import { CONTAINERS } from "../domain/sample";
import { ALGORITHM_LABELS } from "../domain/comparison";
import NumberField from "./NumberField";

export interface ExtraContainer {
  container: Container;
  count: number;
}
export default function FleetSettings({
  mode,
  setMode,
  count,
  setCount,
  extras,
  setExtras,
  max,
  setMax,
  algorithm,
  setAlgorithm,
}: {
  mode: "single" | "fixed" | "auto";
  setMode: (m: "single" | "fixed" | "auto") => void;
  count: number;
  setCount: (n: number) => void;
  extras: ExtraContainer[];
  setExtras: (e: ExtraContainer[]) => void;
  max: number;
  setMax: (n: number) => void;
  algorithm: "baseline" | "maxrects";
  setAlgorithm: (a: "baseline" | "maxrects") => void;
}) {
  return (
    <div className="fleet-settings">
      <label className="number-field">
        <span>计算方式</span>
        <select
          aria-label="计算方式"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="single">单柜计算</option>
          <option value="fixed">指定多个柜子</option>
          <option value="auto">自动估算柜数</option>
        </select>
      </label>
      {mode === "fixed" && (
        <>
          <NumberField
            label="当前柜型数量"
            value={count}
            min={1}
            max={50}
            onChange={setCount}
          />
          {extras.map((entry, i) => (
            <div className="extra-container" key={i}>
              <div className="extra-container-heading">
                <label className="number-field">
                  <span>附加柜型 {i + 1}</span>
                  <select
                    aria-label={`附加柜型 ${i + 1}`}
                    value={entry.container.id}
                    onChange={(e) =>
                      setExtras(
                        extras.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                container: structuredClone(
                                  CONTAINERS.find(
                                    (c) => c.id === e.target.value,
                                  )!,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {CONTAINERS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  title="删除附加柜型"
                  aria-label={`删除附加柜型 ${i + 1}`}
                  onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <NumberField
                label={`附加柜型 ${i + 1} 数量`}
                value={entry.count}
                max={50}
                onChange={(n) =>
                  setExtras(
                    extras.map((x, j) => (j === i ? { ...x, count: n } : x)),
                  )
                }
              />
              <details>
                <summary>可用尺寸与载重</summary>
                <div className="three-fields">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField
                      key={axis}
                      label={`附加柜 ${i + 1} ${axis} / mm`}
                      value={entry.container.size[axis]}
                      onChange={(n) =>
                        setExtras(
                          extras.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  container: {
                                    ...x.container,
                                    size: { ...x.container.size, [axis]: n },
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
                <div className="three-fields">
                  {(["width", "height"] as const).map((axis) => (
                    <NumberField
                      key={axis}
                      label={`附加柜 ${i + 1} 门${axis === "width" ? "宽" : "高"}`}
                      value={entry.container.door[axis]}
                      onChange={(n) =>
                        setExtras(
                          extras.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  container: {
                                    ...x.container,
                                    door: { ...x.container.door, [axis]: n },
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                  <NumberField
                    label={`附加柜 ${i + 1} 载重 / kg`}
                    value={entry.container.maxWeight}
                    onChange={(n) =>
                      setExtras(
                        extras.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                container: { ...x.container, maxWeight: n },
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
                <div className="three-fields">
                  {(["walls", "door", "between"] as const).map((field) => (
                    <NumberField
                      key={field}
                      label={`附加柜 ${i + 1} ${{ walls: "柜壁间隙", door: "柜门间隙", between: "货物间隙" }[field]}`}
                      min={0}
                      value={entry.container.clearance?.[field] ?? 0}
                      onChange={(n) =>
                        setExtras(
                          extras.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  container: {
                                    ...x.container,
                                    clearance: {
                                      walls: 0,
                                      door: 0,
                                      between: 0,
                                      ...x.container.clearance,
                                      [field]: n,
                                    },
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </details>
            </div>
          ))}
          <button
            className="button"
            disabled={extras.length >= 10}
            onClick={() =>
              setExtras([
                ...extras,
                { container: structuredClone(CONTAINERS[2]), count: 1 },
              ])
            }
          >
            <Plus size={15} />
            添加其他柜型
          </button>
        </>
      )}
      {mode === "auto" && (
        <NumberField
          label="最多试算柜数"
          value={max}
          min={1}
          max={50}
          onChange={setMax}
        />
      )}
      {mode !== "single" && (
        <label className="number-field">
          <span>装载算法</span>
          <select
            aria-label="多柜装载算法"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as typeof algorithm)}
          >
            <option value="baseline">{ALGORITHM_LABELS.baseline}</option>
            <option value="maxrects">{ALGORITHM_LABELS.maxrects}</option>
          </select>
        </label>
      )}
    </div>
  );
}
