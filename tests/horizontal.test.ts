import { describe, expect, it } from "vitest";
import { pack, validateInput, validateResult } from "../src/domain/packing";
import { packMaxRects } from "../src/domain/maxrects";
import type { Cargo, Container } from "../src/domain/types";
import { CONTAINERS } from "../src/domain/sample";
const c: Container = {
  id: "c",
  name: "柜",
  size: { x: 2000, y: 1000, z: 1000 },
  door: { width: 1000, height: 1000 },
  maxWeight: 1000,
};
const a: Cargo = {
  id: "a",
  name: "卷材",
  shape: "cylinder-x",
  size: { x: 1800, y: 500, z: 500 },
  cylinderDiameter: 400,
  cylinderLength: 1600,
  quantity: 4,
  weight: 10,
  maxLayers: 4,
  rotation: "upright",
  color: "#aabbcc",
};
describe.each([pack, packMaxRects])("横放圆柱 %s", (solve) => {
  describe.each(["cylinder-x", "cylinder-y"] as const)("%s", (shape) => {
    const container =
      shape === "cylinder-x"
        ? c
        : {
            ...c,
            size: { x: 1000, y: 2000, z: 1000 },
            door: { width: 2000, height: 1000 },
          };
    const cargo: Cargo = {
      ...a,
      shape,
      size: shape === "cylinder-x" ? a.size : { x: 500, y: 1800, z: 500 },
    };

    it("未明确允许叠放时只放地面", () => {
      for (const stackable of [undefined, false]) {
        const r = solve(container, [{ ...cargo, stackable }]);
        expect(r.placements).toHaveLength(2);
        expect(
          r.placements.every((p) => p.position.z === 0 && p.layer === 1),
        ).toBe(true);
        expect(r.validation.valid).toBe(true);
      }
    });

    it("允许叠放后按含支架占位上下对齐，受柜高限制", () => {
      const r = solve(container, [{ ...cargo, stackable: true, quantity: 6 }]);
      expect(r.placements).toHaveLength(4);
      expect(r.unpacked[0].quantity).toBe(2);
      expect(r.placements.filter((p) => p.layer === 2)).toHaveLength(2);
      for (const p of r.placements) {
        expect(p.size).toEqual(cargo.size);
        expect(p.position.z).toBe((p.layer - 1) * 500);
        const base = r.placements.find(
          (b) => b.stackId === p.stackId && b.layer === 1,
        )!;
        expect(p.position.x).toBe(base.position.x);
        expect(p.position.y).toBe(base.position.y);
      }
      expect(validateResult(r).valid).toBe(true);
    });

    it("底层、层数、每垛重量和总载重限制仍生效", () => {
      for (const rules of [
        { bottomOnly: true },
        { maxLayers: 1 },
        { maxStackWeight: 15 },
      ]) {
        const r = solve(container, [{ ...cargo, stackable: true, ...rules }]);
        expect(r.placements).toHaveLength(2);
        expect(r.placements.every((p) => p.layer === 1)).toBe(true);
        expect(r.validation.valid).toBe(true);
      }
      const r = solve({ ...container, maxWeight: 30 }, [
        { ...cargo, stackable: true },
      ]);
      expect(r.placements).toHaveLength(3);
      expect(r.validation.valid).toBe(true);
    });

    it("独立校验拒绝绕过叠放规则、错位及悬空", () => {
      const r = solve(container, [{ ...cargo, stackable: true }]);
      for (const rules of [
        { stackable: undefined },
        { stackable: false },
        { bottomOnly: true },
        { maxLayers: 1 },
        { maxStackWeight: 15 },
      ]) {
        const changed = structuredClone(r);
        Object.assign(changed.cargo[0], rules);
        expect(validateResult(changed).valid).toBe(false);
      }
      for (const axis of ["x", "z"] as const) {
        const changed = structuredClone(r);
        changed.placements.find((p) => p.layer === 2)!.position[axis] += 1;
        expect(validateResult(changed).valid).toBe(false);
      }
    });
  });

  it("横放轴线固定，不为装入自动旋转", () => {
    expect(
      solve(c, [
        {
          ...a,
          shape: "cylinder-y",
          size: { x: 500, y: 1800, z: 500 },
          stackable: true,
        },
      ]).placements,
    ).toHaveLength(0);
  });

  it("截图中的 40GP 长圆柱默认装 9 根，允许叠放后装 81 根", () => {
    const container = CONTAINERS.find((preset) => preset.id === "40GP")!;
    const cargo: Cargo = {
      ...a,
      size: { x: 11800, y: 250, z: 250 },
      cylinderDiameter: 250,
      cylinderLength: 11800,
      quantity: 100,
      weight: 15,
      maxLayers: 20,
    };
    expect(solve(container, [cargo]).placements).toHaveLength(9);
    const r = solve(container, [{ ...cargo, stackable: true }]);
    expect(r.placements).toHaveLength(81);
    expect(Math.max(...r.placements.map((p) => p.layer))).toBe(9);
    expect(r.unpacked[0].quantity).toBe(19);
    expect(r.validation.valid).toBe(true);
  });
});
it("拒绝超过支架占位的圆柱和缺失尺寸", () => {
  expect(validateInput(c, [{ ...a, cylinderDiameter: 600 }]).join()).toContain(
    "占位",
  );
  expect(
    validateInput(c, [{ ...a, cylinderLength: undefined }]).join(),
  ).toContain("轴向");
});
it.each(["wood-box", "wood-frame"] as const)(
  "木包装沿用整体占位 %s",
  (shape) => {
    expect(pack(c, [{ ...a, shape }]).validation.valid).toBe(true);
    expect(packMaxRects(c, [{ ...a, shape }]).validation.valid).toBe(true);
  },
);
