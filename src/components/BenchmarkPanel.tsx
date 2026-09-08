import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Package,
  GitCompareArrows,
  LoaderCircle,
  Play,
  TriangleAlert,
} from "lucide-react";
import {
  STANDARD_CASES,
  evaluateCase,
  type CaseEvaluation,
  type StandardCase,
  type SuiteEntry,
} from "../domain/cases";
import type { AlgorithmId, ComparisonRun } from "../domain/comparison";
import type { PackingResponse } from "../domain/worker-protocol";
import { volume } from "../domain/sample";

interface Props {
  busy: boolean;
  dirty: boolean;
  runs: ComparisonRun[];
  activeAlgorithm: AlgorithmId;
  caseId: string | null;
  onLoadCase: (fixture: StandardCase) => void;
  onCompare: () => void;
  onSelectRun: (run: ComparisonRun) => void;
}

const number = (n: number, digits = 1) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: digits });
const statusText: Record<CaseEvaluation["status"], string> = {
  pass: "与手算一致",
  mismatch: "未达可装箱数",
  invalid: "摆放存在问题",
  error: "运行失败",
  "rules-only": "符合已设置的限制",
};

function CaseOutcome({ evaluation }: { evaluation: CaseEvaluation }) {
  const passed =
    evaluation.status === "pass" || evaluation.status === "rules-only";
  return (
    <span
      className={`case-outcome ${passed ? "passed" : "failed"}`}
      title={evaluation.errors.join("；")}
    >
      {passed ? <Check size={12} /> : <TriangleAlert size={12} />}
      <b>{evaluation.count === null ? "—" : `${evaluation.count} 箱`}</b>
      <span>{statusText[evaluation.status]}</span>

      {!passed && evaluation.errors.length > 0 && (
        <span className="case-error">
          {evaluation.errors.slice(0, 2).join("；")}
        </span>
      )}
    </span>
  );
}

