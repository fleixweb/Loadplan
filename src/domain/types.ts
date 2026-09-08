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
