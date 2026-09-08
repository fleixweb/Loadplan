import { MaxRectsBin, PACKING_LOGIC, Rectangle } from "maxrects-packer";
import { validateInput, validateResult } from "./packing";
import type { Cargo, Container, PackingResult, Placement, Vec3 } from "./types";

const volume = (s: Vec3) => s.x * s.y * s.z;

interface FloorGrid {
  scale: number;
  width: number;
  height: number;
  footprint: (value: number) => number;
}

function createFloorGrid(container: Container, cargo: Cargo[]): FloorGrid {
  // Default precision is 10^-6 mm. Use a decimal power so ordinary decimal
  // dimensions keep exact integer ratios. Adapt for tiny/huge inputs while
  // keeping every floor coordinate <= 10^12 (well inside safe integer range).
  // Integer coordinate sums/subtractions are exact; area scores may still round.
  const maxCoordinate = 1e12;
  const dimensions = [container.size.x, container.size.y];
  for (const item of cargo) {
    if (!item.quantity) continue;
    for (const size of allowedSizes(container, item))
      dimensions.push(size.x, size.y);
  }
  const largest = Math.max(container.size.x, container.size.y);
  const smallest = Math.min(...dimensions);
  const exponent = Math.min(
    308,
    Math.max(6, Math.ceil(-Math.log10(smallest))),
    Math.floor(Math.log10(maxCoordinate) - Math.log10(largest)),
  );
  let scale = 10 ** exponent;
  // Guard a possible rounding step at the logarithm's decimal boundary.
  if (largest * scale > maxCoordinate) scale /= 10;
  const convert = (value: number, round: (n: number) => number) => {
    const scaled = value * scale;
    const nearest = Math.round(scaled);
    // Correct only floating-point multiplication noise near an integer. This
    // is not a geometric fit tolerance and cannot hide real sub-grid excess.
    const corrected =
      Math.abs(scaled - nearest) <= 4 * Number.EPSILON * Math.abs(scaled)
        ? nearest
        : scaled;
    const integer = round(corrected);
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      corrected < 1 ||
      integer > maxCoordinate ||
      !Number.isSafeInteger(integer)
    ) {
      throw new Error(
        "MaxRects 柜底尺寸超出整数网格精度范围：无法同时表示当前尺寸跨度，请调整单位或尺寸范围。",
      );
    }
    return integer;
  };
  // Floor the available space and ceil each reserved footprint: non-grid cargo
  // can lose capacity, but is never deliberately shrunk to manufacture a fit.
  // Output uses original box dimensions and converted coordinates, then audits.
  const footprint = (value: number) => convert(value, Math.ceil);
  for (const dimension of dimensions) footprint(dimension);
  return {
    scale,
    width: convert(container.size.x, Math.floor),
    height: convert(container.size.y, Math.floor),
    footprint,
  };
}

function allowedSizes(c: Container, item: Cargo): Vec3[] {
  const { x, y, z } = item.size;
  const permutations =
    item.rotation === "upright"
      ? [
          [x, y, z],
          [y, x, z],
        ]
      : [
          [x, y, z],
          [y, x, z],
          [x, z, y],
          [z, x, y],
          [y, z, x],
          [z, y, x],
        ];
  return [
    ...new Map(
      permutations.map(([x, y, z]) => [`${x}/${y}/${z}`, { x, y, z }]),
    ).values(),
  ].filter(
    (s) =>
      s.x <= c.size.x &&
      s.y <= c.size.y &&
      s.z <= c.size.z &&
      s.y <= c.door.width &&
      s.z <= c.door.height,
  );
}

const orderMetrics = [
  (a: Cargo) => volume(a.size),
  (a: Cargo) =>
    Math.max(a.size.x, a.size.y, a.rotation === "free" ? a.size.z : 0),
  (a: Cargo) => volume(a.size) / a.weight,
  (a: Cargo) => volume(a.size) * a.quantity,
];

