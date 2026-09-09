/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Cargo } from "../domain/types";

/** Normalized to the complete cargo envelope. Timber/support members are schematic. */
export function cargoGeometry(cargo: Cargo): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const beam = (
    x: number,
    y: number,
    z: number,
    px: number,
    py: number,
    pz: number,
  ) => {
    parts.push(new THREE.BoxGeometry(x, y, z).translate(px, py, pz));
  };
  if (cargo.shape === "cylinder")
    return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
  if (cargo.shape === "cylinder-x" || cargo.shape === "cylinder-y") {
    const diameter = cargo.cylinderDiameter!,
      length = cargo.cylinderLength!;
    const g = new THREE.CylinderGeometry(
      diameter / 2,
      diameter / 2,
      length,
      32,
    );
    if (cargo.shape === "cylinder-x") g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    g.translate(0, (cargo.size.z - diameter) / 2, 0);
    g.scale(1 / cargo.size.x, 1 / cargo.size.z, 1 / cargo.size.y);
    parts.push(g);
    const supportHeight = Math.max(
      0.015,
      (cargo.size.z - diameter) / cargo.size.z,
    );
    for (const pos of [-0.3, 0.3]) {
      if (cargo.shape === "cylinder-x")
        beam(0.08, supportHeight, 0.95, pos, -0.5 + supportHeight / 2, 0);
      else beam(0.95, supportHeight, 0.08, 0, -0.5 + supportHeight / 2, pos);
    }
  } else if (cargo.shape === "wood-box" || cargo.shape === "wood-frame") {
    if (cargo.shape === "wood-box") {
      for (let i = 0; i < 6; i++) {
        const pos = -0.5 + (i + 0.5) / 6;
        for (const side of [-0.475, 0.475]) {
          beam(0.155, 0.045, 1, pos, side, 0);
          beam(0.155, 0.91, 0.045, pos, 0, side);
          beam(0.045, 0.91, 0.155, side, 0, pos);
        }
      }
    }
    for (const y of [-0.46, 0.46]) {
      for (const z of [-0.46, 0.46]) beam(1, 0.08, 0.08, 0, y, z);
      for (const x of [-0.46, 0.46]) beam(0.08, 0.08, 1, x, y, 0);
    }
    for (const x of [-0.46, 0.46])
      for (const z of [-0.46, 0.46]) beam(0.08, 1, 0.08, x, 0, z);
    if (cargo.shape === "wood-frame")
      for (const x of [-0.23, 0, 0.23]) beam(0.1, 0.06, 0.92, x, -0.47, 0);
  } else return new THREE.BoxGeometry(1, 1, 1);
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error("货物几何合并失败");
  return merged;
}
