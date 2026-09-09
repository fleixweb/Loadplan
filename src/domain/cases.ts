/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import {
  compareAlgorithms,
  type AlgorithmId,
  type ComparisonRun,
} from "./comparison";
import { validateResult } from "./packing";
import { cloneSample } from "./sample";
import type { Cargo, Container } from "./types";

export interface StandardCase {
  id: string;
  title: string;
  description: string;
  proof: string;
  container: Container;
  cargo: Cargo[];
  expectedCount: number | null;
}

const cube: Container = {
  id: "TEST-1M",
  name: "1 m³ 教学测试空间",
  size: { x: 1000, y: 1000, z: 1000 },
  door: { width: 1000, height: 1000 },
  maxWeight: 100,
};
const box: Cargo = {
  id: "A",
  name: "500 mm 标准箱",
  size: { x: 500, y: 500, z: 500 },
  quantity: 10,
  weight: 1,
  rotation: "upright",
  maxLayers: 2,
  color: "#cb975b",
};
const low: Container = {
  ...cube,
  id: "TEST-LOW",
  name: "低高度教学测试空间",
  size: { x: 1000, y: 500, z: 500 },
  door: { width: 500, height: 500 },
};
const tall: Cargo = {
  ...box,
  name: "必须换轴才能装入的高箱",
  size: { x: 500, y: 500, z: 1000 },
  quantity: 1,
};
const sample = cloneSample();

export const STANDARD_CASES: StandardCase[] = [
  {
    id: "regular",
    title: "整齐排列",
    description: "1 m³ 空间，10 个边长 500 mm 的纸箱。",
    proof:
      "每个方向恰好放 2 箱，2 × 2 × 2 = 8。单箱体积为 0.125 m³，空间体积上限也是 8 箱，因此 8 箱既可实现也是最优。",
    container: structuredClone(cube),
    cargo: [structuredClone(box)],
    expectedCount: 8,
  },
  {
    id: "layers",
    title: "限制堆叠",
    description: "同样的空间和纸箱，但每垛最多 1 层。",
    proof:
      "最多 1 层时只能放在地面；柜底 1 m²，单箱底面 0.25 m²，2 × 2 = 4 箱可整齐摆满，其他箱子不能继续往上叠。",
    container: structuredClone(cube),
    cargo: [{ ...structuredClone(box), maxLayers: 1 }],
    expectedCount: 4,
  },
  {
    id: "weight",
    title: "载重限制",
    description: "每箱 1 kg，空间足够，但总载重仅 3 kg。",
    proof:
      "虽然按尺寸能装 8 箱，但 3 kg ÷ 1 kg/箱 = 3 箱。3 箱可以放在地面，不违反支撑和层数规则，因此本例上限由重量决定。",
    container: { ...structuredClone(cube), maxWeight: 3 },
    cargo: [structuredClone(box)],
    expectedCount: 3,
  },
  {
    id: "upright",
    title: "必须直立",
    description: "箱高 1000 mm，测试空间高 500 mm，禁止侧放。",
    proof:
      "保持直立时，水平旋转不会改变 1000 mm 的箱高。箱高大于 500 mm 的可用空间高度，无论水平如何排列都装不进，所以应为 0 箱。",
    container: structuredClone(low),
    cargo: [structuredClone(tall)],
    expectedCount: 0,
  },
  {
    id: "rotation",
    title: "允许侧放",
    description: "与上例相同，改为允许侧放及倒置。",
    proof:
      "允许换轴后可把纸箱摆成 1000 × 500 × 500 mm，恰好填满测试空间。输入仅 1 箱，门宽高也允许通过，因此应装入 1 箱。",
    container: structuredClone(low),
    cargo: [{ ...structuredClone(tall), rotation: "free" }],
    expectedCount: 1,
  },
  {
    id: "door",
    title: "柜门限制",
    description: "箱体为 500 mm 立方体，柜门宽只有 400 mm。",
    proof:
      "虽然柜内空间足够，但纸箱任意允许朝向的宽都是 500 mm，超过 400 mm 门宽。本例使用正交摆放，不考虑倾斜穿门，所以应为 0 箱。",
    container: { ...structuredClone(cube), door: { width: 400, height: 1000 } },
    cargo: [structuredClone(box)],
    expectedCount: 0,
  },
  {
    id: "mixed",
    title: "两种规格混装",
    description: "2 个长箱与 4 个立方箱，分成两组同规格堆垛。",
    proof:
      "长箱 1000 × 500 × 500 mm 叠 2 层占一半空间；另外一半放 2 垛 500 mm 立方箱，每垛 2 层。共 2 + 4 = 6 箱，正好装下全部输入。",
    container: structuredClone(cube),
    cargo: [
      {
        ...structuredClone(box),
        name: "长方箱",
        size: { x: 1000, y: 500, z: 500 },
        quantity: 2,
      },
      {
        ...structuredClone(box),
        id: "B",
        name: "立方箱",
        quantity: 4,
        color: "#6d9990",
      },
    ],
    expectedCount: 6,
  },
  {
    id: "business",
    title: "450 箱混装样例",
    description: "A / B / C 三种规格，比较当前方案，不假设最优数量。",
    proof:
      "这是虚构的外贸混装样例，没有已证明的最优排列或真实装柜记录。可以核对数量、重叠和约束并比较方案，但不能把装入数量更高直接称为全局最优。",
    container: sample.container,
    cargo: sample.cargo,
    expectedCount: null,
  },
];

export type CaseStatus =
  | "pass"
  | "mismatch"
  | "invalid"
  | "error"
  | "rules-only";
export interface CaseEvaluation {
  algorithmId: AlgorithmId;
  status: CaseStatus;
  count: number | null;
  elapsedMs: number;
  errors: string[];
}
export interface SuiteEntry {
  caseId: string;
  title: string;
  expectedCount: number | null;
  runs: CaseEvaluation[];
}

export function evaluateCase(
  fixture: StandardCase,
  run: ComparisonRun,
): CaseEvaluation {
  const base = { algorithmId: run.id, elapsedMs: run.elapsedMs };
  if (!run.result)
    return {
      ...base,
      status: "error",
      count: null,
      errors: [run.error || "算法没有返回结果。"],
    };
  if (
    JSON.stringify({ container: fixture.container, cargo: fixture.cargo }) !==
    JSON.stringify({ container: run.result.container, cargo: run.result.cargo })
  ) {
    return {
      ...base,
      status: "invalid",
      count: null,
      errors: ["结果输入与标准案例不一致，不能用于该案例验收。"],
    };
  }
  const check = validateResult(run.result);
  const count = run.result.placements.length;
  if (!check.valid)
    return { ...base, status: "invalid", count, errors: check.errors };
  if (run.error)
    return { ...base, status: "error", count, errors: [run.error] };
  if (fixture.expectedCount === null)
    return { ...base, status: "rules-only", count, errors: [] };
  return {
    ...base,
    status: count === fixture.expectedCount ? "pass" : "mismatch",
    count,
    errors:
      count === fixture.expectedCount
        ? []
        : [`手算预期 ${fixture.expectedCount} 箱，当前方法得到 ${count} 箱。`],
  };
}

export function runCaseSuite(): SuiteEntry[] {
  return STANDARD_CASES.map((fixture) => ({
    caseId: fixture.id,
    title: fixture.title,
    expectedCount: fixture.expectedCount,
    runs: compareAlgorithms(fixture.container, fixture.cargo).map((run) =>
      evaluateCase(fixture, run),
    ),
  }));
}
