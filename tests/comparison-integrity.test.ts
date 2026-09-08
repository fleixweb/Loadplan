import { afterEach, expect, it, vi } from "vitest";
import * as packing from "../src/domain/packing";
import { compareAlgorithms } from "../src/domain/comparison";
import { STANDARD_CASES } from "../src/domain/cases";

afterEach(() => vi.restoreAllMocks());

it("不能用更大货柜的合法结果冒充当前输入的比较结果", () => {
  const fixture = STANDARD_CASES[0];
  const changed = structuredClone(fixture.container);
  changed.size.x *= 2;
  const wrong = packing.pack(changed, fixture.cargo);
  expect(wrong.validation.valid).toBe(true);
  vi.spyOn(packing, "pack").mockReturnValue(wrong);
  const runs = compareAlgorithms(fixture.container, fixture.cargo);
  expect(runs[0].result?.validation.valid).toBe(false);
  expect(runs[0].error).toContain("快照不一致");
  expect(runs[1].error).toBeUndefined();
});
