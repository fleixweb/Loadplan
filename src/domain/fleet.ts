import { pack, validateInput, validateResult } from "./packing";
import { packMaxRects } from "./maxrects";
import type {
  Cargo,
  FleetOptions,
  FleetResult,
  ValidationReport,
} from "./types";

export function validateFleet(plan: FleetResult): ValidationReport {
  const errors: string[] = [];
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  const serials = new Set<string>();
  const original = new Map(plan.cargo.map((c) => [c.id, c]));
  const expectedCount =
    plan.options.mode === "auto"
      ? plan.options.maxContainers
      : plan.options.containers.length;
  if (plan.results.length > expectedCount)
    errors.push("结果柜数超过配置上限。");
  for (const [index, r] of plan.results.entries()) {
    const template =
      plan.options.containers[plan.options.mode === "auto" ? 0 : index];
    if (
      !template ||
      JSON.stringify({
        ...r.container,
        id: template.id,
        name: template.name,
      }) !== JSON.stringify(template)
    )
      errors.push("实际柜子与输入的尺寸、载重或间隙设置不一致。");
    if (ids.has(r.container.id)) errors.push("柜号重复。");
    ids.add(r.container.id);
    errors.push(
      ...validateResult(r).errors.map((e) => `${r.container.id}：${e}`),
    );
    for (const c of r.cargo) {
      const source = original.get(c.id);
      if (!source) {
        errors.push("存在未知货物。");
        continue;
      }
      const { quantity: _q, serialNumbers: _s, ...definition } = c;
      const {
        quantity: _oq,
        serialNumbers: _os,
        ...originalDefinition
      } = source;
      if (JSON.stringify(definition) !== JSON.stringify(originalDefinition))
        errors.push(`货物 ${c.name} 的规则与原始清单不一致。`);
    }
    for (const p of r.placements) {
      counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
      const c = original.get(p.cargoId);
      if (c?.serialNumbers?.length) {
        const key = `${p.cargoId}/${p.serialNumber}`;
        if (
          !p.serialNumber ||
          !c.serialNumbers.includes(p.serialNumber) ||
          serials.has(key)
        )
          errors.push("序列号缺失、未知或重复分配。");
        serials.add(key);
      }
    }
  }
  const remaining = new Map<string, number>();
  for (const u of plan.unpacked) {
    if (
      !original.has(u.cargoId) ||
      remaining.has(u.cargoId) ||
      !Number.isSafeInteger(u.quantity) ||
      u.quantity <= 0
    )
      errors.push("整批剩余清单无效。");
    remaining.set(u.cargoId, u.quantity);
  }
  for (const c of plan.cargo)
    if ((counts.get(c.id) ?? 0) + (remaining.get(c.id) ?? 0) !== c.quantity)
      errors.push(`货物 ${c.name} 的整批数量不守恒。`);
  if (plan.status === "complete" && plan.unpacked.length)
    errors.push("有未装入货物的方案不能标记为全部完成。");
  return { valid: !errors.length, errors };
}

export function packFleet(
  options: FleetOptions,
  cargo: Cargo[],
  onProgress?: (done: number, total: number) => void,
): FleetResult {
  if (
    !options.containers.length ||
    options.containers.length > 50 ||
    !Number.isSafeInteger(options.maxContainers) ||
    options.maxContainers < 1 ||
    options.maxContainers > 50
  )
    throw new Error("柜子数量必须为 1–50。");
  for (const c of options.containers) {
    const errors = validateInput(c, cargo);
    if (errors.length) throw new Error(errors.join("；"));
  }
  const plan: FleetResult = {
    schemaVersion: 2,
    cargo: structuredClone(cargo),
    options: structuredClone(options),
    results: [],
    unpacked: [],
    status: "complete",
    validation: { valid: false, errors: [] },
  };
  const left = new Map(cargo.map((c) => [c.id, c.quantity]));
  const limit =
    options.mode === "auto" ? options.maxContainers : options.containers.length;
  const solve = options.algorithm === "maxrects" ? packMaxRects : pack;
  const started = performance.now();
  for (let i = 0; i < limit; i++) {
    if (
      options.mode === "auto" &&
      i > 0 &&
      ![...left.values()].some((q) => q > 0)
    )
      break;
    if (performance.now() - started > 90000) {
      plan.status = "limit";
      break;
    }
    const template = options.containers[options.mode === "auto" ? 0 : i];
    const container = {
      ...structuredClone(template),
      id: `C${String(i + 1).padStart(3, "0")}`,
      name: `${i + 1} 号柜 · ${template.name}`,
    };
    const remaining = cargo
      .filter((c) => left.get(c.id)! > 0)
      .map((c) => ({
        ...structuredClone(c),
        quantity: left.get(c.id)!,
        serialNumbers: c.serialNumbers?.slice(c.quantity - left.get(c.id)!),
      }));
    const result = solve(container, remaining);
    if (!result.validation.valid)
      throw new Error(result.validation.errors.join("；"));
    const assigned = new Map<string, number>();
    for (const p of result.placements) {
      const c = cargo.find((c) => c.id === p.cargoId)!;
      const offset = c.quantity - left.get(c.id)! + (assigned.get(c.id) ?? 0);
      p.serialNumber = c.serialNumbers?.[offset];
      assigned.set(c.id, (assigned.get(c.id) ?? 0) + 1);
    }
    result.cargo = remaining
      .filter((c) => assigned.has(c.id))
      .map((c) => ({
        ...c,
        quantity: assigned.get(c.id)!,
        serialNumbers: c.serialNumbers?.slice(0, assigned.get(c.id)!),
      }));
    result.unpacked = [];
    result.validation = validateResult(result);
    plan.results.push(result);
    for (const [id, q] of assigned) left.set(id, left.get(id)! - q);
    onProgress?.(i + 1, limit);
    if (options.mode === "auto" && !result.placements.length) {
      plan.status = "unfit";
      break;
    }
  }
  if ([...left.values()].some((q) => q > 0) && plan.status === "complete")
    plan.status = options.mode === "auto" ? "limit" : "unfit";
  plan.unpacked = cargo
    .filter((c) => left.get(c.id)! > 0)
    .map((c) => ({
      cargoId: c.id,
      quantity: left.get(c.id)!,
      reason:
        plan.status === "limit"
          ? "达到柜数或计算预算上限，仍有货物未分配。"
          : "所选柜子的尺寸、载重、剩余空间或装载规则不足，当前方案未装入。",
    }));
  plan.validation = validateFleet(plan);
  return plan;
}
