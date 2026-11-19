import { describe, expect, it } from "vitest";
import { packFleet } from "../src/domain/fleet";
import { packMaxRects } from "../src/domain/maxrects";
import { pack, validateResult } from "../src/domain/packing";
import type { Cargo, Container } from "../src/domain/types";

const container: Container = {
  id: "c",
  name: "Container",
  size: { x: 1000, y: 1000, z: 600 },
  door: { width: 1000, height: 600 },
  maxWeight: 1000,
  clearance: { walls: 100, door: 200, between: 100 },
};
const cargo: Cargo = {
  id: "a",
  name: "Cargo",
  size: { x: 300, y: 300, z: 200 },
  quantity: 12,
  weight: 1,
  maxLayers: 3,
  rotation: "upright",
  color: "#aabbcc",
};

describe.each([
  ["baseline", pack],
  ["maxrects", packMaxRects],
] as const)("%s clearance", (algorithm, solve) => {
  it("reserves wall, door and floor gaps while allowing supported layers", () => {
    const result = solve(container, [cargo]);
    const bases = result.placements.filter((p) => p.layer === 1);
    expect(result.validation).toEqual({ valid: true, errors: [] });
    expect(result.placements).toHaveLength(12);
    expect(bases.map((p) => [p.position.x, p.position.y]).sort()).toEqual([
      [100, 100],
      [100, 500],
      [500, 100],
      [500, 500],
    ]);
    expect(result.placements.filter((p) => p.layer === 3)).toHaveLength(4);
    expect(result.placements.find((p) => p.layer === 3)?.position.z).toBe(400);
  });

  it("rejects displaced stacks even when they remain inside the physical container", () => {
    const result = solve(container, [cargo]);
    for (const [x, shift, message] of [
      [100, -1, /柜壁或柜门间隙/],
      [500, 1, /柜壁或柜门间隙/],
      [500, -1, /货物间隙不足/],
    ] as const) {
      const edited = structuredClone(result);
      for (const p of edited.placements) {
        if (p.position.x === x) p.position.x += shift;
      }
      expect(validateResult(edited).errors).toEqual(
        expect.arrayContaining([expect.stringMatching(message)]),
      );
    }
  });

  it("checks the adjusted door opening independently of the floor layout", () => {
    const tall = { ...cargo, quantity: 1, size: { ...cargo.size, z: 201 } };
    expect(solve(container, [tall]).placements).toHaveLength(0);
    const result = solve({ ...container, clearance: undefined }, [tall]);
    result.container = container;
    result.placements[0].position = { x: 100, y: 100, z: 0 };
    expect(validateResult(result).errors.join(" ")).toMatch(/柜壁或柜门间隙/);
  });

  it("continues automatic estimation after an exhausted candidate", () => {
    const exhausted = {
      ...container,
      id: "exhausted",
      clearance: { walls: 500, door: 0, between: 0 },
    };
    const empty = solve(exhausted, [cargo]);
    expect(empty.validation.valid).toBe(true);
    expect(empty.placements).toHaveLength(0);
    expect(empty.unpacked[0].quantity).toBe(cargo.quantity);
    const plan = packFleet(
      { mode: "auto", containers: [exhausted, container], maxContainers: 2, algorithm },
      [cargo],
    );
    expect(plan.status).toBe("complete");
    expect(plan.validation.valid).toBe(true);
    expect(plan.results[0].placements).toHaveLength(cargo.quantity);
  });

  it.each([-1, NaN, Infinity])("rejects invalid clearance %s", (walls) => {
    expect(() =>
      solve({ ...container, clearance: { walls, door: 0, between: 0 } }, [cargo]),
    ).toThrow(/预留间隙/);
  });
});
