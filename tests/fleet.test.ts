import { describe, expect, it } from "vitest";
import { packFleet, validateFleet } from "../src/domain/fleet";
import type { Cargo, Container, FleetOptions } from "../src/domain/types";

const container: Container = {
  id: "preset",
  name: "测试柜",
  size: { x: 1000, y: 500, z: 500 },
  door: { width: 500, height: 500 },
  maxWeight: 100,
};
const cargo: Cargo = {
  id: "a",
  name: "机器",
  model: "M001",
  size: { x: 500, y: 500, z: 500 },
  quantity: 5,
  weight: 10,
  maxLayers: 1,
  rotation: "upright",
  color: "#b98955",
  serialNumbers: ["001", "002", "003", "004", "005"],
};
describe.each(["baseline", "maxrects"] as const)("多柜 %s", (algorithm) => {
  const options: FleetOptions = {
    mode: "fixed",
    containers: [container, container, container],
    maxContainers: 10,
    algorithm,
  };
  it("分配数量守恒、柜号唯一、序列号无重复，原始输入不改变", () => {
    const original = JSON.stringify(cargo);
    const result = packFleet(options, [cargo]);
    expect(result.results.map((r) => r.placements.length)).toEqual([2, 2, 1]);
    expect(new Set(result.results.map((r) => r.container.id)).size).toBe(3);
    expect(
      result.results.flatMap((r) => r.placements.map((p) => p.serialNumber)),
    ).toEqual(cargo.serialNumbers);
    expect(result.validation.valid).toBe(true);
    expect(result.unpacked).toEqual([]);
    expect(JSON.stringify(cargo)).toBe(original);
  });
  it("支持不同柜子和无空间的空柜，后续柜子仍继续分配", () => {
    const tooSmall = {
      ...container,
      size: { x: 100, y: 100, z: 100 },
      door: { width: 100, height: 100 },
    };
    const result = packFleet(
      { ...options, containers: [tooSmall, container] },
      [cargo],
    );
    expect(result.results.map((r) => r.placements.length)).toEqual([0, 2]);
    expect(result.unpacked[0].quantity).toBe(3);
    expect(result.validation.valid).toBe(true);
  });
  it("固定柜子保留空柜，自动估算装完就停止", () => {
    const fixed = packFleet(options, [
      { ...cargo, quantity: 1, serialNumbers: ["001"] },
    ]);
    expect(fixed.results.map((r) => r.placements.length)).toEqual([1, 0, 0]);
    const auto = packFleet(
      { ...options, mode: "auto", containers: [container] },
      [cargo],
    );
    expect(auto.results).toHaveLength(3);
    expect(auto.status).toBe("complete");
  });
  it("无法装入和达到上限时终止，不无限加柜", () => {
    const unfit = packFleet({ ...options, mode: "auto" }, [
      { ...cargo, size: { x: 2000, y: 2000, z: 2000 } },
    ]);
    expect(unfit.results).toHaveLength(1);
    expect(unfit.status).toBe("unfit");
    const limited = packFleet({ ...options, mode: "auto", maxContainers: 2 }, [
      cargo,
    ]);
    expect(limited.results).toHaveLength(2);
    expect(limited.status).toBe("limit");
    expect(limited.unpacked[0].quantity).toBe(1);
    expect(limited.validation.valid).toBe(true);
  });
  it("混合形态各自遵守层数、朝向和承重规则", () => {
    const result = packFleet(options, [
      { ...cargo, quantity: 1, serialNumbers: undefined },
      {
        ...cargo,
        id: "b",
        shape: "cylinder-x",
        quantity: 2,
        serialNumbers: undefined,
        cylinderDiameter: 200,
        cylinderLength: 800,
        size: { x: 800, y: 200, z: 200 },
        stackable: true,
        maxLayers: 2,
      },
      {
        ...cargo,
        id: "c",
        shape: "wood-frame",
        quantity: 1,
        serialNumbers: undefined,
      },
    ]);
    expect(result.results.flatMap((r) => r.placements)).toHaveLength(4);
    expect(result.validation.valid).toBe(true);
  });
  it("独立校验拒绝重复序列号、篡改货物规则及丢失货物", () => {
    const result = packFleet(options, [cargo]);
    const duplicate = structuredClone(result);
    duplicate.results[1].placements[0].serialNumber = "001";
    expect(validateFleet(duplicate).valid).toBe(false);
    const altered = structuredClone(result);
    altered.results[0].cargo[0].maxLayers = 99;
    expect(validateFleet(altered).valid).toBe(false);
    const lost = structuredClone(result);
    lost.results.pop();
    expect(validateFleet(lost).valid).toBe(false);
    const enlarged = structuredClone(result);
    enlarged.results[0].container.maxWeight *= 2;
    expect(validateFleet(enlarged).valid).toBe(false);
  });
});
