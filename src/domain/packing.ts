import type {
  Cargo,
  Container,
  PackingResult,
  Placement,
  ValidationReport,
  Vec3,
} from "./types";

const AXES = ["x", "y", "z"] as const;
const MAX_BOXES = 1500;
const MAX_ERRORS = 50;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const label = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const integer = (v: unknown, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const volume = (v: Vec3) => v.x * v.y * v.z;
const validSize = (v: unknown): v is Vec3 =>
  record(v) &&
  AXES.every((a) => positive(v[a])) &&
  positive(volume(v as unknown as Vec3));
// Scale-relative tolerance preserves checks even for very small positive dimensions.
const near = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-10;
const fits = (a: number, b: number) => a <= b || near(a, b);
const sameSize = (a: Vec3, b: Vec3) => AXES.every((k) => near(a[k], b[k]));

export function validateInput(container: Container, cargo: Cargo[]): string[] {
  const errors: string[] = [];
  const error = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message);
  };
  if (!record(container)) error("货柜数据必须是对象。");
  else {
    if (!label(container.id) || !label(container.name))
      error("货柜 ID 和名称不能为空，且不超过 200 字符。");
    if (!validSize(container.size))
      error("货柜长宽高必须为有限正数，体积必须有效。");
    if (
      !record(container.door) ||
      !positive(container.door.width) ||
      !positive(container.door.height)
    )
      error("柜门宽高必须为有限正数。");
    else if (
      validSize(container.size) &&
      (container.door.width > container.size.y ||
        container.door.height > container.size.z)
    )
      error("柜门宽高不能超过货柜内宽高。");
    if (!positive(container.maxWeight)) error("货柜最大载重必须为有限正数。");
  }
  if (!Array.isArray(cargo)) {
    error("货物清单必须是数组。");
    return errors;
  }
  if (cargo.length > 30) {
    error("最多支持 30 个 SKU。");
    return errors;
  }
  const ids = new Set<string>();
  let count = 0;
  for (let i = 0; i < cargo.length; i++) {
    const item = cargo[i];
    const prefix = `第 ${i + 1} 项货物：`;
    if (!record(item)) {
      error(prefix + "必须是对象。");
      continue;
    }
    if (!label(item.id) || !label(item.name))
      error(prefix + "ID 和名称不能为空，且不超过 200 字符。");
    if (ids.has(item.id)) error(prefix + "SKU ID 重复。");
    ids.add(item.id);
    if (!validSize(item.size))
      error(prefix + "长宽高必须为有限正数，体积必须有效。");
    if (!integer(item.quantity) || item.quantity > MAX_BOXES)
      error(prefix + "数量必须为 0–1500 的整数。");
    else count += item.quantity;
    if (!positive(item.weight)) error(prefix + "单箱重量必须为有限正数。");
    if (
      positive(item.weight) &&
      integer(item.quantity) &&
      !Number.isFinite(item.weight * item.quantity)
    )
      error(prefix + "总重量超出数值范围。");
    if (!integer(item.maxLayers, 1)) error(prefix + "最大层数必须为正整数。");
    if (item.stackable !== undefined && typeof item.stackable !== "boolean")
      error(prefix + "叠放设置无效。");
    if (item.bottomOnly !== undefined && typeof item.bottomOnly !== "boolean")
      error(prefix + "底层设置无效。");
    if (
      item.loadUnit !== undefined &&
      item.loadUnit !== "carton" &&
      item.loadUnit !== "pallet"
    )
      error(prefix + "装载单位无效。");
    if (
      item.maxStackWeight !== undefined &&
      (!Number.isFinite(item.maxStackWeight) || item.maxStackWeight < 0)
    )
      error(prefix + "单垛最大承重必须为非负数。");
    if (item.rotation !== "upright" && item.rotation !== "free")
      error(prefix + "旋转规则必须为 upright 或 free。");
    if (typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color))
      error(prefix + "颜色必须为 #RRGGBB 格式。");
  }
  if (count > MAX_BOXES) error("货物总数量不能超过 1500 箱。");
  return errors;
}

