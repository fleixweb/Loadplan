import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
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
  candidates,
  setCandidates,
  preference,
  setPreference,
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
  candidates: Container[];
  setCandidates: (c: Container[]) => void;
  preference: "load-more" | "priority";
  setPreference: (p: "load-more" | "priority") => void;
}) {
  const candidateIds = new Set(candidates.map((c) => c.id));
  const addCandidate = (id: string) => {
    const preset = CONTAINERS.find((c) => c.id === id);
    if (preset && !candidateIds.has(id))
      setCandidates([...candidates, structuredClone(preset)]);
  };
  const moveCandidate = (index: number, delta: -1 | 1) => {
    const next = [...candidates];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setCandidates(next);
  };
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
        <div className="auto-fleet-settings">
          <div className="fleet-subheading">
            <strong>自动估算可用柜型</strong>
            <span>按列表顺序尝试</span>
          </div>
          <div className="candidate-list">
            {candidates.map((candidate, index) => (
              <div className="candidate-item" key={candidate.id}>
                <div className="candidate-row">
                  <span className="candidate-rank">{index + 1}</span>
                  <strong>{candidate.id}</strong>
                  <span>{candidate.name.replace(/^\S+\s*/, "")}</span>
                  <button
                    type="button"
                    title="上移优先级"
                    aria-label={`提高 ${candidate.id} 优先级`}
                    disabled={index === 0}
                    onClick={() => moveCandidate(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="下移优先级"
                    aria-label={`降低 ${candidate.id} 优先级`}
                    disabled={index === candidates.length - 1}
                    onClick={() => moveCandidate(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    title="移除柜型"
                    aria-label={`移除 ${candidate.id}`}
                    disabled={candidates.length === 1}
                    onClick={() =>
                      setCandidates(
                        candidates.filter((c) => c.id !== candidate.id),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <details className="candidate-details">
                  <summary>
                    尺寸 {candidate.size.x} × {candidate.size.y} ×{" "}
                    {candidate.size.z} mm · 载重 {candidate.maxWeight} kg
                  </summary>
                  <div className="three-fields">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <NumberField
                        key={axis}
                        label={`${candidate.id} 柜内${{ x: "长", y: "宽", z: "高" }[axis]} / mm`}
                        value={candidate.size[axis]}
                        onChange={(n) =>
                          setCandidates(
                            candidates.map((c) =>
                              c.id === candidate.id
                                ? { ...c, size: { ...c.size, [axis]: n } }
                                : c,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                  <div className="three-fields">
                    <NumberField
                      label={`${candidate.id} 柜门宽 / mm`}
                      value={candidate.door.width}
                      onChange={(n) =>
                        setCandidates(
                          candidates.map((c) =>
                            c.id === candidate.id
                              ? { ...c, door: { ...c.door, width: n } }
                              : c,
                          ),
                        )
                      }
                    />
                    <NumberField
                      label={`${candidate.id} 柜门高 / mm`}
                      value={candidate.door.height}
                      onChange={(n) =>
                        setCandidates(
                          candidates.map((c) =>
                            c.id === candidate.id
                              ? { ...c, door: { ...c.door, height: n } }
                              : c,
                          ),
                        )
                      }
                    />
                    <NumberField
                      label={`${candidate.id} 最大载重 / kg`}
                      value={candidate.maxWeight}
                      onChange={(n) =>
                        setCandidates(
                          candidates.map((c) =>
                            c.id === candidate.id ? { ...c, maxWeight: n } : c,
                          ),
                        )
                      }
                    />
                  </div>
                </details>
              </div>
            ))}
          </div>
          <div className="candidate-add-row">
            {CONTAINERS.filter((c) => !candidateIds.has(c.id)).map(
              (candidate) => (
                <button
                  type="button"
                  className="text-button"
                  key={candidate.id}
                  onClick={() => addCandidate(candidate.id)}
                >
                  <Plus size={13} /> 添加 {candidate.id}
                </button>
              ),
            )}
          </div>
          <label className="number-field">
            <span>组合目标</span>
            <select
              aria-label="自动估算组合目标"
              value={preference}
              onChange={(e) =>
                setPreference(e.target.value as typeof preference)
              }
            >
              <option value="load-more">每柜尽量多装</option>
              <option value="priority">严格按柜型优先级</option>
            </select>
          </label>
          <NumberField
            label="最多试算柜数"
            value={max}
            min={1}
            max={50}
            onChange={setMax}
          />
          <p className="field-note">
            系统按柜型优先级试算；结果为启发式组合，不保证运费或柜数全局最优。
          </p>
        </div>
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
