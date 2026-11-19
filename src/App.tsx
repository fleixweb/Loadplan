/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Container as ContainerIcon,
  FileSpreadsheet,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Package,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  Cargo,
  Container,
  FleetOptions,
  FleetResult,
  PackingResult,
  Placement,
} from "./domain/types";
import { validateInput } from "./domain/packing";
import { ALGORITHM_LABELS } from "./domain/comparison";
import { changeCargo } from "./domain/cargoModel";
import {
  cloneSample,
  COLORS,
  CONTAINERS,
  SAMPLE_CARGO,
  volume,
} from "./domain/sample";
import { countUnit } from "./domain/units";
import type { AlgorithmId, ComparisonRun } from "./domain/comparison";
import type { StandardCase } from "./domain/cases";
import type { PackingResponse } from "./domain/worker-protocol";
import BenchmarkPanel from "./components/BenchmarkPanel";
import Brand from "./components/Brand";
import CargoEditor from "./components/CargoEditor";
import NumberField from "./components/NumberField";
import FleetSettings, { type ExtraContainer } from "./components/FleetSettings";
import { isDesktop } from "./platform/files";

const ContainerViewer = lazy(() => import("./components/ContainerViewer"));
const ExcelImport = lazy(() => import("./components/ExcelImport"));
const initial = {
  container: structuredClone(CONTAINERS[0]),
  cargo: [structuredClone(SAMPLE_CARGO[0])],
};
const fmt = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("zh-CN", { maximumFractionDigits: digits })
    : "—";

