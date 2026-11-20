/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Container {
  id: string;
  name: string;
  size: Vec3;
  door: { width: number; height: number };
  maxWeight: number;
  clearance?: { walls: number; door: number; between: number };
}
export interface Cargo {
  id: string;
  name: string;
  size: Vec3;
  quantity: number;
  weight: number;
  rotation: "upright" | "free";
  maxLayers: number;
  stackable?: boolean;
  bottomOnly?: boolean;
  maxStackWeight?: number;
  loadUnit?: "carton" | "pallet";
  // Cylinder size stores diameter/diameter/height; positions remain envelope corners.
  shape?:
    | "box"
    | "bounding-box"
    | "cylinder"
    | "cylinder-x"
    | "cylinder-y"
    | "wood-box"
    | "wood-frame";
  cylinderDiameter?: number;
  cylinderLength?: number;
  bodySize?: Vec3;
  support?: boolean;
  model?: string;
  originalUnit?: string;
  serialNumbers?: string[];
  sources?: { sheet: string; row: number }[];
  color: string;
}
export interface Placement {
  boxId: string;
  cargoId: string;
  containerId: string;
  position: Vec3;
  size: Vec3;
  weight: number;
  layer: number;
  stackId: string;
  serialNumber?: string;
}
export interface Unpacked {
  cargoId: string;
  quantity: number;
  reason: string;
}
export interface ValidationReport {
  valid: boolean;
  errors: string[];
}
export interface PackingResult {
  schemaVersion: 1;
  container: Container;
  cargo: Cargo[];
  placements: Placement[];
  unpacked: Unpacked[];
  strategy: string;
  validation: ValidationReport;
}

export interface FleetOptions {
  mode: "fixed" | "auto";
  containers: Container[];
  maxContainers: number;
  algorithm: "baseline" | "maxrects";
  /** Auto mode tries the listed container templates in this order. */
  containerPriority?: string[];
  autoPreference?: "load-more" | "priority";
}
export interface FleetResult {
  schemaVersion: 2;
  cargo: Cargo[];
  options: FleetOptions;
  results: PackingResult[];
  unpacked: Unpacked[];
  status: "complete" | "limit" | "unfit";
  validation: ValidationReport;
}
