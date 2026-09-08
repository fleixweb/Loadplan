import { it, expect } from "vitest";
import { cargoGeometry } from "../src/components/cargoGeometry";
import type { Cargo } from "../src/domain/types";
it.each(["cylinder-x", "cylinder-y", "wood-box", "wood-frame"] as const)(
  "几何保持占位范围 %s",
  (shape) => {
    const c = {
      shape,
      size: { x: 1000, y: 800, z: 600 },
      cylinderDiameter: 400,
      cylinderLength: 700,
    } as Cargo;
    const g = cargoGeometry(c);
    g.computeBoundingBox();
    for (const axis of ["x", "y", "z"] as const) {
      expect(g.boundingBox!.min[axis]).toBeGreaterThanOrEqual(-0.500001);
      expect(g.boundingBox!.max[axis]).toBeLessThanOrEqual(0.500001);
    }
    expect(g.getAttribute("position").count).toBeGreaterThan(24);
    g.dispose();
  },
);
