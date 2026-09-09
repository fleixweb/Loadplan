/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import type { Cargo, Container } from "./types";

// Nominal starting values, not a guarantee of the actual container's specification.
// Users must replace these with the equipment provider's usable dimensions/payload.
export const CONTAINERS: Container[] = [
  {
    id: "20GP",
    name: "20GP 标准干货柜",
    size: { x: 5898, y: 2352, z: 2393 },
    door: { width: 2340, height: 2280 },
    maxWeight: 28000,
  },
  {
    id: "40GP",
    name: "40GP 标准干货柜",
    size: { x: 12032, y: 2352, z: 2393 },
    door: { width: 2340, height: 2280 },
    maxWeight: 26500,
  },
  {
    id: "40HQ",
    name: "40HQ 高柜",
    size: { x: 12032, y: 2352, z: 2698 },
    door: { width: 2340, height: 2585 },
    maxWeight: 26500,
  },
];
export const COLORS = [
  "#b98955",
  "#64839b",
  "#93849e",
  "#bd8495",
  "#9b9a67",
  "#a28bbc",
];
export const SAMPLE_CARGO: Cargo[] = [
  {
    id: "A",
    name: "A 产品 · 标准箱",
    size: { x: 600, y: 400, z: 400 },
    quantity: 100,
    weight: 15,
    rotation: "upright",
    maxLayers: 5,
    color: COLORS[0],
  },
  {
    id: "B",
    name: "B 产品 · 长方箱",
    size: { x: 500, y: 400, z: 300 },
    quantity: 150,
    weight: 10,
    rotation: "free",
    maxLayers: 6,
    color: COLORS[1],
  },
  {
    id: "C",
    name: "C 产品 · 小型箱",
    size: { x: 400, y: 300, z: 300 },
    quantity: 200,
    weight: 8,
    rotation: "upright",
    maxLayers: 4,
    color: COLORS[2],
  },
];
export const cloneSample = () => ({
  container: structuredClone(CONTAINERS[0]),
  cargo: structuredClone(SAMPLE_CARGO),
});
export const volume = (s: { x: number; y: number; z: number }) =>
  (s.x * s.y * s.z) / 1e9;