export default function BenchmarkPanel({
  busy,
  dirty,
  runs,
  activeAlgorithm,
  caseId,
  onLoadCase,
  onCompare,
  onSelectRun,
}: Props) {
  const [chosenId, setChosenId] = useState("regular");
  const [suiteBusy, setSuiteBusy] = useState(false);
  const [suite, setSuite] = useState<SuiteEntry[] | null>(null);
  const [suiteError, setSuiteError] = useState("");
  const suiteWorker = useRef<Worker | null>(null);
  const suiteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chosen = STANDARD_CASES.find((c) => c.id === chosenId)!;
  const loadedCase = STANDARD_CASES.find((c) => c.id === caseId);
  const stop = () => {
    suiteWorker.current?.terminate();
    suiteWorker.current = null;
    if (suiteTimer.current) clearTimeout(suiteTimer.current);
    suiteTimer.current = null;
  };
  useEffect(() => () => stop(), []);

  const runSuite = () => {
    stop();
    setSuite(null);
    setSuiteError("");
    setSuiteBusy(true);
    try {
      const w = new Worker(
        new URL("../domain/packing.worker.ts", import.meta.url),
        { type: "module" },
      );
      suiteWorker.current = w;
      w.onmessage = (event: MessageEvent<PackingResponse>) => {
        if (suiteWorker.current !== w) return;
        if (event.data.suite) setSuite(event.data.suite);
        else
          setSuiteError(event.data.error || "标准案例检查没有返回有效结果。");
        stop();
        setSuiteBusy(false);
      };
      w.onerror = () => {
        if (suiteWorker.current === w) {
          stop();
          setSuiteBusy(false);
          setSuiteError("标准案例检查失败，请重试。");
        }
      };
      suiteTimer.current = setTimeout(() => {
        stop();
        setSuiteBusy(false);
        setSuiteError("案例检查超过 30 秒，已终止。可逐个加载案例查看。");
      }, 30000);
      w.postMessage({ task: "suite" });
    } catch {
      stop();
      setSuiteBusy(false);
      setSuiteError("当前浏览器无法启动案例检查。");
    }
  };
  const exact =
    suite?.filter((c) => c.expectedCount !== null).flatMap((c) => c.runs) ?? [];
  const exactPassed = exact.filter((r) => r.status === "pass").length;

  return (
    <section className="benchmark-panel" aria-label="比较装柜方案">
      <div className="benchmark-heading">
        <div>
          <Package size={18} />
          <h2>比较装柜方案</h2>
          <span>看看哪种装法更合适</span>
        </div>
        <button
          className="button"
          disabled={busy || suiteBusy}
          onClick={onCompare}
        >
          <GitCompareArrows size={15} />
          比较两种装法
        </button>
      </div>
      <details className="case-library">
        <summary>
          <BookOpen size={15} />
          <span>没有数据？先试一个例子</span>
          <small>内置 8 个例子</small>
          <ChevronDown size={15} />
        </summary>
        <div className="case-library-body">
          <div className="case-picker">
            <label htmlFor="standard-case">选择例子</label>
            <select
              id="standard-case"
              value={chosenId}
              onChange={(e) => setChosenId(e.target.value)}
            >
              {STANDARD_CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.expectedCount !== null
                    ? ` · 可装 ${c.expectedCount} 箱`
                    : " · 模拟货物"}
                </option>
              ))}
            </select>
            <button
              className="button"
              disabled={busy || suiteBusy}
              onClick={() => onLoadCase(chosen)}
            >
              用这个例子试算
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="case-explanation">
            <strong>{chosen.description}</strong>
            <details className="example-proof">
              <summary>为什么能装这些箱？</summary>
              <p>{chosen.proof}</p>
            </details>
            <small>
              试算会替换左侧的柜体和货物。需要保留当前方案时，请先导出。
            </small>
          </div>
          <details className="example-checks">
            <summary>查看例子的计算检查</summary>
            <div className="suite-actions">
              <button
                className="button"
                disabled={suiteBusy || busy}
                onClick={runSuite}
              >
                {suiteBusy ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Play size={14} />
                )}
                {suiteBusy ? "正在检查…" : "检查全部例子"}
              </button>
              <span>检查这些例子的计算结果，不改变左侧货物。</span>
            </div>
            {suiteError && (
              <p className="suite-error" role="alert">
                {suiteError}
              </p>
            )}
            {suite && (
              <div className="suite-results">
                <p role="status">
                  <strong>
                    已通过：{exactPassed} / {exact.length} 项计算检查
                  </strong>
                  <span>
                    混装例子没有确定的最多箱数，只检查摆放是否符合已设置的限制。
                  </span>
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>案例</th>
                        <th>可装箱数</th>
                        <th>装法一</th>
                        <th>装法二</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suite.map((entry) => (
                        <tr key={entry.caseId}>
                          <td>{entry.title}</td>
                          <td>
                            {entry.expectedCount === null
                              ? "最多能装多少尚不确定"
                              : `${entry.expectedCount} 箱`}
                          </td>
                          {entry.runs.map((e) => (
                            <td key={e.algorithmId}>
                              <CaseOutcome evaluation={e} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </details>
        </div>
      </details>
      {runs.length > 0 ? (
        <div
          className={`algorithm-comparison ${dirty ? "comparison-stale" : ""}`}
        >
          <p className="comparison-summary" role="status">
            {dirty
              ? "货物已修改，请重新比较。下方仍是上次的结果。"
              : (() => {
                  const valid = runs.filter(
                    (run) => run.result?.validation.valid && !run.error,
                  );
                  if (valid.length !== 2)
                    return "部分装法未能生成可用方案，请查看下方说明。";
                  const difference =
                    valid[1].result!.placements.length -
                    valid[0].result!.placements.length;
                  return difference === 0
                    ? "两种装法装入的箱数相同，可以分别查看摆放方式。"
                    : `装法${difference > 0 ? "二" : "一"}比另一种多装 ${Math.abs(difference)} 箱。可查看下方摆放图，再选择方案。`;
                })()}
          </p>
          {loadedCase && !dirty && (
            <p className="example-current">正在试算：{loadedCase.title}</p>
          )}
          <div className="loading-options">
            {(() => {
              const validRuns = runs.filter(
                (candidate) =>
                  candidate.result?.validation.valid && !candidate.error,
              );
              const counts = validRuns.map(
                (candidate) => candidate.result!.placements.length,
              );
              const bestCount =
                counts.length === 2 ? Math.max(...counts) : null;
              const tie = bestCount !== null && counts[0] === counts[1];
              return runs.map((run) => {
                const r = run.result;
                const total = r?.cargo.reduce((n, c) => n + c.quantity, 0) ?? 0;
                const count = r?.placements.length ?? 0;
                const percent = r
                  ? (r.placements.reduce((n, p) => n + volume(p.size), 0) /
                      volume(r.container.size)) *
                    100
                  : 0;
                const invalid = !!run.error || !r?.validation.valid;
                const label = run.id === "baseline" ? "装法一" : "装法二";
                const evaluation =
                  loadedCase && !dirty ? evaluateCase(loadedCase, run) : null;
                const recommended =
                  bestCount !== null && !tie && count === bestCount && !invalid;
                return (
                  <div
                    key={run.id}
                    className={`loading-option ${activeAlgorithm === run.id ? "is-selected" : ""} ${recommended ? "is-recommended" : ""}`}
                    data-testid={`algorithm-${run.id}`}
                  >
                    <div className="option-heading">
                      <h3>{label}</h3>
                      <div className="option-badges">
                        {recommended && (
                          <span className="recommended-badge">推荐</span>
                        )}
                        {activeAlgorithm === run.id && (
                          <span>下方正在显示</span>
                        )}
                      </div>
                    </div>
                    {r ? (
                      <>
                        <p className="option-count">
                          装入 <strong>{number(count, 0)}</strong> 箱
                          <span>共 {number(total, 0)} 箱</span>
                        </p>
                        <p className="option-remaining">
                          剩余 {number(total - count, 0)} 箱未装入 · 已用{" "}
                          {number(percent)}% 空间
                        </p>
                      </>
                    ) : (
                      <p>这次未能算出方案</p>
                    )}
                    {invalid ? (
                      <p className="failed">
                        此方案暂不可使用。请查看计算说明，调整货物后重试。
                      </p>
                    ) : evaluation ? (
                      <CaseOutcome evaluation={evaluation} />
                    ) : (
                      <p className="option-status">
                        符合当前尺寸、重量和摆放限制
                      </p>
                    )}
                    <button
                      className="button"
                      aria-pressed={activeAlgorithm === run.id}
                      aria-label={
                        recommended
                          ? `查看${label}推荐摆放图`
                          : `查看${label}摆放图`
                      }
                      disabled={busy || dirty || !r}
                      onClick={() => onSelectRun(run)}
                    >
                      {activeAlgorithm === run.id
                        ? "正在查看此装法"
                        : recommended
                          ? "查看推荐摆放图"
                          : "查看摆放图"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                );
              });
            })()}
          </div>
          <p className="selection-help">
            推荐依据是本次计算装入箱数较多；实际装柜前仍需结合纸箱承重、操作空间和现场条件确认。选中的装法会显示在下方，导出时也保存这份方案。
          </p>
        </div>
      ) : (
        <p className="comparison-empty">
          用左侧同一批货物尝试两种摆法，比较装入箱数，再查看摆放图。
        </p>
      )}
      <details className="calculation-details">
        <summary>计算说明与检查结果</summary>
        <p>
          两种装法都只把相同规格的纸箱上下叠放。已检查尺寸、重量和摆放限制，尚未计算纸箱抗压和实际搬运过程。
        </p>
        <p>
          装法一：原创平面切分方法。装法二：使用{" "}
          <a
            href="https://github.com/soimy/maxrects-packer"
            target="_blank"
            rel="noreferrer"
          >
            maxrects-packer 2.7.3（MIT）
          </a>{" "}
          排列柜底，再生成立体堆放方案。
        </p>
        {runs.map((run) => (
          <p key={run.id}>
            {run.id === "baseline" ? "装法一" : "装法二"}：本次计算{" "}
            {number(run.elapsedMs)} 毫秒（含检查）。
            {run.error || run.result?.validation.errors.join("；")}
          </p>
        ))}
      </details>
    </section>
  );
}
