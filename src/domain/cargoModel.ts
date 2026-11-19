import type { Cargo, Vec3 } from "./types";

export const SHAPES = [
  ["box", "长方体包装"],
  ["bounding-box", "异形外接长方体"],
  ["cylinder", "圆柱（直立）"],
  ["cylinder-x", "圆柱（沿柜长横放）"],
  ["cylinder-y", "圆柱（沿柜宽横放）"],
  ["wood-box", "木箱"],
  ["wood-frame", "木架"],
] as const;
export const isCylinder = (c: Cargo) =>
  typeof c.shape === "string" && c.shape.startsWith("cylinder");

export function bodySize(c: Cargo): Vec3 {
  if (isCylinder(c)) {
    const d =
      c.cylinderDiameter ??
      (c.shape === "cylinder" ? c.size.x : Math.min(c.size.y, c.size.z));
    const length =
      c.cylinderLength ??
      (c.shape === "cylinder"
        ? c.size.z
        : c.size[c.shape === "cylinder-x" ? "x" : "y"]);
    return c.shape === "cylinder-x"
      ? { x: length, y: d, z: d }
      : c.shape === "cylinder-y"
        ? { x: d, y: length, z: d }
        : { x: d, y: d, z: length };
  }
  return { ...(c.bodySize ?? c.size) };
}

export function changeCargo(c: Cargo, patch: Partial<Cargo>): Cargo {
  let next = { ...c, ...patch };
  if (patch.shape !== undefined && patch.shape !== c.shape) {
    const oldBody = bodySize(c);
    const wasCylinder = isCylinder(c);
    const d = wasCylinder
      ? (c.cylinderDiameter ?? oldBody.x)
      : patch.shape === "cylinder"
        ? Math.max(oldBody.x, oldBody.y)
        : Math.min(oldBody.x, oldBody.y, oldBody.z);
    const length = wasCylinder
      ? (c.cylinderLength ??
        (c.shape === "cylinder"
          ? oldBody.z
          : oldBody[c.shape === "cylinder-x" ? "x" : "y"]))
      : patch.shape === "cylinder"
        ? oldBody.z
        : oldBody[patch.shape === "cylinder-y" ? "y" : "x"];
    next = {
      ...next,
      support: false,
      bodySize: { ...c.size },
      cylinderDiameter: d,
      cylinderLength: length,
    };
    if (isCylinder(next))
      Object.assign(next, {
        rotation: "upright",
        stackable: false,
        bottomOnly: false,
        loadUnit: "carton",
      });
    next = { ...next, ...patch };
  }
  if (patch.loadUnit === "pallet" && isCylinder(next)) {
    next = { ...next, shape: "box", support: false, bodySize: { ...c.size } };
  }
  const body = bodySize(next);
  next.bodySize = body;
  if (!next.support) next.size = { ...body };
  else if (
    !c.support ||
    patch.cylinderDiameter !== undefined ||
    patch.cylinderLength !== undefined ||
    patch.bodySize !== undefined
  ) {
    next.size = {
      x: Math.max(next.size.x, body.x),
      y: Math.max(next.size.y, body.y),
      z: Math.max(next.size.z, body.z),
    };
  }
  return next;
}

export function cargoIssues(c: Cargo): string[] {
  const issues: string[] = [];
  const b = bodySize(c);
  if (![b.x, b.y, b.z].every((n) => Number.isFinite(n) && n > 0))
    issues.push("请填写完整的正数尺寸。");
  if (!Number.isFinite(c.weight) || c.weight <= 0)
    issues.push("请补充每个装运单位的毛重。");
  if (
    c.support &&
    ["x", "y", "z"].some(
      (axis) => c.size[axis as keyof Vec3] < b[axis as keyof Vec3],
    )
  )
    issues.push("含支架整体占位不能小于产品本体尺寸。");
  if (c.serialNumbers?.length && c.serialNumbers.length !== c.quantity)
    issues.push("序列号数量必须与货物数量一致。");
  return issues;
}
