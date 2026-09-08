import { expect, it } from "vitest";
import { pack, validateInput, validateResult } from "../src/domain/packing";
import { packMaxRects } from "../src/domain/maxrects";
import type { Cargo, Container } from "../src/domain/types";
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
it.each(["baseline", "maxrects"])("横放轴线固定、只能地面支撑 %s", (id) => {
  const solve = id === "baseline" ? pack : packMaxRects;
  const r = solve(c, [{ ...a, stackable: true }]);
  expect(r.placements).toHaveLength(2);
  expect(
    r.placements.every((p) => p.position.z === 0 && p.size.x === 1800),
  ).toBe(true);
  expect(validateResult(r).valid).toBe(true);
  expect(
    solve(c, [{ ...a, shape: "cylinder-y", size: { x: 500, y: 1800, z: 500 } }])
      .placements,
  ).toHaveLength(0);
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