function orientations(cargo: Cargo): Vec3[] {
  const { x, y, z } = cargo.size;
  const values =
    cargo.rotation === "upright"
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
      values.map(([a, b, c]) => [`${a}/${b}/${c}`, { x: a, y: b, z: c }]),
    ).values(),
  ];
}

function usable(c: Container, size: Vec3) {
  return (
    AXES.every((a) => fits(size[a], c.size[a])) &&
    fits(size.y, c.door.width) &&
    fits(size.z, c.door.height)
  );
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function solve(
  container: Container,
  cargo: Cargo[],
  order: number,
  rotation: number,
  split: number,
): Placement[] {
  const metrics = [
    (a: Cargo) => volume(a.size),
    (a: Cargo) =>
      Math.max(a.size.x, a.size.y, a.rotation === "free" ? a.size.z : 0),
    (a: Cargo) => volume(a.size) / a.weight,
    (a: Cargo) => volume(a.size) * a.quantity,
  ];
  const sorted = [...cargo].sort(
    (a, b) => metrics[order](b) - metrics[order](a) || a.id.localeCompare(b.id),
  );
  const rects: Rect[] = [
    { x: 0, y: 0, w: container.size.x, h: container.size.y },
  ];
  const placements: Placement[] = [];
  let totalWeight = 0;
  let stack = 0;
  for (const item of sorted) {
    let remaining = item.quantity;
    const choices = orientations(item).filter((size) =>
      usable(container, size),
    );
    while (remaining > 0) {
      const byWeight = Math.min(
        remaining,
        Math.floor((container.maxWeight - totalWeight) / item.weight + 1e-10),
      );
      if (byWeight < 1) break;
      let best:
        | { index: number; size: Vec3; layers: number; score: number }
        | undefined;
      for (let index = 0; index < rects.length; index++) {
        const rect = rects[index];
        for (const size of choices) {
          if (!fits(size.x, rect.w) || !fits(size.y, rect.h)) continue;
          const layers = Math.min(
            remaining,
            byWeight,
            item.maxLayers,
            item.stackable === false || item.bottomOnly === true
              ? 1
              : item.maxLayers,
            Math.floor(container.size.z / size.z + 1e-10),
            item.maxStackWeight && item.maxStackWeight > 0
              ? Math.floor(item.maxStackWeight / item.weight + 1e-10)
              : MAX_BOXES,
          );
          if (layers < 1) continue;
          const waste = 1 - (size.x / rect.w) * (size.y / rect.h);
          const score =
            rotation === 0
              ? -layers + waste * 0.5
              : waste - (layers / MAX_BOXES) * 0.01;
          if (!best || score < best.score)
            best = { index, size, layers, score };
        }
      }
      if (!best) break;
      const rect = rects.splice(best.index, 1)[0];
      const { size, layers } = best;
      const stackId = `stack-${++stack}`;
      for (let layer = 1; layer <= layers; layer++) {
        placements.push({
          boxId: `box-${placements.length + 1}`,
          cargoId: item.id,
          containerId: container.id,
          position: { x: rect.x, y: rect.y, z: (layer - 1) * size.z },
          size: { ...size },
          weight: item.weight,
          layer,
          stackId,
        });
      }
      remaining -= layers;
      totalWeight += layers * item.weight;
      const dw = Math.max(0, rect.w - size.x);
      const dh = Math.max(0, rect.h - size.y);
      const additions: Rect[] =
        split === 0
          ? [
              { x: rect.x + size.x, y: rect.y, w: dw, h: rect.h },
              { x: rect.x, y: rect.y + size.y, w: size.x, h: dh },
            ]
          : [
              { x: rect.x + size.x, y: rect.y, w: dw, h: size.y },
              { x: rect.x, y: rect.y + size.y, w: rect.w, h: dh },
            ];
      rects.push(...additions.filter((r) => r.w > 0 && r.h > 0));
    }
  }
  return placements;
}

export function pack(container: Container, cargo: Cargo[]): PackingResult {
  const errors = validateInput(container, cargo);
  if (errors.length) throw new Error("输入无效：" + errors.join("；"));
  // Snapshot input so later editor changes cannot silently alter an existing result.
  container = structuredClone(container);
  const resultContainer = structuredClone(container);
  const walls = container.clearance?.walls ?? 0;
  const doorGap = container.clearance?.door ?? 0;
  const between = container.clearance?.between ?? 0;
  container.size = {
    ...container.size,
    x: container.size.x - walls * 2 - between,
    y: container.size.y - walls * 2 - between,
    z: container.size.z - walls * 2,
  };
  container.door = {
    width: container.door.width - doorGap * 2,
    height: container.door.height - doorGap * 2,
  };
  cargo = structuredClone(cargo);
  let placements: Placement[] = [];
  let bestVolume = -1;
  let strategy = "";
  for (let order = 0; order < 4; order++)
    for (let rotation = 0; rotation < 2; rotation++)
      for (let split = 0; split < 2; split++) {
        const candidate = solve(container, cargo, order, rotation, split);
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
          strategy = `同 SKU 完整支撑堆垛 · 平面切分启发式 ${order + 1}/${rotation + 1}/${split + 1}（非最优保证）`;
        }
      }
  const counts = new Map<string, number>();
  for (const p of placements)
    counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
  const unpacked = cargo
    .filter((a) => (counts.get(a.id) ?? 0) < a.quantity)
    .map((a) => ({
      cargoId: a.id,
      quantity: a.quantity - (counts.get(a.id) ?? 0),
      reason: !orientations(a).some((s) => usable(container, s))
        ? "允许朝向无法满足柜内尺寸或柜门宽高。"
        : a.weight > container.maxWeight
          ? "单箱重量超过货柜最大载重。"
          : "当前方案未装入：受剩余空间、载重、层数及保守堆垛策略限制。",
    }));
  const result: PackingResult = {
    schemaVersion: 1,
    container: resultContainer,
    cargo,
    placements,
    unpacked,
    strategy,
    validation: { valid: false, errors: [] },
  };
  result.validation = validateResult(result);
  return result;
}

