import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Container as ContainerIcon,
  FileUp,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Package,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  Cargo,
  Container,
  PackingResult,
  Placement,
} from "./domain/types";
import { validateInput } from "./domain/packing";
import { cloneSample, COLORS, CONTAINERS, volume } from "./domain/sample";
import BenchmarkPanel from "./components/BenchmarkPanel";
import type { AlgorithmId, ComparisonRun } from "./domain/comparison";
import type { StandardCase } from "./domain/cases";
import type { PackingResponse } from "./domain/worker-protocol";

const ContainerViewer = lazy(() => import("./components/ContainerViewer"));
const fmt = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("zh-CN", { maximumFractionDigits: digits })
    : "—";
const initial = cloneSample();

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          aria-label={label}
          inputMode="decimal"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function download(data: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [container, setContainer] = useState<Container>(initial.container);
  const [cargo, setCargo] = useState<Cargo[]>(initial.cargo);
  const [result, setResult] = useState<PackingResult | null>(null);
  const [dirty, setDirty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Placement | null>(null);
  const [help, setHelp] = useState(false);
  const [sample, setSample] = useState(true);
  const [runs, setRuns] = useState<ComparisonRun[]>([]);
  const [activeAlgorithm, setActiveAlgorithm] =
    useState<AlgorithmId>("baseline");
  const [caseId, setCaseId] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);

  const stop = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const calculate = useCallback(
    (c: Container, goods: Cargo[], compare = false) => {
      stop();
      const invalid = validateInput(c, goods);
      if (invalid.length) {
        setErrors(invalid);
        setBusy(false);
        return;
      }
      setBusy(true);
      setErrors([]);
      setNotice("");
      setRuns([]);
      try {
        const w = new Worker(
          new URL("./domain/packing.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = w;
        w.onmessage = (event: MessageEvent<PackingResponse>) => {
          if (worker.current !== w) return;
          if (event.data.error) setErrors([event.data.error]);
          else {
            const compared = event.data.runs;
            const first =
              compared?.find((r) => r.result?.validation.valid && !r.error) ??
              compared?.find((r) => r.result);
            const packed = event.data.result ?? first?.result;
            if (compared) setRuns(compared);
            if (packed) {
              setResult(packed);
              setActiveAlgorithm(first?.id ?? "baseline");
              setDirty(false);
              setSelected(null);
              if (!packed.validation.valid) setErrors(packed.validation.errors);
            } else
              setErrors(
                compared?.map((r) => r.error || `${r.label} 未返回结果。`) ?? [
                  "计算没有返回装载结果。",
                ],
              );
          }
          stop();
          setBusy(false);
        };
        w.onerror = () => {
          if (worker.current === w) {
            stop();
            setBusy(false);
            setErrors(["计算器启动失败，请刷新页面后重试。"]);
          }
        };
        timer.current = setTimeout(() => {
          stop();
          setBusy(false);
          setErrors(["本次计算超过 15 秒。请减少纸箱数量或规格后重试。"]);
        }, 15000);
        w.postMessage({
          container: structuredClone(c),
          cargo: structuredClone(goods),
          task: compare ? "compare" : "pack",
        });
      } catch {
        stop();
        setBusy(false);
        setErrors([
          "当前浏览器无法启动计算器，请使用支持 Web Worker 的浏览器。",
        ]);
      }
    },
    [stop],
  );

  useEffect(() => {
    calculate(initial.container, initial.cargo, true);
    return stop;
  }, [calculate, stop]);
  useEffect(() => {
    const d = modal.current;
    if (help && d && !d.open) d.showModal();
    if (!help && d?.open) d.close();
  }, [help]);
  const edit = () => {
    setDirty(true);
    setErrors([]);
    setNotice("");
    setSelected(null);
    setSample(false);
    setCaseId(null);
  };
  const updateContainer = (next: Container) => {
    edit();
    setContainer(next);
  };
  const updateCargo = (id: string, next: Partial<Cargo>) => {
    edit();
    setCargo((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
  };
  const restore = () => {
    const s = cloneSample();
    setContainer(s.container);
    setCargo(s.cargo);
    setDirty(true);
    setSample(true);
    setCaseId(null);
    calculate(s.container, s.cargo);
  };
  const loadCase = (fixture: StandardCase) => {
    const c = structuredClone(fixture.container),
      goods = structuredClone(fixture.cargo);
    setContainer(c);
    setCargo(goods);
    setDirty(true);
    setSelected(null);
    setSample(true);
    setCaseId(fixture.id);
    calculate(c, goods, true);
  };
  const selectRun = (run: ComparisonRun) => {
    if (!run.result || dirty || busy) return;
    setResult(run.result);
    setActiveAlgorithm(run.id);
    setSelected(null);
    setErrors(run.result.validation.valid ? [] : run.result.validation.errors);
  };
  const addCargo = () => {
    edit();
    const id = `SKU-${crypto.randomUUID().slice(0, 8)}`;
    setCargo((prev) => [
      ...prev,
      {
        id,
        name: `产品 ${prev.length + 1}`,
        size: { x: 500, y: 400, z: 300 },
        quantity: 50,
        weight: 10,
        rotation: "upright",
        maxLayers: 4,
        color: COLORS[prev.length % COLORS.length],
      },
    ]);
  };
  const handleImport = async (uploaded: File | undefined) => {
    if (!uploaded) return;
    try {
      if (uploaded.size > 2 * 1024 * 1024)
        throw new Error("文件超过 2 MB，请导入较小的方案。");
      const parsed = JSON.parse(await uploaded.text());
      if (!parsed || parsed.schemaVersion !== 1)
        throw new Error("请选择本工具导出的 v1 JSON 方案文件。");
      const invalid = validateInput(parsed.container, parsed.cargo);
      if (invalid.length) throw new Error(invalid.join("；"));
      stop();
      setBusy(false);
      setContainer(parsed.container);
      setCargo(parsed.cargo);
      setResult(null);
      setDirty(true);
      setSelected(null);
      setSample(false);
      setCaseId(null);
      setRuns([]);
      setErrors([]);
      setNotice(
        "已导入货物与柜型。点击「计算装柜方案」重新计算，不沿用文件中的旧结果。",
      );
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "文件无法读取。"]);
    }
    if (file.current) file.current.value = "";
  };
  const totalQty = cargo.reduce((sum, p) => sum + p.quantity, 0);
  const totalVolume = cargo.reduce(
    (sum, p) => sum + volume(p.size) * p.quantity,
    0,
  );
  const totalWeight = cargo.reduce((sum, p) => sum + p.weight * p.quantity, 0);
  const packedQty = result?.placements.length ?? 0;
  const packedVol =
    result?.placements.reduce((sum, p) => sum + volume(p.size), 0) ?? 0;
  const packedWeight =
    result?.placements.reduce((sum, p) => sum + p.weight, 0) ?? 0;
  const originalQty =
    result?.cargo.reduce((sum, p) => sum + p.quantity, 0) ?? 0;
  const capacity = result ? volume(result.container.size) : 0;
  const utilization = capacity ? (packedVol / capacity) * 100 : 0;
  const currentPreset = CONTAINERS.find((c) => c.id === container.id);
  const customized =
    !!currentPreset &&
    JSON.stringify(currentPreset) !== JSON.stringify(container);
  const exportAllowed = !!result && !dirty && !busy && result.validation.valid;

  return (
    <>
      <header className="app-header">
        <a href="#" className="brand" aria-label="柜算首页">
          <span className="brand-symbol">
            <ContainerIcon size={24} strokeWidth={1.7} />
          </span>
          <strong>
            柜算<span>LOADPLAN</span>
          </strong>
        </a>
        <div className="header-divider" />
        <span className="header-label">纸箱装柜工作台</span>
        <div className="header-right">
          <span className="local-state">
            <LockKeyhole size={13} />
            本地计算 · 数据不上传
          </span>
          <button
            className="button subtle"
            ref={helpButton}
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={16} />
            使用说明
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <h1>装柜方案</h1>
            <p>从货物清单到柜内布局，让空间一目了然。</p>
          </div>
          <div className="heading-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <FileUp size={16} />
              导入方案
            </button>
            <button
              className="button"
              disabled={!exportAllowed}
              title={dirty ? "输入已修改，请先重新计算" : "导出完整 JSON 方案"}
              onClick={() =>
                result &&
                download(
                  JSON.stringify(result, null, 2),
                  `装柜方案-${result.container.id}.json`,
                )
              }
            >
              <ArrowDownToLine size={16} />
              导出方案
            </button>
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void handleImport(e.target.files?.[0])}
          hidden
        />
        <div className="workflow">
          <span>
            <b>01</b>选择柜型
          </span>
          <ChevronRight size={14} />
          <span>
            <b>02</b>填写货物
          </span>
          <ChevronRight size={14} />
          <span>
            <b>03</b>计算与查看
          </span>
          <div className="sample-indicator">
            <i />
            {caseId
              ? "当前为标准测试案例"
              : sample
                ? "当前为模拟样例"
                : "自定义货物方案"}
          </div>
        </div>
        {errors.length > 0 && (
          <div className="message error" role="alert">
            <TriangleAlert size={19} />
            <div>
              <strong>请检查以下内容</strong>
              <ul>
                {errors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
            <button aria-label="关闭错误提示" onClick={() => setErrors([])}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="message info" role="status">
            <Check size={18} />
            {notice}
            <button aria-label="关闭通知" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="workbench">
          <aside className="input-panel">
            <fieldset disabled={busy}>
              <section className="container-form">
                <div className="section-heading">
                  <h2>
                    <ContainerIcon size={18} />
                    集装箱
                  </h2>
                  <span>01</span>
                </div>
                <div className="container-options">
                  {CONTAINERS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`${c.id} ${c.id === "40HQ" ? "高柜" : "标准柜"}`}
                      aria-pressed={container.id === c.id}
                      onClick={() => updateContainer(structuredClone(c))}
                    >
                      <ContainerIcon size={25} strokeWidth={1.3} />
                      <strong>{c.id}</strong>
                      <small>{c.id === "40HQ" ? "高柜" : "标准柜"}</small>
                    </button>
                  ))}
                </div>
                <div className="field-title">
                  可用内尺寸 <span>mm{customized ? " · 已修改" : ""}</span>
                </div>
                <div className="three-fields">
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <NumberField
                      key={axis}
                      label={["柜内长", "柜内宽", "柜内高"][i]}
                      value={container.size[axis]}
                      onChange={(n) =>
                        updateContainer({
                          ...container,
                          size: { ...container.size, [axis]: n },
                        })
                      }
                    />
                  ))}
                </div>
                <div className="payload-row">
                  <NumberField
                    label="最大载重"
                    value={container.maxWeight}
                    suffix="kg"
                    onChange={(n) =>
                      updateContainer({ ...container, maxWeight: n })
                    }
                  />
                </div>
                <details className="door-settings">
                  <summary>
                    柜门尺寸
                    <ChevronDown size={14} />
                  </summary>
                  <div className="two-fields">
                    <NumberField
                      label="柜门宽"
                      value={container.door.width}
                      suffix="mm"
                      onChange={(n) =>
                        updateContainer({
                          ...container,
                          door: { ...container.door, width: n },
                        })
                      }
                    />
                    <NumberField
                      label="柜门高"
                      value={container.door.height}
                      suffix="mm"
                      onChange={(n) =>
                        updateContainer({
                          ...container,
                          door: { ...container.door, height: n },
                        })
                      }
                    />
                  </div>
                </details>
                <details className="door-settings clearance-settings" open>
                  <summary>
                    预留间隙（可选）
                    <ChevronDown size={14} />
                  </summary>
                  <div className="three-fields">
                    <NumberField
                      label="柜壁四周"
                      value={container.clearance?.walls ?? 0}
                      suffix="mm"
                      min={0}
                      onChange={(n) =>
                        updateContainer({
                          ...container,
                          clearance: {
                            walls: n,
                            door: container.clearance?.door ?? 0,
                            between: container.clearance?.between ?? 0,
                          },
                        })
                      }
                    />
                    <NumberField
                      label="柜门前方"
                      value={container.clearance?.door ?? 0}
                      suffix="mm"
                      min={0}
                      onChange={(n) =>
                        updateContainer({
                          ...container,
                          clearance: {
                            walls: container.clearance?.walls ?? 0,
                            door: n,
                            between: container.clearance?.between ?? 0,
                          },
                        })
                      }
                    />
                    <NumberField
                      label="纸箱之间"
                      value={container.clearance?.between ?? 0}
                      suffix="mm"
                      min={0}
                      onChange={(n) =>
                        updateContainer({
                          ...container,
                          clearance: {
                            walls: container.clearance?.walls ?? 0,
                            door: container.clearance?.door ?? 0,
                            between: n,
                          },
                        })
                      }
                    />
                  </div>
                  <p className="field-note">
                    按实际装柜需要填写毫米数；填 0 表示不额外预留。
                  </p>
                </details>
                <p className="field-note">预设尺寸供估算，可按实际柜况修改。</p>
              </section>
              <section className="cargo-form">
                <div className="section-heading">
                  <h2>
                    <Package size={18} />
                    货物清单 <small>{cargo.length}</small>
                  </h2>
                  <button
                    className="text-button"
                    onClick={restore}
                    title="恢复模拟样例"
                  >
                    <RotateCcw size={13} />
                    样例
                  </button>
                </div>
                <div className="cargo-list">
                  {cargo.map((p, index) => (
                    <article className="cargo-card" key={p.id}>
                      <div className="cargo-title">
                        <span
                          className="cargo-swatch"
                          style={{ backgroundColor: p.color }}
                        >
                          {index + 1}
                        </span>
                        <input
                          aria-label={`货物 ${index + 1} 名称`}
                          maxLength={60}
                          value={p.name}
                          onChange={(e) =>
                            updateCargo(p.id, { name: e.target.value })
                          }
                        />
                        <button
                          aria-label={`删除货物 ${index + 1}`}
                          disabled={cargo.length === 1}
                          onClick={() => {
                            edit();
                            setCargo((prev) =>
                              prev.filter((q) => q.id !== p.id),
                            );
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="three-fields">
                        {(["x", "y", "z"] as const).map((axis, i) => (
                          <NumberField
                            key={axis}
                            label={`${["长", "宽", "高"][i]} (mm)`}
                            value={p.size[axis]}
                            onChange={(n) =>
                              updateCargo(p.id, {
                                size: { ...p.size, [axis]: n },
                              })
                            }
                          />
                        ))}
                      </div>
                      <div className="three-fields cargo-quantities">
                        <label className="number-field unit-field">
                          <span>货物形态</span>
                          <select
                            aria-label={`货物 ${index + 1} 货物形态`}
                            value={p.shape ?? "box"}
                            onChange={(e) =>
                              updateCargo(p.id, {
                                shape: e.target.value as Cargo["shape"],
                              })
                            }
                          >
                            <option value="box">长方体包装</option>
                            <option value="bounding-box">异形外接长方体</option>
                          </select>
                        </label>
                        <label className="number-field unit-field">
                          <span>装载单位</span>
                          <select
                            aria-label={`货物 ${index + 1} 装载单位`}
                            value={p.loadUnit ?? "carton"}
                            onChange={(e) =>
                              updateCargo(p.id, {
                                loadUnit: e.target.value as Cargo["loadUnit"],
                              })
                            }
                          >
                            <option value="carton">纸箱</option>
                            <option value="pallet">整托</option>
                          </select>
                        </label>
                        {p.loadUnit === "pallet" && (
                          <div className="pallet-hint">
                            <strong>整托填写说明</strong>
                            <span>
                              尺寸填写托盘连同货物的整体尺寸，重量填写整托总重量。
                            </span>
                            <button type="button" onClick={() => setHelp(true)}>
                              查看完整规则
                            </button>
                          </div>
                        )}
                        <NumberField
                          label={`数量 / ${p.loadUnit === "pallet" ? "托" : "箱"}`}
                          max={1500}
                          value={p.quantity}
                          onChange={(n) => updateCargo(p.id, { quantity: n })}
                        />
                        <NumberField
                          label="毛重 / kg"
                          step={0.1}
                          min={0.001}
                          value={p.weight}
                          onChange={(n) => updateCargo(p.id, { weight: n })}
                        />
                        <NumberField
                          label="最多层数"
                          max={1500}
                          value={p.maxLayers}
                          onChange={(n) => updateCargo(p.id, { maxLayers: n })}
                        />
                      </div>
                      {p.shape === "bounding-box" && (
                        <p className="shape-hint">
                          当前按外接长、宽、高估算，不计算凹陷、弧面和嵌入空间。请同时设置叠放和承重要求。
                        </p>
                      )}
                      <label className="rotation-field">
                        <span>摆放方向</span>
                        <select
                          aria-label={`货物 ${index + 1} 摆放方向`}
                          value={p.rotation}
                          onChange={(e) =>
                            updateCargo(p.id, {
                              rotation: e.target.value as Cargo["rotation"],
                            })
                          }
                        >
                          <option value="upright">保持直立，可水平旋转</option>
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
                            checked={p.stackable !== false}
                            onChange={(e) =>
                              updateCargo(p.id, { stackable: e.target.checked })
                            }
                          />
                          允许叠放
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={p.bottomOnly === true}
                            onChange={(e) =>
                              updateCargo(p.id, {
                                bottomOnly: e.target.checked,
                              })
                            }
                          />
                          只能放底层
                        </label>
                        <NumberField
                          label="每垛总重量上限"
                          suffix="kg"
                          min={0}
                          step={0.1}
                          value={p.maxStackWeight ?? 0}
                          onChange={(n) =>
                            updateCargo(p.id, {
                              maxStackWeight: n || undefined,
                            })
                          }
                        />
                        <p className="rule-help">
                          包含最底层货物的重量；填 0 表示不限制。
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  className="add-cargo"
                  onClick={addCargo}
                  disabled={cargo.length >= 30}
                >
                  <Plus size={16} />
                  添加货物规格
                </button>
              </section>
            </fieldset>
            <div className="calculate-panel">
              <div className="input-summary">
                <span>
                  <b>{fmt(totalQty)}</b> 箱
                </span>
                <span>{fmt(totalVolume, 2)} m³</span>
                <span>{fmt(totalWeight)} kg</span>
              </div>
              <button
                className="button primary calculate"
                disabled={busy}
                onClick={() => calculate(container, cargo)}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="spin" />
                    正在计算方案…
                  </>
                ) : (
                  <>
                    计算装柜方案
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
              <p>当前支持单柜 · 最多 1,500 箱 / 30 种规格</p>
            </div>
          </aside>
          <div className="result-panel">
            <BenchmarkPanel
              busy={busy}
              dirty={dirty}
              runs={runs}
              activeAlgorithm={activeAlgorithm}
              caseId={caseId}
              onLoadCase={loadCase}
              onCompare={() => calculate(container, cargo, true)}
              onSelectRun={selectRun}
            />
            <div className="result-heading">
              <h2>
                装载预览
                {runs.length > 0 && (
                  <small className="active-algorithm-label">
                    {activeAlgorithm === "baseline" ? "装法一" : "装法二"}
                  </small>
                )}
              </h2>
              <span
                className={`result-state ${dirty ? "stale" : ""}`}
                role="status"
              >
                {busy ? (
                  <>
                    <LoaderCircle size={13} className="spin" />
                    计算中
                  </>
                ) : dirty ? (
                  <>
                    <span className="status-dot" />
                    {result ? "输入已修改 · 请重新计算" : "等待计算"}
                  </>
                ) : result?.validation.valid ? (
                  <>
                    <CheckCheck size={15} />
                    基础规则校验通过
                  </>
                ) : (
                  <>
                    <TriangleAlert size={15} />
                    校验未通过
                  </>
                )}
              </span>
            </div>
            <div className={`metrics ${dirty && result ? "outdated" : ""}`}>
              <div className="metric">
                <span>
                  <Box size={15} />
                  已装纸箱
                </span>
                <strong data-testid="packed-count">
                  {result ? fmt(packedQty) : "—"}
                  <small>/ {result ? fmt(originalQty) : "—"} 箱</small>
                </strong>
                <div className="metric-track">
                  <i
                    style={{
                      width: `${originalQty ? (packedQty / originalQty) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="metric">
                <span>
                  <Layers3 size={15} />
                  空间利用率
                </span>
                <strong>
                  {result ? fmt(utilization, 1) : "—"}
                  <small>%</small>
                </strong>
                <p>
                  已装 {fmt(packedVol, 2)} / {fmt(capacity, 2)} m³
                </p>
              </div>
              <div className="metric">
                <span>
                  <Scale size={15} />
                  已装毛重
                </span>
                <strong>
                  {result ? fmt(packedWeight) : "—"}
                  <small>kg</small>
                </strong>
                <p>
                  载重上限 {result ? fmt(result.container.maxWeight) : "—"} kg
                </p>
              </div>
              <div className="metric">
                <span>
                  <ClipboardList size={15} />
                  当前未装入
                </span>
                <strong className={originalQty > packedQty ? "amber" : ""}>
                  {result ? fmt(originalQty - packedQty) : "—"}
                  <small>箱</small>
                </strong>
                <p>
                  {originalQty > packedQty
                    ? "可调整规则或柜型后重算"
                    : result
                      ? "本次货物均已装入"
                      : "计算后查看结果"}
                </p>
              </div>
            </div>
            {result ? (
              <Suspense
                fallback={
                  <div className="viewer-empty">
                    <LoaderCircle className="spin" />
                    正在加载三维查看器…
                  </div>
                }
              >
                <ContainerViewer
                  result={result}
                  selected={selected?.boxId ?? null}
                  onSelect={setSelected}
                  stale={dirty || busy || !result.validation.valid}
                />
              </Suspense>
            ) : (
              <div className="viewer-empty">
                <ContainerIcon size={56} strokeWidth={1} />
                <h3>{busy ? "正在安排每一只纸箱" : "准备好货物，开始装柜"}</h3>
                <p>
                  {busy
                    ? "计算完成后将在这里显示三维布局。"
                    : "在左侧填写数据，点击「计算装柜方案」。"}
                </p>
              </div>
            )}
            <div className="viewer-legend">
              {(result?.cargo ?? cargo).map((p) => (
                <span key={p.id}>
                  <i style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
              <span className="legend-door">
                <i />
                绿色边框为柜门
              </span>
            </div>
            {selected && result && (
              <div className="selection-detail" role="status">
                <Box size={18} />
                <div>
                  <strong>
                    {result.cargo.find((c) => c.id === selected.cargoId)?.name}{" "}
                    · {selected.boxId}
                  </strong>
                  <span>
                    位置 {selected.position.x}, {selected.position.y},{" "}
                    {selected.position.z} mm　/　摆放尺寸 {selected.size.x} ×{" "}
                    {selected.size.y} × {selected.size.z} mm　/　第{" "}
                    {selected.layer} 层
                  </span>
                </div>
                <button aria-label="取消选择" onClick={() => setSelected(null)}>
                  <X size={16} />
                </button>
              </div>
            )}
            <section className="result-table-section">
              <div className="section-heading">
                <h2>货物装载明细</h2>
                <span>{dirty && result ? "上次计算结果" : "按产品汇总"}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>货物名称</th>
                      <th>计划箱数</th>
                      <th>已装箱数</th>
                      <th>未装箱数</th>
                      <th>结果说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result ? (
                      result.cargo.map((p) => {
                        const loaded = result.placements.filter(
                          (b) => b.cargoId === p.id,
                        ).length;
                        const unfit = result.unpacked.find(
                          (u) => u.cargoId === p.id,
                        );
                        return (
                          <tr key={p.id}>
                            <td>
                              <i
                                className="table-swatch"
                                style={{ background: p.color }}
                              />
                              {p.name}
                            </td>
                            <td>{p.quantity}</td>
                            <td>{loaded}</td>
                            <td className={p.quantity > loaded ? "amber" : ""}>
                              {p.quantity - loaded}
                            </td>
                            <td>
                              {unfit?.quantity ? (
                                unfit.reason
                              ) : (
                                <span className="complete">
                                  <Check size={13} />
                                  全部装入
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="empty-cell">
                          计算后显示各产品的装入数量与剩余情况
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="scope-note">
              <ShieldCheck size={20} />
              <div>
                <strong>看得见的方案，也有明确的边界</strong>
                <p>
                  本版采用同规格堆垛估算，检查尺寸、旋转、支撑、层数、柜门通行尺寸及总载重。尚未验证纸箱抗压、完整装载路径与运输稳定性；未装入不代表无法装入。
                </p>
              </div>
              <button className="text-button" onClick={() => setHelp(true)}>
                了解规则
                <ArrowRight size={14} />
              </button>
            </section>
          </div>
        </div>
        <footer className="app-footer">
          <span>
            柜算 LOADPLAN <b> / </b>纸箱散装原型 v0.2
          </span>
          <span>
            输入单位：mm / kg <b>·</b> 数据仅保存在当前页面，关闭前可导出方案
          </span>
        </footer>
      </main>
      <dialog
        ref={modal}
        className="help-dialog"
        onCancel={() => setHelp(false)}
        onClose={() => {
          setHelp(false);
          helpButton.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <h2>使用说明与计算规则</h2>
          <button aria-label="关闭说明" onClick={() => setHelp(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">
          <h3>三步查看装柜方案</h3>
          <ol>
            <li>选择柜型，按实际柜况修改可用内尺寸和载重。</li>
            <li>填写外箱尺寸、箱数、单箱毛重和摆放限制。</li>
            <li>点击计算，在右侧旋转查看、切换视角或逐层查看。</li>
          </ol>
          <h3>本版如何摆放</h3>
          <p>
            点击「比较两种装法」，查看同一批货物分别能装入多少箱，再点击「查看摆放图」。导出时保存选中的装法。
          </p>
          <p>
            同一垛只放相同规格、相同朝向的纸箱，下层完整承托上层。计算器尝试多种排序和分区方式，保留已装体积较大的方案。它不保证找到最优排列，也不做跨规格叠放。
          </p>
          <h3>已校验与尚未覆盖</h3>
          <p>
            已校验：数量、尺寸、重叠、柜体边界、允许朝向、同垛支撑、最大层数、总重，以及纸箱按当前朝向通过柜门所需的宽高。
          </p>
          <p>
            尚未覆盖：纸箱抗压与受力计算、装载过程的移动路径、绑扎固定、重心平衡、运输动态。逐层显示用于理解布局，不代表经验证的装柜顺序。
          </p>
          <h3>单位和文件</h3>
          <p>
            界面及 JSON 尺寸统一为毫米，重量为千克。X 从柜底深处指向柜门，Y
            沿柜宽，Z
            向上。导出保存输入和本次计算结果；导入后需要重新计算。修改输入后，旧结果会标记为过期并暂停导出。
          </p>
          <p>
            默认货物均为虚构样例；柜型为可修改的参考预设。计算在本机浏览器执行，无账号、无数据库、无业务数据上传。
          </p>
          <h3>特殊形状货物</h3>
          <p>
            不规则货物如果已经装在长方体纸箱或木箱内，请填写包装外尺寸。裸装机器或不规则木架可以填写完全包住货物的最大长、宽、高，并设置是否叠放和承重限制。桶、卷材、管材、套叠和凹槽嵌入暂不做精确几何计算，结果按外接长方体保守估算。
          </p>
        </div>
        <button className="button primary" onClick={() => setHelp(false)}>
          开始使用
          <ArrowRight size={16} />
        </button>
      </dialog>
    </>
  );
}
