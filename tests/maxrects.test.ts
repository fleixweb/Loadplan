import { afterEach, describe, expect, it, vi } from "vitest";
import { packMaxRects } from "../src/domain/maxrects";
import { compareAlgorithms } from "../src/domain/comparison";
import * as packing from "../src/domain/packing";
import * as maxrects from "../src/domain/maxrects";
import type { Cargo, Container } from "../src/domain/types";

const container: Container = {
  id: "c",
  name: "柜",
  size: { x: 1000, y: 1000, z: 1000 },
  door: { width: 1000, height: 1000 },
  maxWeight: 100,
};
const cargo: Cargo = {
  id: "a",
  name: "箱",
  size: { x: 500, y: 500, z: 500 },
  quantity: 8,
  weight: 1,
  rotation: "upright",
  maxLayers: 10,
  color: "#aabbcc",
};
const solve = (c = container, a = cargo) => packMaxRects(c, [a]);

describe("MaxRects 单柜完整支撑适配", () => {
  it("300.9mm 柜底精确排列 9 个 100.3mm 箱，不被浮点减法少装", () => {
    const c = {
      ...container,
      size: { x: 300.9, y: 300.9, z: 100.3 },
      door: { width: 300.9, height: 100.3 },
    };
    const a = {
      ...cargo,
      size: { x: 100.3, y: 100.3, z: 100.3 },
      quantity: 9,
      maxLayers: 1,
    };
    const r = solve(c, a);
    expect(r.placements).toHaveLength(9);
    expect(
      r.placements.every((p) => p.size.x === 100.3 && p.size.y === 100.3),
    ).toBe(true);
    expect(packing.validateResult(r)).toEqual({ valid: true, errors: [] });
  });
  it.each([1e-9, 1e12, 1e90])(
    "缩放尺寸 %s 后精确装 9 箱，且保留原始尺寸",
    (unit) => {
      const c = {
        ...container,
        size: { x: 3 * unit, y: 3 * unit, z: unit },
        door: { width: 3 * unit, height: unit },
      };
      const a = {
        ...cargo,
        size: { x: unit, y: unit, z: unit },
        quantity: 9,
        maxLayers: 1,
      };
      const r = solve(c, a);
      expect(r.placements).toHaveLength(9);
      expect(r.placements[0].size).toEqual(a.size);
      expect(packing.validateResult(r)).toEqual({ valid: true, errors: [] });
    },
  );
  it("非网格尺寸向外预留空间，不缩小箱底以伪造容量", () => {
    const c = {
      ...container,
      size: { x: 300, y: 300, z: 100 },
      door: { width: 300, height: 100 },
    };
    const a = {
      ...cargo,
      size: { x: 100.00000001, y: 100.00000001, z: 100 },
      quantity: 9,
      maxLayers: 1,
    };
    const r = solve(c, a);
    expect(r.placements).toHaveLength(4);
    expect(
      r.placements.every((p) => p.size.x === a.size.x && p.size.y === a.size.y),
    ).toBe(true);
    expect(packing.validateResult(r)).toEqual({ valid: true, errors: [] });
  });
  it("超出整数网格动态范围时明确报错，不能返回虚构有效方案", () => {
    const c = {
      ...container,
      size: { x: 1e20, y: 1e-20, z: 1 },
      door: { width: 1e-20, height: 1 },
    };
    const a = {
      ...cargo,
      size: { x: 1e20, y: 1e-20, z: 1 },
      quantity: 1,
      maxLayers: 1,
    };
    expect(packing.validateInput(c, [a])).toEqual([]);
    expect(() => solve(c, a)).toThrow(/精度范围/);
  });
  it("手算立方柜 8 箱、每垛两层", () => {
    const r = solve();
    expect(r.placements).toHaveLength(8);
    expect(r.placements.filter((p) => p.layer === 2)).toHaveLength(4);
    expect(r.unpacked).toEqual([]);
    expect(packing.validateResult(r)).toEqual({ valid: true, errors: [] });
  });
  it("最大一层只装 4 箱，载重 3kg 只装 3 箱", () => {
    expect(
      solve(container, { ...cargo, maxLayers: 1 }).placements,
    ).toHaveLength(4);
    expect(solve({ ...container, maxWeight: 3 }).placements).toHaveLength(3);
  });
  it("只有允许换高度轴时才可侧放，允许直立平面旋转", () => {
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
  it("不以库自动旋转绕过柜门检查", () => {
    expect(
      solve({ ...container, door: { width: 400, height: 1000 } }).placements,
    ).toHaveLength(0);
    const r = solve(
      { ...container, door: { width: 400, height: 500 } },
      { ...cargo, size: { x: 600, y: 300, z: 500 } },
    );
    expect(r.placements.every((p) => p.size.y <= 400)).toBe(true);
    expect(packing.validateResult(r).valid).toBe(true);
  });
  it("两种货物占满柜底两半，共 6 箱", () => {
    const r = packMaxRects(container, [
      { ...cargo, quantity: 4 },
      { ...cargo, id: "b", size: { x: 1000, y: 500, z: 500 }, quantity: 2 },
    ]);
    expect(r.placements).toHaveLength(6);
    expect(packing.validateResult(r).valid).toBe(true);
  });
  it("不修改输入，结果快照独立且计算确定", () => {
    const c = structuredClone(container),
      a = structuredClone(cargo);
    const before = structuredClone({ c, a });
    const r = solve(c, a);
    expect(solve(c, a)).toEqual(r);
    expect({ c, a }).toEqual(before);
    a.size.x = 10;
    c.size.x = 10;
    expect(r.cargo[0].size.x).toBe(500);
    expect(r.container.size.x).toBe(1000);
    expect(packMaxRects(container, []).validation.valid).toBe(true);
    expect(solve(container, { ...cargo, quantity: 0 }).placements).toEqual([]);
  });
  it("拒绝非法输入", () => {
    expect(() => solve(container, { ...cargo, weight: NaN })).toThrow();
    expect(() => packMaxRects(container, [cargo, cargo])).toThrow();
  });
  it("随机混合小数尺寸、层数和重量保持独立几何与数量校验", () => {
    let seed = 82741;
    const random = () =>
      (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
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
      expect(
        packing.validateResult(
          packMaxRects(
            { ...container, maxWeight: 100 + random() * 100 },
            items,
          ),
        ),
      ).toEqual({ valid: true, errors: [] });
    }
  });
  it("1500 箱输入在界面预算内完成，不能漏账或自动创建额外货柜", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      ...cargo,
      id: `sku${i}`,
      quantity: 100,
      size: { x: 100 + i * 2, y: 100, z: 100 },
    }));
    const start = performance.now();
    const r = packMaxRects({ ...container, maxWeight: 2000 }, items);
    expect(performance.now() - start).toBeLessThan(15000);
    expect(
      r.placements.length + r.unpacked.reduce((n, p) => n + p.quantity, 0),
    ).toBe(1500);
    expect(packing.validateResult(r)).toEqual({ valid: true, errors: [] });
  });
});