export default function App() {
  const [container, setContainer] = useState<Container>(initial.container);
  const [cargo, setCargo] = useState<Cargo[]>(initial.cargo);
  const [expandedCargoId, setExpandedCargoId] = useState(initial.cargo[0].id);
  const [result, setResult] = useState<PackingResult | null>(null);
  const [fleet, setFleet] = useState<FleetResult | null>(null);
  const [mode, setMode] = useState<"single" | "fixed" | "auto">("single");
  const [containerCount, setContainerCount] = useState(1);
  const [extras, setExtras] = useState<ExtraContainer[]>([]);
  const [maxContainers, setMaxContainers] = useState(20);
  const [fleetAlgorithm, setFleetAlgorithm] = useState<AlgorithmId>("maxrects");
  const [autoCandidates, setAutoCandidates] = useState<Container[]>([
    structuredClone(CONTAINERS[2]),
    structuredClone(CONTAINERS[1]),
    structuredClone(CONTAINERS[0]),
  ]);
  const [autoPreference, setAutoPreference] = useState<
    "load-more" | "priority"
  >("load-more");
  const [dirty, setDirty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState("");
  const [selected, setSelected] = useState<Placement | null>(null);
  const [help, setHelp] = useState(false);
  const [sample, setSample] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportScope, setReportScope] = useState<"current" | "all">("all");
  const [objFrame, setObjFrame] = useState(false);
  const [objMaterials, setObjMaterials] = useState(false);
  const [runs, setRuns] = useState<ComparisonRun[]>([]);
  const [activeAlgorithm, setActiveAlgorithm] =
    useState<AlgorithmId>("baseline");
  const [caseId, setCaseId] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureRefs = useRef(
    new Map<string, { current: (() => string) | null }>(),
  );
  const captureRefFor = (containerId: string) => {
    let ref = captureRefs.current.get(containerId);
    if (!ref) {
      ref = { current: null };
      captureRefs.current.set(containerId, ref);
    }
    return ref;
  };
  const dialog = useRef<HTMLDialogElement>(null);

  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const edit = () => {
    setDirty(true);
    setErrors([]);
    setNotice("");
    setSelected(null);
    setSample(false);
    setCaseId(null);
  };
  const updateContainer = (c: Container) => {
    edit();
    setContainer(c);
    if (mode === "auto")
      setAutoCandidates((current) => {
        const rest = current.filter((candidate) => candidate.id !== c.id);
        return [structuredClone(c), ...rest];
      });
  };
  const updateCargo = (id: string, patch: Partial<Cargo>) => {
    edit();
    const goods = cargo.map((c) => (c.id === id ? changeCargo(c, patch) : c));
    setCargo(goods);
    if (patch.shape !== undefined && mode === "single")
      calculate(container, goods, true);
  };
  const calculate = (
    c: Container,
    goods: Cargo[],
    compare = false,
    selectedMode = mode,
  ) => {
    stop();
    setDirty(true);
    setProgress("");
    setErrors([]);
    setNotice("");
    const validationContainers = selectedMode === "auto" ? autoCandidates : [c];
    const invalid = validationContainers.flatMap((candidate) =>
      validateInput(candidate, goods).map(
        (message) => `${candidate.id}: ${message}`,
      ),
    );
    if (invalid.length) {
      setErrors(invalid);
      setBusy(false);
      return;
    }
    let options: FleetOptions | undefined;
    if (selectedMode !== "single") {
      const entries = [{ container: c, count: containerCount }, ...extras];
      if (
        selectedMode === "fixed" &&
        entries.some(
          (e) => !Number.isSafeInteger(e.count) || e.count < 1 || e.count > 50,
        )
      ) {
        setErrors(["每种柜型数量必须为 1–50 的整数。"]);
        return;
      }
      const containers =
        selectedMode === "auto"
          ? autoCandidates.map((candidate) => structuredClone(candidate))
          : entries.flatMap((e) =>
              Array.from({ length: e.count }, () =>
                structuredClone(e.container),
              ),
            );
      if (
        containers.length > 50 ||
        !Number.isSafeInteger(maxContainers) ||
        maxContainers < 1 ||
        maxContainers > 50
      ) {
        setErrors(["最多支持 50 个柜子，请检查数量设置。"]);
        return;
      }
      options = {
        mode: selectedMode,
        containers,
        maxContainers,
        algorithm: fleetAlgorithm,
        containerPriority: autoCandidates.map((candidate) => candidate.id),
        autoPreference,
      };
    }
    setBusy(true);
    setRuns([]);
    try {
      const w = new Worker(
        new URL("./domain/packing.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (event: MessageEvent<PackingResponse>) => {
        if (worker.current !== w) return;
        const data = event.data;
        if (data.progress) {
          setProgress(
            `已计算 ${data.progress.done} / ${data.progress.total} 个柜子`,
          );
          return;
        }
        if (data.error) setErrors([data.error]);
        else if (data.fleet) {
          setFleet(data.fleet);
          setResult(data.fleet.results[0] ?? null);
          setSelected(null);
          setDirty(false);
          setErrors(data.fleet.validation.errors);
          if (data.fleet.status === "limit")
            setNotice("已达到柜数或计算时间上限，剩余货物尚未完成分配。");
        } else {
          const compared = data.runs;
          const first =
            compared?.find((r) => r.result?.validation.valid && !r.error) ??
            compared?.find((r) => r.result);
          const packed = data.result ?? first?.result;
          if (compared) setRuns(compared);
          if (packed) {
            const attach = (r: PackingResult) => {
              const offsets = new Map<string, number>();
              for (const p of r.placements) {
                const i = offsets.get(p.cargoId) ?? 0;
                p.serialNumber = r.cargo.find(
                  (c) => c.id === p.cargoId,
                )?.serialNumbers?.[i];
                offsets.set(p.cargoId, i + 1);
              }
            };
            attach(packed);
            compared?.forEach((r) => {
              if (r.result) attach(r.result);
            });
            setFleet(null);
            setResult(packed);
            setActiveAlgorithm(first?.id ?? "baseline");
            setDirty(false);
            setSelected(null);
            setErrors(packed.validation.errors);
          } else setErrors(["计算没有返回有效方案。"]);
        }
        stop();
        setBusy(false);
        setProgress("");
      };
      w.onerror = () => {
        if (worker.current === w) {
          stop();
          setBusy(false);
          setErrors(["计算器启动失败，请刷新后重试。"]);
        }
      };
      timer.current = setTimeout(
        () => {
          stop();
          setBusy(false);
          setErrors(["计算超过时间上限，请减少货物或柜数后重试。"]);
        },
        options ? 120000 : 15000,
      );
      w.postMessage(
        options
          ? { task: "fleet", options, cargo: structuredClone(goods) }
          : {
              task: compare ? "compare" : "pack",
              container: structuredClone(c),
              cargo: structuredClone(goods),
            },
      );
    } catch {
      stop();
      setBusy(false);
      setErrors(["当前浏览器无法启动计算器，请刷新后重试。"]);
    }
  };
  useEffect(() => {
    calculate(initial.container, initial.cargo, true, "single");
    return stop;
  }, []);
  useEffect(() => {
    if (help && !dialog.current?.open) dialog.current?.showModal();
    if (!help && dialog.current?.open) dialog.current.close();
  }, [help]);
  const restore = () => {
    const s = cloneSample();
    edit();
    setMode("single");
    setFleet(null);
    setContainer(s.container);
    setCargo(s.cargo);
    setExpandedCargoId(s.cargo[0]?.id ?? "");
    setSample(true);
    calculate(s.container, s.cargo, false, "single");
  };
  const loadCase = (fixture: StandardCase) => {
    const c = structuredClone(fixture.container),
      goods = structuredClone(fixture.cargo);
    edit();
    setMode("single");
    setContainer(c);
    setCargo(goods);
    setExpandedCargoId(goods[0]?.id ?? "");
    setCaseId(fixture.id);
    setSample(true);
    calculate(c, goods, true, "single");
  };
  const selectRun = (run: ComparisonRun) => {
    if (dirty || busy || !run.result) return;
    setResult(run.result);
    setActiveAlgorithm(run.id);
    setSelected(null);
    setErrors(run.result.validation.errors);
  };
  const addCargo = () => {
    edit();
    const id = `SKU-${crypto.randomUUID()}`;
    setExpandedCargoId(id);
    setCargo([
      ...cargo,
      {
        id,
        name: `产品 ${cargo.length + 1}`,
        size: { x: 500, y: 400, z: 300 },
        quantity: 50,
        weight: 10,
        rotation: "upright",
        maxLayers: 4,
        color: COLORS[cargo.length % COLORS.length],
      },
    ]);
  };
  const totalQty = cargo.reduce((s, c) => s + c.quantity, 0);
  const totalVolume = cargo.reduce(
    (s, c) => s + volume(c.size) * c.quantity,
    0,
  );
  const totalWeight = cargo.reduce((s, c) => s + c.weight * c.quantity, 0);
  const packedQty = result?.placements.length ?? 0;
  const originalQty = result?.cargo.reduce((s, c) => s + c.quantity, 0) ?? 0;
  const packedWeight =
    result?.placements.reduce((s, p) => s + p.weight, 0) ?? 0;
  const packedVol =
    result?.placements.reduce((s, p) => s + volume(p.size), 0) ?? 0;
  const capacity = result ? volume(result.container.size) : 0;
  const resultUnit = countUnit(result?.cargo ?? cargo);
  const hasEnvelope = (result?.cargo ?? cargo).some(
    (c) => c.shape?.startsWith("cylinder") || c.shape === "bounding-box",
  );
  const exportAllowed =
    !!result &&
    !dirty &&
    !busy &&
    result.validation.valid &&
    (!fleet || fleet.validation.valid);
  const wholeLoaded =
    fleet?.results.reduce((s, r) => s + r.placements.length, 0) ?? packedQty;
  const wholeCargo = fleet?.cargo ?? result?.cargo ?? [];
  const allResults = fleet?.results ?? (result ? [result] : []);
  const handleExport = async (format: "xlsx" | "pdf" | "obj") => {
    if (!exportAllowed || !result || exporting) return;
    setExporting(true);
    setNotice("");
    try {
      const results = structuredClone(
        reportScope === "all" ? allResults : [result],
      );
      let saved: boolean;
      if (format === "obj") {
        const { exportModels } = await import("./domain/modelExport");
        saved = await exportModels(results, objFrame, objMaterials);
      } else if (fleet && reportScope === "all") {
        const { exportFleetReport } = await import("./domain/fleetReport");
        saved = await exportFleetReport(structuredClone(fleet), format);
      } else {
        const captureRef = captureRefFor(result.container.id);
        if (!captureRef.current)
          throw new Error("3D 视图尚未就绪，请等待加载完成后重试。");
        const image = captureRef.current();
        const { exportReport } = await import("./domain/exportReport");
        saved = await exportReport(structuredClone(result), image, format);
      }
      if (saved) setNotice("导出文件已生成。");
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "导出失败，请重试。",
      ]);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <Brand />
        <div className="header-divider" />
        <span className="header-label">免费开源的装柜计算工具</span>
        <div className="header-right">
          {!isDesktop() && (
            <a
              className="button"
              href={`${import.meta.env.BASE_URL}downloads.html`}
            >
              下载单机版
            </a>
          )}
          <span className="local-state">
            <LockKeyhole size={13} />
            本地计算 · 数据不上传
          </span>
          <button className="button subtle" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
            使用说明
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <h1>装柜方案</h1>
            <p>货物清单 · 混装分配 · 逐柜预览</p>
          </div>
          <div className="heading-actions">
            <button
              className="button"
              disabled={busy || exporting}
              onClick={() => setImporting(!importing)}
            >
              <FileSpreadsheet size={16} />
              导入 Excel
            </button>
            {(["xlsx", "pdf", "obj"] as const).map((format) => (
              <button
                key={format}
                className="button"
                disabled={!exportAllowed || exporting}
                title={
                  dirty
                    ? "请先重新计算"
                    : `导出${reportScope === "all" && fleet ? "全部柜子" : "当前柜"}`
                }
                onClick={() => void handleExport(format)}
              >
                <ArrowDownToLine size={16} />
                {exporting
                  ? "正在生成…"
                  : `导出 ${format === "xlsx" ? "Excel" : format.toUpperCase()}`}
              </button>
            ))}
          </div>
        </div>
        <div className="workflow">
          <span>选择柜子</span>
          <ArrowRight size={14} />
          <span>整理货物</span>
          <ArrowRight size={14} />
          <span>计算与导出</span>
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
            <div>{notice}</div>
            <button aria-label="关闭通知" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {importing && (
          <Suspense fallback={<p>正在加载 Excel 导入…</p>}>
            <ExcelImport
              onClose={() => setImporting(false)}
              onImport={(goods, replace) => {
                if (busy || exporting)
                  throw new Error(
                    "请先取消或等待当前计算、导出完成，再确认导入。",
                  );
                const next = replace ? goods : [...cargo, ...goods];
                if (
                  next.length > 200 ||
                  next.reduce((s, c) => s + c.quantity, 0) > 1500
                )
                  throw new Error(
                    "合并后超过 200 种规格或 1500 件，请减少货物或选择替换清单。",
                  );
                edit();
                setCargo(next);
                setExpandedCargoId(next[0]?.id ?? "");
                setImporting(false);
                setNotice(
                  `已导入 ${goods.length} 种规格，请核对包装及支撑设置后计算。`,
                );
              }}
            />
          </Suspense>
        )}
        <details className="export-options">
          <summary>导出范围与模型选项</summary>
          <div className="import-toolbar">
            <label className="inline-field">
              导出范围
              <select
                aria-label="导出范围"
                value={reportScope}
                disabled={exporting}
                onChange={(e) =>
                  setReportScope(e.target.value as typeof reportScope)
                }
              >
                <option value="all">整批方案 / 全部柜子</option>
                <option value="current">当前柜子</option>
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={objFrame}
                disabled={exporting}
                onChange={(e) => setObjFrame(e.target.checked)}
              />
              OBJ 包含柜体框架
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={objMaterials}
                disabled={exporting}
                onChange={(e) => setObjMaterials(e.target.checked)}
              />
              OBJ 与颜色材质打包
            </label>
            <span className="field-note">
              OBJ：毫米，Y 向上；X 柜长、Z 柜宽
            </span>
          </div>
        </details>
        <div className="workbench">
          <aside className="input-panel">
            <fieldset disabled={busy || exporting}>
              <section className="container-form">
                <div className="section-heading">
                  <h2>
                    <ContainerIcon size={18} />
                    集装箱
                  </h2>
                </div>
                <FleetSettings
                  mode={mode}
                  setMode={(m) => {
                    edit();
                    setMode(m);
                    if (m === "auto")
                      setAutoCandidates((current) => {
                        const rest = current.filter(
                          (candidate) => candidate.id !== container.id,
                        );
                        return [structuredClone(container), ...rest];
                      });
                  }}
                  count={containerCount}
                  setCount={(n) => {
                    edit();
                    setContainerCount(n);
                  }}
                  extras={extras}
                  setExtras={(e) => {
                    edit();
                    setExtras(e);
                  }}
                  max={maxContainers}
                  setMax={(n) => {
                    edit();
                    setMaxContainers(n);
                  }}
                  algorithm={fleetAlgorithm}
                  setAlgorithm={(a) => {
                    edit();
                    setFleetAlgorithm(a);
                  }}
                  candidates={autoCandidates}
                  setCandidates={(next) => {
                    edit();
                    setAutoCandidates(next);
                  }}
                  preference={autoPreference}
                  setPreference={(next) => {
                    edit();
                    setAutoPreference(next);
                  }}
                />
                {mode !== "auto" && (
                  <>
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
                      可用内尺寸 <span>mm</span>
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
                        {(["width", "height"] as const).map((axis) => (
                          <NumberField
                            key={axis}
                            label={`柜门${axis === "width" ? "宽" : "高"}`}
                            value={container.door[axis]}
                            suffix="mm"
                            onChange={(n) =>
                              updateContainer({
                                ...container,
                                door: { ...container.door, [axis]: n },
                              })
                            }
                          />
                        ))}
                      </div>
                    </details>
                    <details className="door-settings clearance-settings">
                      <summary>
                        预留间隙（可选）
                        <ChevronDown size={14} />
                      </summary>
                      <div className="three-fields">
                        {(["walls", "door", "between"] as const).map(
                          (field) => (
                            <NumberField
                              key={field}
                              label={
                                {
                                  walls: "柜壁四周",
                                  door: "柜门前方",
                                  between: "货物之间",
                                }[field]
                              }
                              value={container.clearance?.[field] ?? 0}
                              suffix="mm"
                              min={0}
                              onChange={(n) =>
                                updateContainer({
                                  ...container,
                                  clearance: {
                                    walls: 0,
                                    door: 0,
                                    between: 0,
                                    ...container.clearance,
                                    [field]: n,
                                  },
                                })
                              }
                            />
                          ),
                        )}
                      </div>
                    </details>
                    <p className="field-note">
                      预设尺寸供估算，可按实际柜况修改。
                    </p>
                  </>
                )}
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
                  {cargo.map((c, index) => (
                    <CargoEditor
                      key={c.id}
                      cargo={c}
                      index={index}
                      onChange={(patch) => updateCargo(c.id, patch)}
                      removable={cargo.length > 1}
                      expanded={expandedCargoId === c.id}
                      onToggle={() =>
                        setExpandedCargoId(expandedCargoId === c.id ? "" : c.id)
                      }
                      onRemove={() => {
                        edit();
                        const next = cargo.filter((p) => p.id !== c.id);
                        setCargo(next);
                        if (expandedCargoId === c.id)
                          setExpandedCargoId(next[0]?.id ?? "");
                      }}
                    />
                  ))}
                </div>
                <button
                  className="add-cargo"
                  onClick={addCargo}
                  disabled={cargo.length >= 200}
                >
                  <Plus size={16} />
                  添加货物规格
                </button>
              </section>
            </fieldset>
            <div className="calculate-panel">
              <div className="input-summary">
                <strong>
                  {fmt(totalQty)}
                  <small>{countUnit(cargo)}</small>
                </strong>
                <span>{fmt(totalVolume, 2)} m³</span>
                <span>{fmt(totalWeight)} kg</span>
              </div>
              <button
                className="button primary calculate"
                disabled={busy || exporting}
                onClick={() => calculate(container, cargo)}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} />
                    {progress || "正在计算…"}
                  </>
                ) : (
                  <>
                    计算装柜方案
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
              {busy && (
                <button
                  className="button cancel-calculation"
                  onClick={() => {
                    stop();
                    setBusy(false);
                    setProgress("");
                    setDirty(true);
                    setNotice("本次计算已取消，当前显示上次结果。");
                  }}
                >
                  <Square size={14} />
                  取消计算
                </button>
              )}
            </div>
          </aside>
          <div className="result-panel">
            {mode === "single" && !fleet && (
              <BenchmarkPanel
                busy={busy || exporting}
                dirty={dirty}
                runs={runs}
                activeAlgorithm={activeAlgorithm}
                caseId={caseId}
                onLoadCase={loadCase}
                onCompare={() => calculate(container, cargo, true)}
                onSelectRun={selectRun}
              />
            )}
            {fleet && (
              <section
                className={`fleet-results ${dirty ? "outdated" : ""}`}
                aria-label="整批装载结果"
              >
                <div className="section-heading">
                  <h2>整批装载结果</h2>
                  <span>
                    {fleet.status === "limit"
                      ? "达到试算上限"
                      : fleet.unpacked.length
                        ? "仍有货物未分配"
                        : "全部装入"}
                  </span>
                </div>
                <div className="fleet-totals">
                  <span>
                    使用{" "}
                    <strong>
                      {
                        fleet.results.filter((r) => r.placements.length > 0)
                          .length
                      }
                    </strong>{" "}
                    个柜子
                  </span>
                  <span>
                    装入 <strong>{fmt(wholeLoaded)}</strong> 件
                  </span>
                  <span>
                    剩余{" "}
                    <strong>
                      {fmt(fleet.unpacked.reduce((s, u) => s + u.quantity, 0))}
                    </strong>{" "}
                    件
                  </span>
                </div>
                <div className="fleet-combination" aria-label="采用的柜型组合">
                  <strong>采用组合</strong>
                  {Object.entries(
                    fleet.results.reduce<Record<string, number>>(
                      (counts, r) => {
                        const type = r.container.name.replace(
                          /^\d+ 号柜 · /,
                          "",
                        );
                        counts[type] = (counts[type] ?? 0) + 1;
                        return counts;
                      },
                      {},
                    ),
                  ).map(([type, count]) => (
                    <span key={type}>
                      {count} × {type}
                    </span>
                  ))}
                </div>
                <label className="number-field">
                  <span>当前查看柜子</span>
                  <select
                    aria-label="当前查看柜子"
                    value={result?.container.id ?? ""}
                    disabled={busy || dirty || exporting}
                    onChange={(e) => {
                      setResult(
                        fleet.results.find(
                          (r) => r.container.id === e.target.value,
                        )!,
                      );
                      setSelected(null);
                    }}
                  >
                    {fleet.results.map((r) => (
                      <option key={r.container.id} value={r.container.id}>
                        {r.container.name} · {r.placements.length} 件
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}
            <div className="result-heading">
              <h2>
                {fleet ? "当前柜装载结果" : "装载结果"}
                {!fleet && runs.length > 0 && (
                  <span className="active-algorithm-label">
                    {ALGORITHM_LABELS[activeAlgorithm]}
                  </span>
                )}
              </h2>
              <span
                className={`result-state ${dirty ? "stale" : ""}`}
                role="status"
              >
                {busy ? (
                  <>
                    <LoaderCircle size={14} className="spin" />
                    {progress || "正在计算"}
                  </>
                ) : dirty ? (
                  <>
                    <RotateCcw size={14} />
                    {result ? "输入已修改 · 请重新计算" : "等待计算"}
                  </>
                ) : result?.validation.valid ? (
                  <>
                    <ShieldCheck size={14} />
                    基础规则校验通过
                  </>
                ) : (
                  "等待有效结果"
                )}
              </span>
            </div>
            <div className={`metrics ${dirty && result ? "outdated" : ""}`}>
              <div className="metric">
                <span>
                  <Box size={15} />
                  已装货物
                </span>
                <strong data-testid="packed-count">
                  {result ? fmt(packedQty) : "—"}
                  <small>
                    {" "}
                    / {fmt(originalQty)} {resultUnit}
                  </small>
                </strong>
                <div className="metric-progress">
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
                  {hasEnvelope ? "占位空间利用率" : "空间利用率"}
                </span>
                <strong>
                  {result
                    ? fmt(capacity ? (packedVol / capacity) * 100 : 0, 1)
                    : "—"}
                  <small> %</small>
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
                  <small> kg</small>
                </strong>
                <p>
                  载重上限 {result ? fmt(result.container.maxWeight) : "—"} kg
                </p>
              </div>
              <div className="metric warning">
                <span>
                  <ClipboardList size={15} />
                  {fleet ? "整批未装入" : "当前未装入"}
                </span>
                <strong>
                  {result
                    ? fmt(
                        fleet
                          ? fleet.unpacked.reduce((s, u) => s + u.quantity, 0)
                          : originalQty - packedQty,
                      )
                    : "—"}
                  <small> 件</small>
                </strong>
                <p>{dirty ? "等待重新计算" : "按当前尺寸与装载规则计算"}</p>
              </div>
            </div>
            <div className="preview-region">
              {dirty && result && (
                <div className="stale-preview" role="status">
                  上次计算视图 · 左侧数据已修改，请重新计算
                </div>
              )}
              {fleet ? (
                <Suspense
                  fallback={
                    <div className="viewer-empty">
                      <LoaderCircle className="spin" />
                      正在加载三维查看器…
                    </div>
                  }
                >
                  <div
                    className="fleet-preview-grid"
                    aria-label="全部货柜三维预览"
                  >
                    {fleet.results.map((containerResult, index) => (
                      <section
                        className={`fleet-preview-item ${result?.container.id === containerResult.container.id ? "is-current" : ""}`}
                        key={containerResult.container.id}
                        aria-label={`${index + 1} 号柜预览`}
                      >
                        <button
                          className="fleet-preview-heading"
                          aria-pressed={
                            result?.container.id ===
                            containerResult.container.id
                          }
                          onClick={() => {
                            setResult(containerResult);
                            setSelected(null);
                          }}
                        >
                          <strong>{containerResult.container.name}</strong>
                          <span>{containerResult.placements.length} 件</span>
                        </button>
                        <ContainerViewer
                          result={containerResult}
                          captureRef={captureRefFor(
                            containerResult.container.id,
                          )}
                          selected={
                            result?.container.id ===
                            containerResult.container.id
                              ? (selected?.boxId ?? null)
                              : null
                          }
                          onSelect={(placement) => {
                            setResult(containerResult);
                            setSelected(placement);
                          }}
                          stale={
                            dirty ||
                            busy ||
                            exporting ||
                            !containerResult.validation.valid
                          }
                        />
                      </section>
                    ))}
                  </div>
                </Suspense>
              ) : result ? (
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
                    captureRef={captureRefFor(result.container.id)}
                    selected={selected?.boxId ?? null}
                    onSelect={setSelected}
                    stale={
                      dirty || busy || exporting || !result.validation.valid
                    }
                  />
                </Suspense>
              ) : (
                <div className="viewer-empty">
                  <ContainerIcon size={48} />
                  <h3>准备好货物，开始装柜</h3>
                </div>
              )}
            </div>
            <div className="cargo-legend">
              {(result?.cargo ?? cargo).map((c) => (
                <span key={c.id}>
                  <i style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              ))}
              <span className="door-legend">橙色边框为柜门</span>
            </div>
            {selected && result && (
              <div className="selection-detail" role="status">
                <strong>
                  {result.cargo.find((c) => c.id === selected.cargoId)?.name} ·{" "}
                  {selected.serialNumber ?? selected.boxId}
                </strong>
                <span>
                  位置 {selected.position.x}, {selected.position.y},{" "}
                  {selected.position.z} mm · 第 {selected.layer} 层
                </span>
                <button
                  aria-label="关闭货物详情"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <section className="result-table-section">
              <div className="section-heading">
                <h2>{fleet ? "整批货物分配明细" : "货物装载明细"}</h2>
                <span>{dirty ? "上次计算结果" : "按产品汇总"}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>货物名称 / 型号</th>
                      <th>计划数量</th>
                      <th>已装数量</th>
                      <th>未装数量</th>
                      <th>{fleet ? "分配柜号" : "结果说明"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wholeCargo.map((c) => {
                      const loaded = allResults.reduce(
                        (s, r) =>
                          s +
                          r.placements.filter((p) => p.cargoId === c.id).length,
                        0,
                      );
                      return (
                        <tr key={c.id}>
                          <td>
                            <i
                              className="table-color"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.name}
                            {c.model && <small>{c.model}</small>}
                          </td>
                          <td>{c.quantity}</td>
                          <td>{loaded}</td>
                          <td>{c.quantity - loaded}</td>
                          <td>
                            {fleet
                              ? allResults
                                  .filter((r) =>
                                    r.placements.some(
                                      (p) => p.cargoId === c.id,
                                    ),
                                  )
                                  .map(
                                    (r) =>
                                      `${r.container.id}：${r.placements.filter((p) => p.cargoId === c.id).length}`,
                                  )
                                  .join("；") || "未分配"
                              : loaded === c.quantity
                                ? "全部装入"
                                : result?.unpacked.find(
                                    (u) => u.cargoId === c.id,
                                  )?.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            {result?.placements.some((p) => p.serialNumber) && (
              <details className="traceability">
                <summary>当前柜逐件序列号</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>柜号</th>
                        <th>货物 / 型号</th>
                        <th>序列号</th>
                        <th>层数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.placements.map((p) => (
                        <tr key={p.boxId}>
                          <td>{p.containerId}</td>
                          <td>
                            {result.cargo.find((c) => c.id === p.cargoId)
                              ?.model ??
                              result.cargo.find((c) => c.id === p.cargoId)
                                ?.name}
                          </td>
                          <td>{p.serialNumber ?? p.boxId}</td>
                          <td>{p.layer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
        <footer className="app-footer">
          <Brand />
          <span>本地计算 · 占位估算 · Powered by Fleix</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        className="help-dialog"
        onCancel={() => setHelp(false)}
      >
        <div className="section-heading">
          <h2>使用说明</h2>
          <button aria-label="关闭使用说明" onClick={() => setHelp(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="help-content">
          <h3>货物与包装</h3>
          <p>
            按形态填写实际装运尺寸和每件毛重。圆柱填写直径和轴向长度；有底座或支架时，整体占位及毛重需要包含支撑。木箱、木架和整托填写整体外尺寸。
          </p>
          <h3>混装与叠放</h3>
          <p>
            同柜可混装不同形态。叠放按同规格上下完整对齐计算；圆柱默认不叠放。支架外观仅示意，不计算交错嵌套、跨规格叠压及实际抗压。
          </p>
          <h3>多柜</h3>
          <p>
            指定柜子按清单顺序逐柜分配；自动估算使用选定柜型，最多 50
            柜。结果是当前启发式方案，不保证最少柜数。每批最多 200 种规格、1500
            件。
          </p>
          <h3>Excel 与导出</h3>
          <p>
            导入 .xlsx
            后核对字段、尺寸和重量单位，在预览中补齐缺失值。支持保存本机映射。导出范围可选当前柜或整批；OBJ
            为毫米、Y 向上，材质可打包保存。
          </p>
        </div>
        <button className="button primary" onClick={() => setHelp(false)}>
          关闭
        </button>
      </dialog>
    </>
  );
}