function solve(
  container: Container,
  cargo: Cargo[],
  grid: FloorGrid,
  order: number,
  orientation: number,
  logic: PACKING_LOGIC,
): Placement[] {
  // Only this fixed bin owns floor coordinates. The auto-multiple-bin packer is never used.
  const bin = new MaxRectsBin(grid.width, grid.height, 0, {
    smart: false,
    pot: false,
    square: false,
    allowRotation: false,
    border: 0,
    tag: false,
    logic,
  });
  const sorted = [...cargo].sort(
    (a, b) =>
      orderMetrics[order](b) - orderMetrics[order](a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const placements: Placement[] = [];
  let totalWeight = 0;
  let stacks = 0;
  for (const item of sorted) {
    let remaining = item.quantity;
    const capacity = (s: Vec3) =>
      Math.min(
        item.maxLayers,
        item.stackable === false || item.bottomOnly === true
          ? 1
          : item.maxLayers,
        Math.floor(container.size.z / s.z + 1e-10),
        item.maxStackWeight && item.maxStackWeight > 0
          ? Math.floor(item.maxStackWeight / item.weight + 1e-10)
          : Number.MAX_SAFE_INTEGER,
      );
    // Each trial ranks explicit legal 3D orientations. The library cannot rotate them.
    const sizes = allowedSizes(container, item).sort((a, b) =>
      orientation === 0
        ? capacity(b) - capacity(a) || a.x * a.y - b.x * b.y
        : orientation === 1
          ? b.x - a.x || b.y - a.y
          : b.y - a.y || b.x - a.x,
    );
    while (remaining > 0) {
      const byWeight = Math.min(
        remaining,
        Math.floor((container.maxWeight - totalWeight) / item.weight + 1e-10),
      );
      if (byWeight < 1) break;
      let added = false;
      for (const size of sizes) {
        const layers = Math.min(remaining, byWeight, capacity(size));
        if (layers < 1) continue;
        const floor = bin.add(
          new Rectangle(
            grid.footprint(size.x),
            grid.footprint(size.y),
            0,
            0,
            false,
            false,
          ),
        );
        if (!floor) continue;
        const stackId = `maxrects-stack-${++stacks}`;
        for (let layer = 1; layer <= layers; layer++) {
          placements.push({
            boxId: `box-${placements.length + 1}`,
            cargoId: item.id,
            containerId: container.id,
            position: {
              x: floor.x / grid.scale,
              y: floor.y / grid.scale,
              z: (layer - 1) * size.z,
            },
            size: { ...size },
            weight: item.weight,
            layer,
            stackId,
          });
        }
        remaining -= layers;
        totalWeight += layers * item.weight;
        added = true;
        break;
      }
      if (!added) break;
    }
  }
  return placements;
}

/** MIT maxrects-packer 2.7.3 floor packing + conservative full-support 3D stacks. */
export function packMaxRects(
  container: Container,
  cargo: Cargo[],
): PackingResult {
  const errors = validateInput(container, cargo);
  if (errors.length) throw new Error("输入无效：" + errors.join("；"));
  container = structuredClone(container);
  const resultContainer = structuredClone(container);
  const walls = container.clearance?.walls ?? 0;
  const doorGap = container.clearance?.door ?? 0;
  container.size = {
    ...container.size,
    x: container.size.x - walls * 2,
    y: container.size.y - walls * 2,
    z: container.size.z - walls * 2,
  };
  container.door = {
    width: container.door.width - doorGap * 2,
    height: container.door.height - doorGap * 2,
  };
  cargo = structuredClone(cargo);
  const grid = createFloorGrid(container, cargo);
  let placements: Placement[] = [];
  let bestVolume = -1;
  let strategy = "";
  // Bounded 4 cargo orders × 3 orientation preferences × 2 library placement logics.
  for (let order = 0; order < 4; order++)
    for (let orientation = 0; orientation < 3; orientation++)
      for (const logic of [PACKING_LOGIC.MAX_EDGE, PACKING_LOGIC.MAX_AREA]) {
        const candidate = solve(
          container,
          cargo,
          grid,
          order,
          orientation,
          logic,
        );
        const packedVolume = candidate.reduce(
          (sum, p) => sum + volume(p.size),
          0,
        );
        if (
          packedVolume > bestVolume ||
          (packedVolume === bestVolume && candidate.length > placements.length)
        ) {
          placements = candidate;
          bestVolume = packedVolume;
          strategy = `MaxRects 二维柜底 + 同 SKU 完整支撑堆垛 · maxrects-packer 2.7.3 · ${order + 1}/${orientation + 1}/${logic === PACKING_LOGIC.MAX_EDGE ? "短边" : "面积"}（24 次启发式尝试，非最优保证）`;
        }
      }
  const counts = new Map<string, number>();
  for (const p of placements)
    counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
  const result: PackingResult = {
    schemaVersion: 1,
    container: resultContainer,
    cargo,
    placements,
    strategy,
    unpacked: cargo
      .filter((a) => (counts.get(a.id) ?? 0) < a.quantity)
      .map((a) => ({
        cargoId: a.id,
        quantity: a.quantity - (counts.get(a.id) ?? 0),
        reason: !allowedSizes(container, a).length
          ? "允许朝向无法满足柜内尺寸或柜门宽高。"
          : a.weight > container.maxWeight
            ? "单箱重量超过货柜最大载重。"
            : "当前方案未装入：受剩余空间、载重、层数及保守堆垛策略限制。",
      })),
    validation: { valid: false, errors: [] },
  };
  // Return diagnostics unchanged if the independent auditor detects a problem.
  result.validation = validateResult(result);
  return result;
}
