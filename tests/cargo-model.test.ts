import { describe, expect, it } from "vitest";
import { bodySize, changeCargo, cargoIssues } from "../src/domain/cargoModel";
import { validateInput } from "../src/domain/packing";
import { pack } from "../src/domain/packing";
import { CONTAINERS, SAMPLE_CARGO } from "../src/domain/sample";

describe("形态尺寸与支撑占位", () => {
  it("超过原有 30 个 SKU 的剩余清单仍可独立校验", () => {
    const cargo = Array.from({ length: 40 }, (_, i) => ({
      ...SAMPLE_CARGO[0],
      id: `SKU-${i}`,
      quantity: 1,
      size: { x: 99999, y: 99999, z: 99999 },
    }));
    const result = pack(CONTAINERS[0], cargo);
    expect(result.unpacked).toHaveLength(40);
    expect(result.validation.valid).toBe(true);
  });
  it("横放只填直径和轴长，占位随字段更新，不保留旧纸箱尺寸", () => {
    let c = changeCargo(SAMPLE_CARGO[0], { shape: "cylinder-x" });
    c = changeCargo(c, { cylinderDiameter: 250, cylinderLength: 11800 });
    expect(c.size).toEqual({ x: 11800, y: 250, z: 250 });
    expect(c.stackable).toBe(false);
    expect(changeCargo(c, { shape: "cylinder-y" }).size).toEqual({
      x: 250,
      y: 11800,
      z: 250,
    });
  });
  it("支架尺寸可独立调整，关闭支架恢复本体占位", () => {
    let c = changeCargo(SAMPLE_CARGO[0], { shape: "cylinder-x" });
    c = changeCargo(c, { cylinderDiameter: 250, cylinderLength: 1000 });
    c = changeCargo(c, { support: true });
    c = changeCargo(c, { size: { x: 1100, y: 350, z: 400 } });
    expect(bodySize(c)).toEqual({ x: 1000, y: 250, z: 250 });
    expect(cargoIssues(c)).toEqual([]);
    expect(changeCargo(c, { support: false }).size).toEqual({
      x: 1000,
      y: 250,
      z: 250,
    });
    c = changeCargo(c, { size: { x: 900, y: 350, z: 400 } });
    expect(cargoIssues(c).join()).toContain("不能小于");
    expect(validateInput(CONTAINERS[0], [c]).join()).toContain("占位");
  });
  it("修改长方体尺寸使用同一占位规则", () => {
    const c = changeCargo(SAMPLE_CARGO[0], {
      bodySize: { x: 100, y: 200, z: 300 },
    });
    expect(c.size).toEqual({ x: 100, y: 200, z: 300 });
  });
});
