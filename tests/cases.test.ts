import { describe, expect, it } from "vitest";
import {
  STANDARD_CASES,
  evaluateCase,
  runCaseSuite,
} from "../src/domain/cases";
import { pack } from "../src/domain/packing";
import type { ComparisonRun } from "../src/domain/comparison";

describe("公开标准案例与手算预期", () => {
  it("案例包含七个独立手算答案和一个不假定最优的业务样例", () => {
    expect(STANDARD_CASES.map((c) => c.expectedCount)).toEqual([
      8,
      4,
      3,
      0,
      1,
      0,
      6,
      null,
    ]);
    expect(new Set(STANDARD_CASES.map((c) => c.id)).size).toBe(
      STANDARD_CASES.length,
    );
    for (const c of STANDARD_CASES) {
      expect(c.proof.length).toBeGreaterThan(25);
      const result = pack(c.container, c.cargo);
      expect(result.validation.valid).toBe(true);
      if (c.expectedCount !== null)
        expect(result.placements.length).toBe(c.expectedCount);
    }
  });
  it("规则通过但数量低于手算答案不能标为通过", () => {
    const fixture = STANDARD_CASES[0];
    const result = pack(fixture.container, fixture.cargo);
    result.placements.pop();
    result.unpacked = [
      { cargoId: fixture.cargo[0].id, quantity: 3, reason: "test" },
    ];
    const run: ComparisonRun = {
      id: "baseline",
      label: "test",
      elapsedMs: 0,
      result,
    };
    const evaluation = evaluateCase(fixture, run);
    expect(evaluation.status).toBe("mismatch");
    expect(evaluation.count).toBe(7);
  });
  it("未完成运行和伪造 validation 标记不会被算作通过", () => {
    const fixture = STANDARD_CASES[0];
    expect(
      evaluateCase(fixture, {
        id: "maxrects",
        label: "test",
        elapsedMs: 0,
        result: null,
        error: "failed",
      }).status,
    ).toBe("error");
    const result = pack(fixture.container, fixture.cargo);
    result.placements[0].position.x = -1;
    expect(
      evaluateCase(fixture, {
        id: "baseline",
        label: "test",
        elapsedMs: 0,
        result,
      }).status,
    ).toBe("invalid");
  });
  it("另一组输入即使数量相同，也不能冒充标准案例通过", () => {
    const fixture = STANDARD_CASES[0];
    const result = pack({ ...fixture.container, maxWeight: 99 }, fixture.cargo);
    expect(
      evaluateCase(fixture, {
        id: "baseline",
        label: "test",
        elapsedMs: 0,
        result,
      }).status,
    ).toBe("invalid");
  });
  it("整套运行保留双算法、预期和实际，不把业务样例当作最优认证", () => {
    const entries = runCaseSuite();
    expect(entries).toHaveLength(8);
    for (const e of entries) {
      expect(e.runs).toHaveLength(2);
      for (const r of e.runs) {
        expect(r.status).toBe(e.expectedCount === null ? "rules-only" : "pass");
        expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
