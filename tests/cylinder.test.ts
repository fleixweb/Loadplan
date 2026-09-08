import { describe, expect, it } from "vitest";
import { pack, validateInput, validateResult } from "../src/domain/packing";
import { packMaxRects } from "../src/domain/maxrects";
import type { Cargo, Container } from "../src/domain/types";

const container: Container = {
  id: "c",
  name: "测试空间",
  size: { x: 1000, y: 1000, z: 1000 },
  door: { width: 1000, height: 1000 },
  maxWeight: 1000,
};
const cylinder = {
  id: "drum",
  name: "桶",
  shape: "cylinder",
  size: { x: 500, y: 500, z: 400 },
  quantity: 10,
  weight: 10,
  rotation: "upright",
  maxLayers: 3,
  color: "#aabbcc",
} as Cargo;

describe.each([pack, packMaxRects])("直立圆柱占位计算 %s", (solve) => {
  it("默认不叠放，四个圆柱各占一个直径见方的地面位置", () => {
    const r = solve(container, [cylinder]);
    expect(r.placements).toHaveLength(4);
    expect(
      r.placements.every(
        (p) => p.position.z === 0 && p.size.x === 500 && p.size.y === 500,
      ),
    ).toBe(true);
    expect(validateResult(r).valid).toBe(true);
    expect(r.unpacked[0].quantity).toBe(6);
    expect(JSON.parse(JSON.stringify(r)).cargo[0].shape).toBe("cylinder");
  });
  it("明确允许叠放后装八件，单垛重量及底层限制仍生效", () => {
    expect(
      solve(container, [{ ...cylinder, stackable: true }]).placements,
    ).toHaveLength(8);
    expect(
      solve(container, [{ ...cylinder, stackable: true, maxStackWeight: 15 }])
        .placements,
    ).toHaveLength(4);
    expect(
      solve(container, [{ ...cylinder, stackable: true, bottomOnly: true }])
        .placements,
    ).toHaveLength(4);
  });
  it("门宽不足时不能装入，混装时保留形态和数量", () => {
    expect(
      solve({ ...container, door: { width: 499, height: 1000 } }, [cylinder])
        .placements,
    ).toHaveLength(0);
    const r = solve(container, [
      { ...cylinder, quantity: 1 },
      { ...cylinder, id: "box", shape: "box", quantity: 1 },
    ]);
    expect(r.placements).toHaveLength(2);
    expect(validateResult(r).valid).toBe(true);
  });
});

it("拒绝圆柱横放、椭圆底面和整托混用", () => {
  expect(
    validateInput(container, [{ ...cylinder, rotation: "free" }]).join(),
  ).toContain("直立");
  expect(
    validateInput(container, [
      { ...cylinder, size: { x: 500, y: 400, z: 400 } },
    ]).join(),
  ).toContain("直径");
  expect(
    validateInput(container, [{ ...cylinder, loadUnit: "pallet" }]).join(),
  ).toContain("整托");
});

it("独立校验拒绝绕过圆柱叠放、底层与重量规则的结果", () => {
  const r = pack(container, [{ ...cylinder, stackable: true }]);
  for (const rules of [
    { stackable: false },
    { bottomOnly: true },
    { maxStackWeight: 15 },
  ]) {
    const changed = structuredClone(r);
    Object.assign(changed.cargo[0], rules);
    expect(validateResult(changed).valid).toBe(false);
  }
});
