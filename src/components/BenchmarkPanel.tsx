import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FlaskConical,
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
  pass: "符合预期",
  mismatch: "未达手算预期",
  invalid: "规则未通过",
  error: "运行失败",
  "rules-only": "仅规则校验",
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
      <small>{number(evaluation.elapsedMs)} ms</small>
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
    <section className="benchmark-panel" aria-label="标准案例与算法对比">
      <div className="benchmark-heading">
        <div>
          <FlaskConical size={18} />
          <h2>标准案例与算法对比</h2>
          <span>先看依据，再看结果</span>
        </div>
        <button
          className="button"
          disabled={busy || suiteBusy}
          onClick={onCompare}
        >
          <GitCompareArrows size={15} />
          比较当前货物
        </button>
      </div>
      <details className="case-library">
        <summary>
          <BookOpen size={15} />
          <span>标准案例库</span>
          <small>7 个手算案例 + 1 个混装样例</small>
          <ChevronDown size={15} />
        </summary>
        <div className="case-library-body">
          <div className="case-picker">
            <label htmlFor="standard-case">选择测试案例</label>
            <select
              id="standard-case"
              value={chosenId}
              onChange={(e) => setChosenId(e.target.value)}
            >
              {STANDARD_CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.expectedCount !== null
                    ? ` · 预期 ${c.expectedCount} 箱`
                    : " · 无最优预期"}
                </option>
              ))}
            </select>
            <button
              className="button"
              disabled={busy || suiteBusy}
              onClick={() => onLoadCase(chosen)}
            >
              加载并比较
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="case-explanation">
            <strong>{chosen.description}</strong>
            <p>{chosen.proof}</p>
            <small>
              教学案例使用简化测试空间；加载会替换当前输入。需要保留当前方案时，请先导出。
            </small>
          </div>
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
              {suiteBusy ? "正在检查标准案例…" : "运行全部标准案例"}
            </button>
            <span>独立检查固定案例，不修改当前货物。</span>
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
                  手算案例：{exactPassed} / {exact.length} 项算法结果符合预期
                </strong>
                <span>业务样例仅检查约束，不认证最优。</span>
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>案例</th>
                      <th>手算预期</th>
                      <th>原有切分法</th>
                      <th>开源 MaxRects 适配</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suite.map((entry) => (
                      <tr key={entry.caseId}>
                        <td>{entry.title}</td>
                        <td>
                          {entry.expectedCount === null
                            ? "不设最优答案"
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
        </div>
      </details>
      {runs.length > 0 ? (
        <div
          className={`algorithm-comparison ${dirty ? "comparison-stale" : ""}`}
        >
          <div className="comparison-caption">
            <span>
              {dirty
                ? "输入已修改，以下为上次比较，请重新比较后选择。"
                : loadedCase
                  ? `正在查看案例：${loadedCase.title}`
                  : "相同输入 · 相同堆垛与校验规则"}
            </span>
            <small>单次本机耗时，包含结果校验</small>
          </div>
          <div className="table-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>算法</th>
                  <th>装入 / 总数</th>
                  <th>空间利用率</th>
                  <th>耗时</th>
                  <th>校验与预期</th>
                  <th>查看</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const r = run.result;
                  const total =
                    r?.cargo.reduce((n, c) => n + c.quantity, 0) ?? 0;
                  const percent = r
                    ? (r.placements.reduce((n, p) => n + volume(p.size), 0) /
                        volume(r.container.size)) *
                      100
                    : 0;
                  const evaluation =
                    loadedCase && !dirty ? evaluateCase(loadedCase, run) : null;
                  const invalid = !!run.error || !r?.validation.valid;
                  return (
                    <tr
                      key={run.id}
                      className={
                        activeAlgorithm === run.id ? "selected-algorithm" : ""
                      }
                      data-testid={`algorithm-${run.id}`}
                    >
                      <td>
                        <strong>
                          {run.id === "baseline"
                            ? "原有切分法"
                            : "开源 MaxRects 适配"}
                        </strong>
                        <small>
                          {run.id === "baseline"
                            ? "原创堆垛 + 平面切分"
                            : "二维开源库 + 原创三维堆垛"}
                        </small>
                      </td>
                      <td>{r ? `${r.placements.length} / ${total}` : "—"}</td>
                      <td>{r ? `${number(percent)}%` : "—"}</td>
                      <td>{number(run.elapsedMs)} ms</td>
                      <td>
                        {evaluation ? (
                          <CaseOutcome evaluation={evaluation} />
                        ) : invalid ? (
                          <span className="failed">
                            {run.error || "规则未通过"}
                          </span>
                        ) : (
                          <span className="passed">约束通过</span>
                        )}
                        {r && !r.validation.valid && (
                          <span className="case-error">
                            {r.validation.errors.slice(0, 2).join("；")}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="button"
                          aria-pressed={activeAlgorithm === run.id}
                          aria-label={`查看${run.id === "baseline" ? "原有切分法" : "开源 MaxRects"}结果`}
                          disabled={busy || dirty || !r}
                          onClick={() => onSelectRun(run)}
                        >
                          {activeAlgorithm === run.id ? (
                            <>
                              <Check size={12} />
                              当前
                            </>
                          ) : (
                            "查看"
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="comparison-empty">
          点击「比较当前货物」，并排查看两种方法找到的方案，也可以先加载有手算答案的标准案例。
        </p>
      )}
      <p className="algorithm-provenance">
        开源来源：
        <a
          href="https://github.com/soimy/maxrects-packer"
          target="_blank"
          rel="noreferrer"
        >
          maxrects-packer 2.7.3 · MIT
        </a>
        。两种方法都只做同规格堆垛；MaxRects
        用于柜底二维排布，不是完整三维装柜求解器，不保证每次装得更多。
      </p>
    </section>
  );
}
