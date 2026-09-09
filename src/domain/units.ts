/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import type { Cargo } from "./types";

export function countUnit(cargo: Cargo[]): "箱" | "托" | "件" {
  if (!cargo.length) return "件";
  if (cargo.every((c) => c.loadUnit === "pallet")) return "托";
  if (
    cargo.every(
      (c) =>
        c.loadUnit !== "pallet" &&
        !c.shape?.startsWith("cylinder") &&
        c.shape !== "wood-box" &&
        c.shape !== "wood-frame" &&
        c.shape !== "bounding-box",
    )
  )
    return "箱";
  return "件";
}