/** Independent geometric/accounting audit. Never trusts the stored validation flag. */
export function validateResult(result: PackingResult): ValidationReport {
  const errors: string[] = [];
  const error = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message);
  };
  const report = () => ({ valid: errors.length === 0, errors });
  if (!record(result)) {
    error("结果必须为对象。");
    return report();
  }
  if (result.schemaVersion !== 1) error("不支持的结果版本。");
  const inputs = validateInput(result.container, result.cargo);
  if (inputs.length) {
    inputs.forEach(error);
    return report();
  }
  if (
    !Array.isArray(result.placements) ||
    result.placements.length > MAX_BOXES ||
    !Array.isArray(result.unpacked) ||
    result.unpacked.length > 30
  ) {
    error("装箱或未装入清单结构无效或超出数量限制。");
    return report();
  }
  const cargoById = new Map(result.cargo.map((a) => [a.id, a]));
  const boxIds = new Set<string>();
  const counts = new Map<string, number>();
  const stacks = new Map<string, Placement[]>();
  const checked: Placement[] = [];
  let totalWeight = 0;
  for (const p of result.placements) {
    if (
      !record(p) ||
      !validSize(p.size) ||
      !record(p.position) ||
      !AXES.every(
        (a) =>
          typeof p.position[a] === "number" &&
          Number.isFinite(p.position[a]) &&
          p.position[a] >= 0,
      ) ||
      !positive(p.weight) ||
      !integer(p.layer, 1) ||
      !label(p.boxId) ||
      !label(p.stackId)
    ) {
      error("存在字段缺失或数值无效的装箱项。");
      continue;
    }
    if (boxIds.has(p.boxId)) error(`箱号 ${p.boxId} 重复。`);
    boxIds.add(p.boxId);
    if (p.containerId !== result.container.id)
      error(`箱号 ${p.boxId} 的货柜 ID 不匹配。`);
    const item = cargoById.get(p.cargoId);
    if (!item) {
      error(`箱号 ${p.boxId} 使用未知 SKU。`);
      continue;
    }
    counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
    if (!orientations(item).some((s) => sameSize(s, p.size)))
      error(`箱号 ${p.boxId} 的尺寸或朝向不允许。`);
    if (!near(p.weight, item.weight))
      error(`箱号 ${p.boxId} 的重量与货物定义不一致。`);
    totalWeight += item.weight;
    if (p.layer > item.maxLayers) error(`箱号 ${p.boxId} 超过最大层数。`);
    if (!usable(result.container, p.size))
      error(`箱号 ${p.boxId} 不满足柜内或柜门尺寸限制。`);
    if (
      !AXES.every((a) =>
        fits(p.position[a] + p.size[a], result.container.size[a]),
      )
    )
      error(`箱号 ${p.boxId} 超出货柜边界。`);
    if (!stacks.has(p.stackId)) stacks.set(p.stackId, []);
    stacks.get(p.stackId)!.push(p);
    checked.push(p);
  }
  if (
    !Number.isFinite(totalWeight) ||
    !fits(totalWeight, result.container.maxWeight)
  )
    error("总重量超过货柜最大载重。");
  for (const [id, stack] of stacks) {
    stack.sort((a, b) => a.position.z - b.position.z);
    const base = stack[0];
    if (base.position.z !== 0 || base.layer !== 1)
      error(`堆垛 ${id} 缺少地面支撑或底层编号错误。`);
    for (let i = 0; i < stack.length; i++) {
      const p = stack[i];
      const below = stack[i - 1];
      if (
        p.cargoId !== base.cargoId ||
        !sameSize(p.size, base.size) ||
        !near(p.position.x, base.position.x) ||
        !near(p.position.y, base.position.y)
      )
        error(`堆垛 ${id} 必须同 SKU、同朝向且底面完整对齐。`);
      if (
        p.layer !== i + 1 ||
        (below && !near(p.position.z, below.position.z + below.size.z))
      )
        error(`堆垛 ${id} 层数不连续或缺少完整支撑。`);
    }
  }
  for (let i = 0; i < checked.length; i++)
    for (let j = i + 1; j < checked.length; j++) {
      const a = checked[i];
      const b = checked[j];
      if (
        AXES.every(
          (k) =>
            Math.min(a.position[k] + a.size[k], b.position[k] + b.size[k]) -
              Math.max(a.position[k], b.position[k]) >
            Math.min(a.size[k], b.size[k]) * 1e-10,
        )
      )
        error(`箱号 ${a.boxId} 与 ${b.boxId} 重叠。`);
      if (errors.length >= MAX_ERRORS) return report();
    }
  const unpacked = new Map<string, number>();
  for (const u of result.unpacked) {
    if (
      !record(u) ||
      !cargoById.has(u.cargoId) ||
      !integer(u.quantity, 1) ||
      typeof u.reason !== "string" ||
      !u.reason.trim()
    ) {
      error("未装入清单含无效 SKU、数量或原因。");
      continue;
    }
    if (unpacked.has(u.cargoId)) error(`未装入清单中 SKU ${u.cargoId} 重复。`);
    unpacked.set(u.cargoId, u.quantity);
  }
  for (const a of result.cargo)
    if ((counts.get(a.id) ?? 0) + (unpacked.get(a.id) ?? 0) !== a.quantity)
      error(`SKU ${a.id} 的已装与未装数量不等于输入数量。`);
  return report();
}
