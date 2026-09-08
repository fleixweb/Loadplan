import { pack, validateResult } from "./packing";
import { packMaxRects } from "./maxrects";
import type { Cargo, Container, PackingResult } from "./types";

export type AlgorithmId = "baseline" | "maxrects";
export interface ComparisonRun {
  id: AlgorithmId;
  label: string;
  elapsedMs: number;
  result: PackingResult | null;
  error?: string;
}

export function compareAlgorithms(
  container: Container,
  cargo: Cargo[],
): ComparisonRun[] {
  const algorithms = [
    { id: "baseline" as const, label: "原有平面切分启发式", calculate: pack },
    {
      id: "maxrects" as const,
      label: "MaxRects 开源二维适配",
      calculate: packMaxRects,
    },
  ];
  // Freeze the logical input for the comparison; each calculator receives its own copy.
  let snapshot: { container: Container; cargo: Cargo[] };
  try {
    snapshot = structuredClone({ container, cargo });
  } catch (error) {
    return algorithms.map(({ id, label }) => ({
      id,
      label,
      result: null,
      elapsedMs: 0,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return algorithms.map(({ id, label, calculate }) => {
    const start = performance.now();
    let result: PackingResult | null = null;
    let error: string | undefined;
    try {
      const input = structuredClone(snapshot);
      result = calculate(input.container, input.cargo);
      result.validation = validateResult(result);
      if (
        JSON.stringify({ container: result.container, cargo: result.cargo }) !==
        JSON.stringify(snapshot)
      ) {
        result.validation = {
          valid: false,
          errors: [
            ...result.validation.errors,
            "算法返回的输入与比较快照不一致",
          ],
        };
      }
      if (!result.validation.valid)
        error = "独立结果校验未通过：" + result.validation.errors.join("；");
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    return {
      id,
      label,
      elapsedMs: performance.now() - start,
      result,
      ...(error ? { error } : {}),
    };
  });
}
