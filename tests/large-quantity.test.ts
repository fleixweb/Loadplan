import { describe, expect, it } from "vitest";
import { pack, validateInput, validateResult } from "../src/domain/packing";
import { packMaxRects } from "../src/domain/maxrects";
import { packFleet } from "../src/domain/fleet";
import {
  collectImport,
  defaultImportOptions,
  guessMapping,
  previewImport,
} from "../src/domain/excelImport";
import type { Cargo, Container } from "../src/domain/types";

const container: Container = {
  id: "c",
  name: "测试柜",
  size: { x: 20, y: 20, z: 5 },
  door: { width: 20, height: 5 },
  maxWeight: 10000,
};
const cargo: Cargo = {
  id: "a",
  name: "小件货物",
  size: { x: 1, y: 1, z: 1 },
  quantity: 2001,
  weight: 1,
  rotation: "upright",
  maxLayers: 5,
  color: "#aabbcc",
};

it("在单柜计算时限内求解并校验 30000 件可装入货物", () => {
  const start = performance.now();
  const result = pack(
    {
      ...container,
      size: { x: 1000, y: 1000, z: 1000 },
      door: { width: 1000, height: 1000 },
    },
    [
      {
        ...cargo,
        size: { x: 20, y: 20, z: 50 },
        quantity: 30_000,
        maxLayers: 20,
        weight: 0.1,
      },
    ],
  );
  expect(performance.now() - start).toBeLessThan(15_000);
  expect(result.placements).toHaveLength(30_000);
  expect(result.unpacked).toEqual([]);
  expect(result.validation).toEqual({ valid: true, errors: [] });

  // A full stack moved onto another remains internally supported but must collide.
  const first = result.placements[0];
  const other = result.placements.find((p) => p.stackId !== first.stackId)!;
  for (const p of result.placements) {
    if (p.stackId !== other.stackId) continue;
    p.position.x = first.position.x;
    p.position.y = first.position.y;
  }
  expect(validateResult(result).errors.join(" ")).toContain("重叠");
}, 20_000);

describe.each(["baseline", "maxrects"] as const)("大批量 %s", (algorithm) => {
  const solve = algorithm === "baseline" ? pack : packMaxRects;
  it("单柜实际装入超过1500件，超出容量正确记入剩余清单", () => {
    const result = solve(container, [cargo]);
    expect(result.placements).toHaveLength(2000);
    expect(result.unpacked[0].quantity).toBe(1);
    expect(validateResult(result)).toEqual({ valid: true, errors: [] });
  });
  it("大订单只生成实际装入件，不按订单数量展开空模型", () => {
    const result = solve({ ...container, maxWeight: 2 }, [
      { ...cargo, quantity: 1_000_000 },
    ]);
    expect(result.placements).toHaveLength(2);
    expect(result.unpacked[0].quantity).toBe(999998);
    expect(result.validation.valid).toBe(true);
  });
  it("层数也不应被旧数量上限截断", () => {
    const result = solve(
      {
        ...container,
        size: { x: 1, y: 1, z: 2000 },
        door: { width: 1, height: 2000 },
      },
      [{ ...cargo, maxLayers: 2000 }],
    );
    expect(result.placements).toHaveLength(2000);
    expect(result.placements.at(-1)!.layer).toBe(2000);
    expect(result.validation.valid).toBe(true);
  });
  it.each(["fixed", "auto"] as const)(
    "%s 多柜分配4001件保持总量守恒",
    (mode) => {
      const result = packFleet(
        {
          mode,
          containers:
            mode === "fixed" ? [container, container, container] : [container],
          maxContainers: 3,
          algorithm,
        },
        [{ ...cargo, quantity: 4001 }],
      );
      expect(result.results.map((r) => r.placements.length)).toEqual([
        2000, 2000, 1,
      ]);
      expect(result.unpacked).toEqual([]);
      expect(result.status).toBe("complete");
      expect(result.validation.valid).toBe(true);
    },
  );
});

it("Excel合并大数量行不再受1500件限制，并校验精度溢出", () => {
  const makeRows = (quantity: number) => {
    const sheet = {
      name: "清单",
      rows: [
        ["型号", "长", "宽", "高", "数量", "毛重"],
        ["A", "1", "1", "1", String(quantity), "1"],
        ["A", "1", "1", "1", String(quantity), "1"],
      ],
    };
    return previewImport(sheet, {
      ...defaultImportOptions(),
      mapping: guessMapping(sheet.rows[0]),
    });
  };
  expect(collectImport(makeRows(2000), true)[0].quantity).toBe(4000);
  expect(() => collectImport(makeRows(Number.MAX_SAFE_INTEGER), true)).toThrow(
    "整数范围",
  );
});

it("混装总数量不能超出精确整数范围，单规格大整数可正常保存", () => {
  expect(
    validateInput(container, [{ ...cargo, quantity: Number.MAX_SAFE_INTEGER }]),
  ).toEqual([]);
  expect(
    validateInput(container, [
      { ...cargo, quantity: Number.MAX_SAFE_INTEGER },
      { ...cargo, id: "b", quantity: 1 },
    ]).join(),
  ).toContain("整数范围");
});