describe("算法比较隔离", () => {
  afterEach(() => vi.restoreAllMocks());
  it("相同输入、两份独立结果与独立耗时", () => {
    const before = structuredClone({ container, cargo });
    const runs = compareAlgorithms(container, [cargo]);
    expect(runs.map((r) => r.id)).toEqual(["baseline", "maxrects"]);
    for (const run of runs) {
      expect(run.result?.placements).toHaveLength(8);
      expect(run.result?.validation.valid).toBe(true);
      expect(run.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(run.error).toBeUndefined();
    }
    expect({ container, cargo }).toEqual(before);
    expect(runs[0].result?.cargo).not.toBe(runs[1].result?.cargo);
  });
  it("一种算法异常不影响另一种输入快照或计算", () => {
    vi.spyOn(packing, "pack").mockImplementation((c, a) => {
      c.size.x = 1;
      a[0].quantity = 0;
      throw new Error("故障注入");
    });
    const runs = compareAlgorithms(container, [cargo]);
    expect(runs[0].result).toBeNull();
    expect(runs[0].error).toContain("故障注入");
    expect(runs[1].result?.placements).toHaveLength(8);
    expect(container.size.x).toBe(1000);
  });
  it("重新校验伪造的 valid=true，保留失败结果供诊断", () => {
    const corrupted = solve();
    corrupted.placements[0].position.x = -1;
    vi.spyOn(maxrects, "packMaxRects").mockReturnValue(corrupted);
    const run = compareAlgorithms(container, [cargo])[1];
    expect(run.result?.validation.valid).toBe(false);
    expect(run.error).toBeTruthy();
    expect(run.result?.placements[0].position.x).toBe(-1);
  });
});
