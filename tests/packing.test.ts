import { describe, expect, it } from "vitest";
import { pack, validateInput, validateResult } from "../src/domain/packing";
import type { Cargo, Container, PackingResult } from "../src/domain/types";

const container: Container = {
  id: "c",
  name: "测试柜",
  size: { x: 1000, y: 1000, z: 1000 },
  door: { width: 1000, height: 1000 },
  maxWeight: 100,
};
const cargo: Cargo = {
  id: "a",
  name: "测试箱",
  size: { x: 500, y: 500, z: 500 },
  quantity: 8,
  weight: 1,
  rotation: "upright",
  maxLayers: 10,
  color: "#aabbcc",
};
const solve = (c = container, a = cargo) =>
  pack(structuredClone(c), [structuredClone(a)]);
describe("保守装柜计算", () => {
  it("1000mm 立方柜恰好装 8 个 500mm 箱且完全支撑", () => {
    const r = solve();
    expect(r.placements).toHaveLength(8);
    expect(r.unpacked).toEqual([]);
    expect(validateResult(r).valid).toBe(true);
    expect(r.placements.filter((p) => p.layer === 2)).toHaveLength(4);
  });
  it("遵守总载重和最大层数", () => {
    expect(solve({ ...container, maxWeight: 3 }).placements).toHaveLength(3);
    expect(
      solve(container, { ...cargo, maxLayers: 1 }).placements,
    ).toHaveLength(4);
  });
  it("允许平面旋转，自由旋转才可换高度轴", () => {
    const c = {
      ...container,
      size: { x: 1000, y: 500, z: 500 },
      door: { width: 500, height: 500 },
    };
    const a = { ...cargo, size: { x: 500, y: 500, z: 1000 }, quantity: 1 };
    expect(solve(c, a).placements).toHaveLength(0);
    expect(solve(c, { ...a, rotation: "free" }).placements).toHaveLength(1);
    expect(
      solve(c, { ...a, size: { x: 500, y: 1000, z: 500 } }).placements,
    ).toHaveLength(1);
  });
  it("门宽高限制、无法放入和剩余数量可核对", () => {
    const r = solve({ ...container, door: { width: 400, height: 1000 } });
    expect(r.placements).toHaveLength(0);
    expect(r.unpacked[0].quantity).toBe(8);
    expect(r.validation.valid).toBe(true);
    const full = solve(container, { ...cargo, quantity: 10 });
    expect(full.unpacked[0].quantity).toBe(2);
  });
  it("空清单有效且不修改输入", () => {
    const snapshot = structuredClone(cargo);
    solve();
    expect(cargo).toEqual(snapshot);
    expect(pack(container, []).validation.valid).toBe(true);
    expect(solve(container, { ...cargo, quantity: 0 }).placements).toEqual([]);
  });
  it("混合小数尺寸和重量在多种输入下均通过独立几何检查", () => {
    let seed = 82741;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 25; n++) {
      const items: Cargo[] = Array.from({ length: 6 }, (_, i) => ({
        ...cargo,
        id: `sku${i}`,
        quantity: 10 + Math.floor(random() * 30),
        size: {
          x: 50.1 + random() * 400,
          y: 70.3 + random() * 300,
          z: 60.7 + random() * 400,
        },
        weight: 0.1 + random() * 4,
        maxLayers: 1 + Math.floor(random() * 8),
        rotation: random() > 0.5 ? "free" : "upright",
      }));
      const r = pack({ ...container, maxWeight: 100 + random() * 100 }, items);
      expect(validateResult(r)).toEqual({ valid: true, errors: [] });
    }
  });
  it("混装 1500 箱结果有效且数量守恒", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      ...cargo,
      id: `sku${i}`,
      quantity: 100,
      size: { x: 100 + i * 2, y: 100, z: 100 },
    }));
    const r = pack({ ...container, maxWeight: 2000 }, items);
    expect(
      r.placements.length + r.unpacked.reduce((n, p) => n + p.quantity, 0),
    ).toBe(1500);
    expect(r.validation).toEqual({ valid: true, errors: [] });
  });
});

describe("输入与独立结果校验", () => {
  it.each([NaN, Infinity, -1, 0])("拒绝非法数值 %s", (value) => {
    expect(
      validateInput(container, [{ ...cargo, weight: value }]).length,
    ).toBeGreaterThan(0);
    expect(() =>
      solve(container, { ...cargo, size: { ...cargo.size, x: value } }),
    ).toThrow();
  });
  it("拒绝无效 JSON 结构、重复 ID、数量/层数和颜色", () => {
    for (const value of [
      null,
      {},
      [null],
      [{ ...cargo, quantity: 1.2 }],
      [{ ...cargo, quantity: 1501 }],
      [{ ...cargo, maxLayers: 0 }],
      [{ ...cargo, color: "red" }],
      [cargo, cargo],
    ]) {
      expect(validateInput(container, value as Cargo[]).length).toBeGreaterThan(
        0,
      );
    }
    expect(
      validateInput(null as unknown as Container, [cargo]).length,
    ).toBeGreaterThan(0);
    expect(
      validateInput({ ...container, door: { width: 1001, height: 1000 } }, [
        cargo,
      ]).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    (r: PackingResult) => {
      r.placements[0].position.x = -1;
    },
    (r: PackingResult) => {
      r.placements[1].position = { ...r.placements[0].position };
    },
    (r: PackingResult) => {
      r.placements[1].position.z += 10;
    },
    (r: PackingResult) => {
      r.placements[1].position.x += 1;
    },
    (r: PackingResult) => {
      r.placements[0].size.z = 300;
    },
    (r: PackingResult) => {
      r.placements[0].weight = 0;
    },
    (r: PackingResult) => {
      r.placements[0].cargoId = "missing";
    },
    (r: PackingResult) => {
      r.placements[0].containerId = "missing";
    },
    (r: PackingResult) => {
      r.placements[1].boxId = r.placements[0].boxId;
    },
    (r: PackingResult) => {
      r.placements[1].layer = 3;
    },
    (r: PackingResult) => {
      r.placements[1].stackId = "other";
    },
    (r: PackingResult) => {
      r.cargo[0].maxLayers = 1;
    },
    (r: PackingResult) => {
      r.placements[0].position.x = NaN;
    },
    (r: PackingResult) => {
      r.container.maxWeight = 1;
    },
    (r: PackingResult) => {
      r.unpacked = [{ cargoId: "a", quantity: 1, reason: "假的" }];
    },
    (r: PackingResult) => {
      r.placements.pop();
    },
  ])("检测篡改结果 %#", (mutate) => {
    const r = solve();
    mutate(r);
    expect(validateResult(r).valid).toBe(false);
  });
  it("结果结构非法时返回报告，不抛异常", () => {
    for (const r of [null, {}, { ...solve(), placements: [null] }])
      expect(validateResult(r as PackingResult).valid).toBe(false);
  });
});
