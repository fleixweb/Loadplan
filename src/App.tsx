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
import { cargoIssues, changeCargo } from "./domain/cargoModel";
import { COLORS, CONTAINERS, volume } from "./domain/sample";
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
  cargo: [] as Cargo[],
};
const fmt = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("zh-CN", { maximumFractionDigits: digits })
    : "—";

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf" | "obj">(
    "xlsx",
  );
  const [container, setContainer] = useState<Container>(initial.container);
  const [cargo, setCargo] = useState<Cargo[]>(initial.cargo);
  const [cargoMode, setCargoMode] = useState<"single" | "mixed">("single");
  const [cargoEditorOpen, setCargoEditorOpen] = useState(false);
  const [cargoEditorError, setCargoEditorError] = useState("");
  const [singleSelection, setSingleSelection] = useState<string | null>(null);
  const [containerEditorOpen, setContainerEditorOpen] = useState(false);
  const [containerEditorError, setContainerEditorError] = useState("");
  const containerDialog = useRef<HTMLDialogElement>(null);
  const containerEditButton = useRef<HTMLButtonElement>(null);
  const wasContainerEditorOpen = useRef(false);
  useEffect(() => {
    if (
      containerEditorOpen &&
      containerDialog.current &&
      !containerDialog.current.open
    )
      containerDialog.current.showModal();
    if (!containerEditorOpen && wasContainerEditorOpen.current)
      containerEditButton.current?.focus();
    wasContainerEditorOpen.current = containerEditorOpen;
  }, [containerEditorOpen]);
  const cargoDialog = useRef<HTMLDialogElement>(null);
  const cargoEditButton = useRef<HTMLButtonElement>(null);
  const wasCargoEditorOpen = useRef(false);
  useEffect(() => {
    if (cargoEditorOpen && cargoDialog.current && !cargoDialog.current.open)
      cargoDialog.current.showModal();
    if (!cargoEditorOpen && wasCargoEditorOpen.current)
      cargoEditButton.current?.focus();
    if (!cargoEditorOpen) setSingleSelection(null);
    wasCargoEditorOpen.current = cargoEditorOpen;
  }, [cargoEditorOpen]);
  const finishCargoEditing = () => {
    if (singleSelection !== null) return;
    const issues = validateInput(CONTAINERS[0], cargo);
    const invalid = cargo.find((c) => cargoIssues(c).length > 0);
    if (issues.length || invalid) {
      setCargoEditorError(issues[0] ?? cargoIssues(invalid!)[0]);
      const index = cargo.findIndex(
        (c) =>
          validateInput(CONTAINERS[0], [c]).length || cargoIssues(c).length,
      );
      if (index >= 0) setExpandedCargoId(cargo[index].id);
      requestAnimationFrame(() =>
        cargoDialog.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setCargoEditorError("");
    setCargoEditorOpen(false);
  };
  const [expandedCargoId, setExpandedCargoId] = useState("");
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
  const [importing, setImporting] = useState(false);
  const excelDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (importing && excelDialog.current && !excelDialog.current.open)
      excelDialog.current.showModal();
  }, [importing]);
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
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const goToStep = (next: 1 | 2 | 3) => {
    if (busy || exporting) return;
    if (next === 3 && (!result || dirty)) return;
    if (next === 2) {
      const issues = validateInput(CONTAINERS[0], cargo);
      const invalidCargo = cargo.find((c) => cargoIssues(c).length > 0);
      if (issues.length || invalidCargo) {
        setErrors(issues.length ? issues : cargoIssues(invalidCargo!));
        setStep(1);
        const invalidIndex = cargo.findIndex(
          (c) =>
            validateInput(CONTAINERS[0], [c]).length > 0 ||
            cargoIssues(c).length > 0,
        );
        if (invalidIndex >= 0) {
          setCargoEditorOpen(true);
          setExpandedCargoId(cargo[invalidIndex].id);
          requestAnimationFrame(() => {
            const card =
              document.querySelectorAll<HTMLElement>(".cargo-card")[
                invalidIndex
              ];
            const field =
              card?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
              card?.querySelector<HTMLElement>("input");
            field?.focus();
            card?.scrollIntoView({ block: "center" });
          });
        }
        return;
      }
    }
    setErrors([]);
    if (next !== 1) setCargoEditorOpen(false);
    if (next === 2) setContainerEditorOpen(true);
    if (next !== 2) setContainerEditorOpen(false);
    setExportOpen(false);
    setImporting(false);
    setStep(next);
  };

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
    setCaseId(null);
    setCargoEditorError("");
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
  };
  const openCargoMode = (next: "single" | "mixed") => {
    if (busy || exporting) return;
    if (!cargo.length) addCargo();
    setStep(1);
    setCargoEditorError("");
    setSingleSelection(
      next === "single" && cargo.length > 1 ? cargo[0].id : null,
    );
    if (!(next === "single" && cargo.length > 1) && cargoMode !== next) {
      edit();
      setCargoMode(next);
    }
    setCargoEditorOpen(true);
  };
  const openContainerMode = (next: "single" | "fixed" | "auto") => {
    if (busy || exporting) return;
    if (mode !== next) {
      edit();
      setMode(next);
      if (next === "auto")
        setAutoCandidates((current) => [
          structuredClone(container),
          ...current.filter((c) => c.id !== container.id),
        ]);
    }
    setStep(2);
    setContainerEditorError("");
    setContainerEditorOpen(true);
  };
  const finishContainerEditing = () => {
    const templates =
      mode === "auto"
        ? autoCandidates
        : mode === "fixed"
          ? [container, ...extras.map((e) => e.container)]
          : [container];
    const issues = templates.flatMap((c) =>
      validateInput(c, []).map((issue) => `${c.id}: ${issue}`),
    );
    if (
      mode === "fixed" &&
      [containerCount, ...extras.map((e) => e.count)].some(
        (n) => !Number.isSafeInteger(n) || n < 1 || n > 50,
      )
    )
      issues.push("每种柜型数量必须为 1–50 的整数。");
    if (
      mode === "fixed" &&
      containerCount + extras.reduce((n, e) => n + e.count, 0) > 50
    )
      issues.push("最多支持 50 个柜子。");
    if (
      mode === "auto" &&
      (!Number.isSafeInteger(maxContainers) ||
        maxContainers < 1 ||
        maxContainers > 50)
    )
      issues.push("最多试算柜数必须为 1–50 的整数。");
    if (issues.length) {
      setContainerEditorError(issues[0]);
      requestAnimationFrame(() => {
        const field = containerDialog.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        field?.closest("details")?.setAttribute("open", "");
        field?.focus();
      });
      return;
    }
    setContainerEditorError("");
    setContainerEditorOpen(false);
  };
  const calculate = (
    c: Container,
    goods: Cargo[],
    compare = false,
    selectedMode = mode,
  ) => {
    if (!goods.length) {
      setErrors(["请先选择货物组合方式，填写货物或导入 Excel。"]);
      return;
    }
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
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(
          '.container-form [aria-invalid="true"]',
        );
        field?.closest("details")?.setAttribute("open", "");
        field?.focus();
      });
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
    setContainerEditorOpen(false);
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
          setStep(3);
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
            setStep(3);
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
  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (help && !dialog.current?.open) dialog.current?.showModal();
    if (!help && dialog.current?.open) dialog.current.close();
  }, [help]);
  const loadCase = (fixture: StandardCase) => {
    const c = structuredClone(fixture.container),
      goods = structuredClone(fixture.cargo);
    edit();
    setMode("single");
    setContainer(c);
    setCargo(goods);
    setCargoMode(goods.length > 1 ? "mixed" : "single");
    setExpandedCargoId(goods[0]?.id ?? "");
    setCaseId(fixture.id);
    setStep(2);
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
        name: "",
        size: { x: NaN, y: NaN, z: NaN },
        quantity: NaN,
        weight: NaN,
        rotation: "upright",
        maxLayers: 1,
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
        const captureDeadline = performance.now() + 5000;
        while (!captureRef.current && performance.now() < captureDeadline)
          await new Promise((resolve) => window.setTimeout(resolve, 50));
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
        <div className="header-workflow">
          <h1 ref={stepHeading} tabIndex={-1}>
            计算步骤提示
          </h1>
          <nav className="workflow wizard-steps" aria-label="装柜步骤">
            {(["整理货物", "设置柜子", "查看方案"] as const).map(
              (label, index) => {
                const number = (index + 1) as 1 | 2 | 3;
                const complete =
                  number < step || (number === 3 && !!result && !dirty);
                return (
                  <button
                    key={label}
                    className={`wizard-step ${step === number ? "is-active" : ""}`}
                    aria-current={step === number ? "step" : undefined}
                    disabled={
                      busy || exporting || (number === 3 && (!result || dirty))
                    }
                    onClick={() => goToStep(number)}
                  >
                    <span className="step-number">
                      {complete && step !== number ? (
                        <Check size={16} />
                      ) : (
                        number
                      )}
                    </span>
                    <strong>{label}</strong>
                  </button>
                );
              },
            )}
          </nav>
        </div>
        <div className="header-right">
          {!isDesktop() && (
            <a
              className="button"
              href={`${import.meta.env.BASE_URL}downloads.html`}
            >
              下载单机版
            </a>
          )}
          <button className="button subtle" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
            使用说明
          </button>
        </div>
      </header>
      <main className="workspace">
        {step === 3 && (
          <div className="workflow-header">
            <div className="heading-actions">
              <>
                  <button
                    className="button"
                    disabled={busy || exporting}
                    onClick={() => {
                      goToStep(1);
                      setCargoEditorOpen(true);
                    }}
                  >
                    修改货物
                  </button>
                  <button
                    className="button"
                    disabled={busy || exporting}
                    onClick={() => goToStep(2)}
                  >
                    修改柜子
                  </button>
                  <button
                    className="button primary"
                    disabled={!exportAllowed || exporting}
                    aria-expanded={exportOpen}
                    aria-controls="export-panel"
                    onClick={() => setExportOpen(!exportOpen)}
                  >
                    <ArrowDownToLine size={16} />
                    导出方案
                  </button>
              </>
            </div>
          </div>
        )}
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
          <dialog
            ref={excelDialog}
            className="excel-import-modal"
            aria-label="导入 Excel"
            onCancel={() => setImporting(false)}
          >
            <Suspense fallback={<p>正在加载 Excel 导入…</p>}>
              <ExcelImport
                defaultReplace={cargoMode === "single"}
                onClose={() => setImporting(false)}
                onImport={(goods, replace) => {
                  if (busy || exporting)
                    throw new Error(
                      "请先取消或等待当前计算、导出完成，再确认导入。",
                    );
                  const next = replace ? goods : [...cargo, ...goods];
                  if (cargoMode === "single" && next.length > 1)
                    throw new Error(
                      "当前为单一产品装柜模式，导入结果包含多个规格。请切换到多种产品混装，或只保留一个产品规格。",
                    );
                  if (next.length > 200)
                    throw new Error(
                      "合并后超过 200 种规格，请减少规格或选择替换清单。",
                    );
                  if (
                    !Number.isSafeInteger(
                      next.reduce((s, c) => s + c.quantity, 0),
                    )
                  )
                    throw new Error("货物总数量超出可精确计算的整数范围。");
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
          </dialog>
        )}
        {step === 3 && exportOpen && (
          <section
            className="export-options"
            id="export-panel"
            aria-label="导出方案设置"
          >
            <div className="section-heading">
              <h2>导出方案</h2>
              <button
                className="text-button"
                aria-label="关闭导出设置"
                onClick={() => setExportOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="import-toolbar">
              <label className="inline-field">
                文件格式
                <select
                  aria-label="导出格式"
                  value={exportFormat}
                  disabled={exporting}
                  onChange={(e) =>
                    setExportFormat(e.target.value as typeof exportFormat)
                  }
                >
                  <option value="xlsx">Excel</option>
                  <option value="pdf">PDF</option>
                  <option value="obj">OBJ 三维模型</option>
                </select>
              </label>
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
              {exportFormat === "obj" && (
                <>
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
                </>
              )}
              <button
                className="button primary"
                disabled={!exportAllowed || exporting}
                onClick={() => void handleExport(exportFormat)}
              >
                {exporting ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ArrowDownToLine size={16} />
                )}
                {exporting ? "正在生成…" : "生成文件"}
              </button>
            </div>
          </section>
        )}
        <div className={`workbench wizard-workbench wizard-step-${step}`}>
          <aside className="input-panel">
            <fieldset disabled={busy || exporting}>
              {containerEditorOpen && (
                <dialog
                  ref={containerDialog}
                  className="container-editor-modal"
                  aria-label="设置柜子"
                  onCancel={() => setContainerEditorOpen(false)}
                >
                  <section className="container-form">
                    <div className="section-heading">
                      <h2>
                        <ContainerIcon size={18} />
                        {mode === "single"
                          ? "单柜计算"
                          : mode === "fixed"
                            ? "指定多个柜子"
                            : "自动估算柜数"}
                      </h2>
                      <div className="cargo-heading-actions">
                        <button
                          className="text-button"
                          title="关闭柜子设置"
                          aria-label="关闭柜子设置"
                          onClick={() => setContainerEditorOpen(false)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    {containerEditorError && (
                      <p className="field-errors" role="alert">
                        {containerEditorError}
                      </p>
                    )}
                    <FleetSettings
                      mode={mode}
                      container={container}
                      setContainer={updateContainer}
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
                    {mode === "single" && (
                      <>
                        <div className="container-options">
                          {CONTAINERS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              aria-label={`${c.id} ${c.id === "40HQ" ? "高柜" : "标准柜"}`}
                              aria-pressed={container.id === c.id}
                              onClick={() =>
                                updateContainer(structuredClone(c))
                              }
                            >
                              <ContainerIcon size={25} strokeWidth={1.3} />
                              <strong>{c.id}</strong>
                              <small>
                                {c.id === "40HQ" ? "高柜" : "标准柜"}
                              </small>
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
                        <details className="door-settings parameter-disclosure">
                          <summary>
                            <span className="parameter-summary-copy">
                              <strong>编辑柜门尺寸</strong>
                              <span>
                                {container.door.width} × {container.door.height} mm
                              </span>
                            </span>
                            <span className="parameter-summary-action">
                              <small>可编辑</small>
                              <ChevronDown size={16} aria-hidden="true" />
                            </span>
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
                        <details className="door-settings clearance-settings parameter-disclosure">
                          <summary>
                            <span className="parameter-summary-copy">
                              <strong>编辑预留间隙</strong>
                              <span>柜壁、柜门前方和货物之间</span>
                            </span>
                            <span className="parameter-summary-action">
                              <small>可选</small>
                              <ChevronDown size={16} aria-hidden="true" />
                            </span>
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
                    <div className="modal-footer">
                      <button
                        className="button primary"
                        onClick={finishContainerEditing}
                      >
                        完成柜子设置
                      </button>
                    </div>
                  </section>
                </dialog>
              )}
              {
                <section className="cargo-nav-panel">
                  <div className="section-heading">
                    <h2>
                      <Package size={18} />
                      货物清单 <small>{cargo.length}</small>
                    </h2>
                    <span className="nav-heading-hint">点击货物组合方式</span>
                  </div>
                  <div
                    className="nav-mode-options"
                    role="group"
                    aria-label="货物组合方式"
                  >
                    <button
                      ref={cargoEditButton}
                      aria-pressed={cargoMode === "single"}
                      onClick={() => openCargoMode("single")}
                    >
                      单一产品装柜
                    </button>
                    <button
                      aria-pressed={cargoMode === "mixed"}
                      onClick={() => openCargoMode("mixed")}
                    >
                      多种产品混装
                    </button>
                  </div>
                  <ul className="cargo-nav-list">
                    {cargo.map((c, index) => (
                      <li key={c.id}>
                        <span
                          className="cargo-swatch"
                          style={{ backgroundColor: c.color }}
                        >
                          {index + 1}
                        </span>
                        <button
                          className="cargo-item-edit"
                          aria-label={`编辑货物 ${index + 1}`}
                          onClick={() => {
                            setStep(1);
                            setExpandedCargoId(c.id);
                            setCargoEditorOpen(true);
                          }}
                        >
                          {c.name || "未命名货物"}
                        </button>
                        <strong>
                          {fmt(c.quantity)} {countUnit([c])}
                        </strong>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="button cargo-import-button"
                    disabled={busy || exporting}
                    onClick={() => {
                      setStep(1);
                      setCargoEditorOpen(false);
                      setContainerEditorOpen(false);
                      setImporting(!importing);
                    }}
                  >
                    <FileSpreadsheet size={15} /> 导入 Excel
                  </button>
                </section>
              }
              <section className="container-nav-panel">
                <div className="section-heading">
                  <h2>
                    <ContainerIcon size={18} />
                    柜子计算方式
                  </h2>
                  <span className="nav-heading-hint">点击选择计算方式</span>
                </div>
                <div
                  className="nav-mode-options container-mode-options"
                  role="group"
                  aria-label="柜子计算方式"
                >
                  <button
                    ref={containerEditButton}
                    aria-pressed={mode === "single"}
                    onClick={() => openContainerMode("single")}
                  >
                    单柜计算
                  </button>
                  <button
                    aria-pressed={mode === "fixed"}
                    onClick={() => openContainerMode("fixed")}
                  >
                    指定多个柜子
                  </button>
                  <button
                    aria-pressed={mode === "auto"}
                    onClick={() => openContainerMode("auto")}
                  >
                    自动估算柜数
                  </button>
                </div>
              </section>
              {cargoEditorOpen && (
                <dialog
                  ref={cargoDialog}
                  className="cargo-editor-modal"
                  aria-label="编辑货物"
                  onCancel={() => setCargoEditorOpen(false)}
                >
                  <section className="cargo-form">
                    <div className="section-heading">
                      <h2>
                        <Package size={18} />
                        货物清单 <small>{cargo.length}</small>
                      </h2>
                      <div className="cargo-heading-actions">
                        <button
                          className="text-button"
                          aria-label="关闭货物编辑"
                          title="关闭货物编辑"
                          onClick={() => setCargoEditorOpen(false)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    {cargoEditorError && (
                      <p className="field-errors" role="alert">
                        {cargoEditorError}
                      </p>
                    )}
                    {singleSelection !== null && (
                      <section
                        className="single-product-selection"
                        aria-label="选择保留的货物"
                      >
                        <p>
                          切换为单一产品装柜后，只保留所选规格。确认前货物清单保持不变。
                        </p>
                        <label className="number-field">
                          <span>保留货物</span>
                          <select
                            aria-label="保留货物"
                            value={singleSelection}
                            onChange={(e) => setSingleSelection(e.target.value)}
                          >
                            {cargo.map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name} · {c.quantity} {countUnit([c])}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button primary"
                          onClick={() => {
                            const selectedCargo = cargo.find(
                              (c) => c.id === singleSelection,
                            );
                            if (!selectedCargo) return;
                            edit();
                            setCargo([selectedCargo]);
                            setExpandedCargoId(selectedCargo.id);
                            setCargoMode("single");
                            setSingleSelection(null);
                          }}
                        >
                          确认仅保留所选规格
                        </button>
                        <button
                          className="button"
                          onClick={() => setSingleSelection(null)}
                        >
                          保留混装清单
                        </button>
                      </section>
                    )}
                    <p className="field-note">
                      {cargoMode === "single" ? "单一产品装柜" : "多种产品混装"}
                    </p>
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
                            setExpandedCargoId(
                              expandedCargoId === c.id ? "" : c.id,
                            )
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
                    {cargoMode === "mixed" && (
                      <button
                        className="add-cargo"
                        onClick={addCargo}
                        disabled={cargo.length >= 200}
                      >
                        <Plus size={16} />
                        添加货物规格
                      </button>
                    )}
                    <div className="modal-footer">
                      <button
                        className="button cargo-modal-close"
                        onClick={finishCargoEditing}
                        disabled={singleSelection !== null}
                      >
                        完成
                      </button>
                    </div>
                  </section>
                </dialog>
              )}
            </fieldset>
            <div className="calculate-panel">
              <button
                className="button primary calculate"
                disabled={busy || exporting}
                onClick={() => calculate(container, cargo, mode === "single")}
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
            {
              <section className="input-overview" aria-label="待计算货物摘要">
                <div className="section-heading">
                  <h2>本批货物</h2>
                  <span>
                    {!result
                      ? "尚未计算"
                      : dirty
                        ? "货物已修改 · 待重新计算"
                        : "当前货物清单"}
                  </span>
                </div>
                <div className="overview-totals">
                  <span>
                    <strong>{cargo.length}</strong> 种规格
                  </span>
                  <span>
                    <strong>{fmt(totalQty)}</strong> {countUnit(cargo)}
                  </span>
                  <span>
                    <strong>{fmt(totalVolume, 2)}</strong> m³
                  </span>
                  <span>
                    <strong>{fmt(totalWeight)}</strong> kg
                  </span>
                </div>
                {cargo.length === 0 && (
                  <p className="empty-overview">
                    请先在左侧添加货物，添加后将在此显示本批货物汇总。
                  </p>
                )}
                <div className="table-scroll" hidden={cargo.length === 0}>
                  <table>
                    <thead>
                      <tr>
                        <th>货物名称</th>
                        <th>占位尺寸 / mm</th>
                        <th>数量</th>
                        <th>单件毛重 / kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargo.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <i
                              className="table-color"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.name}
                          </td>
                          <td>
                            {fmt(c.size.x)} × {fmt(c.size.y)} × {fmt(c.size.z)}
                          </td>
                          <td>{fmt(c.quantity)}</td>
                          <td>{fmt(c.weight)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div
                  className="overview-settings"
                  aria-label="当前选择的装柜配置"
                >
                  <div className="overview-container">
                    <Package size={20} />
                    <div>
                      <span className="overview-setting-label">
                        货物组合方式
                      </span>
                      <strong className="overview-selection">
                        {cargoMode === "single"
                          ? "单一产品装柜"
                          : "多种产品混装"}
                      </strong>
                    </div>
                  </div>
                  <div className="overview-container">
                    <ContainerIcon size={20} />
                    <div>
                      <span className="overview-setting-label">
                        柜子计算方式
                      </span>
                      <strong className="overview-selection">
                        {mode === "single"
                          ? "单柜计算"
                          : mode === "fixed"
                            ? "指定多个柜子"
                            : "自动估算柜数"}
                      </strong>
                      <p className="overview-selection-detail">
                        {mode === "auto"
                          ? `可用柜型：${autoCandidates.map((c) => c.id).join(" / ")}`
                          : mode === "fixed"
                            ? [{ container, count: containerCount }, ...extras]
                                .map((e) => `${e.count} × ${e.container.name}`)
                                .join(" + ")
                            : container.name}
                      </p>
                      {mode === "auto" && (
                        <p className="overview-selection-detail">
                          {autoPreference === "priority"
                            ? "按柜型优先级"
                            : "每柜尽量多装"}{" "}
                          · 最多 {fmt(maxContainers)} 柜
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            }
            <div className="calculated-results" hidden={!result}>
              {mode === "single" && !fleet && step === 3 && (
                <BenchmarkPanel
                  busy={busy || exporting}
                  dirty={dirty}
                  runs={runs}
                  activeAlgorithm={activeAlgorithm}
                  caseId={caseId}
                  onLoadCase={loadCase}
                  onCompare={() => {
                    setStep(2);
                    calculate(container, cargo, true);
                  }}
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
                        {fmt(
                          fleet.unpacked.reduce((s, u) => s + u.quantity, 0),
                        )}
                      </strong>{" "}
                      件
                    </span>
                  </div>
                  <div
                    className="fleet-combination"
                    aria-label="采用的柜型组合"
                  >
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
                    {result.cargo.find((c) => c.id === selected.cargoId)?.name}{" "}
                    · {selected.serialNumber ?? selected.boxId}
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
                            r.placements.filter((p) => p.cargoId === c.id)
                              .length,
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
        </div>
        <footer className="app-footer">
          <div className="footer-brand">
            <Brand />
          </div>
          <span className="footer-note">本地计算 · 占位估算</span>
          <span className="footer-credit">
            Powered by Fleix 45186482@qq.com · 外贸AI应用开发、全定制建站
          </span>
          <nav className="footer-licenses" aria-label="许可与源码">
            <a href="LICENSE">AGPL-3.0</a>
            <a
              href="https://github.com/fleixweb/Loadplan"
              target="_blank"
              rel="noreferrer"
            >
              GitHub 仓库
            </a>
          </nav>
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
            柜。结果是当前启发式方案，不保证最少柜数。每批最多 200
            种规格，实际装入数量按空间、载重与叠放规则计算，超出容量的货物保留在剩余清单中。
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
