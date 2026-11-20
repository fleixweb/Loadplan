import * as THREE from "three";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { cargoGeometry } from "../components/cargoGeometry";
import { saveFile } from "../platform/files";
import type { PackingResult } from "./types";
import { validateResult } from "./packing";

const safe = (s: string) =>
  s.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, "_").slice(0, 140);
export function buildModel(result: PackingResult, frame = false): THREE.Group {
  const validation = validateResult(result);
  if (!validation.valid) throw new Error(validation.errors.join("；"));
  const group = new THREE.Group();
  for (const c of result.cargo) {
    const geometry = cargoGeometry(c);
    const material = new THREE.MeshStandardMaterial({
      color: c.color,
      roughness: 0.85,
      name: `cargo_${safe(c.id)}`,
    });
    for (const p of result.placements.filter((p) => p.cargoId === c.id)) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = safe(
        `${result.container.id}_${c.model ?? c.name}_${p.serialNumber ?? p.boxId}`,
      );
      mesh.scale.set(p.size.x, p.size.z, p.size.y);
      mesh.position.set(
        p.position.x + p.size.x / 2,
        p.position.z + p.size.z / 2,
        p.position.y + p.size.y / 2,
      );
      group.add(mesh);
    }
    if (!result.placements.some((p) => p.cargoId === c.id)) {
      geometry.dispose();
      material.dispose();
    }
  }
  if (frame) {
    const { x, y, z } = result.container.size;
    const material = new THREE.MeshStandardMaterial({
      color: "#686868",
      name: "container_frame",
    });
    const thickness = 8;
    const beam = (
      sx: number,
      sy: number,
      sz: number,
      px: number,
      py: number,
      pz: number,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(px, py, pz);
      mesh.name = `frame_${group.children.length}`;
      group.add(mesh);
    };
    for (const h of [0, z])
      for (const w of [0, y]) beam(x, thickness, thickness, x / 2, h, w);
    for (const l of [0, x])
      for (const w of [0, y]) beam(thickness, z, thickness, l, z / 2, w);
    for (const l of [0, x])
      for (const h of [0, z]) beam(thickness, thickness, y, l, h, y / 2);
  }
  group.updateMatrixWorld(true);
  return group;
}
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
        (m) => materials.add(m),
      );
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
export function modelFiles(result: PackingResult, frame: boolean) {
  const model = buildModel(result, frame);
  try {
    const name = safe(result.container.id);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) materials.set(o.material.name, o.material);
    });
    const mtl = [...materials]
      .map(([name, m]) => {
        const rgb = m.color.clone().convertLinearToSRGB();
        return `newmtl ${name}\nKd ${rgb.r} ${rgb.g} ${rgb.b}\nKa 0.1 0.1 0.1\nd 1\n`;
      })
      .join("\n");
    return {
      name,
      obj: `# Loadplan; units: millimeters; Y up; X length, Z width; origin: container inner corner\nmtllib ${name}.mtl\n${new OBJExporter().parse(model)}`,
      mtl,
    };
  } finally {
    disposeModel(model);
  }
}
export async function exportModels(
  results: PackingResult[],
  frame: boolean,
  withMaterials: boolean,
) {
  if (results.length === 1 && !withMaterials) {
    const file = modelFiles(results[0], frame);
    return saveFile(
      new Blob(
        [file.obj.replace(/^mtllib .*\n/m, "").replace(/^usemtl .*\n/gm, "")],
        { type: "text/plain" },
      ),
      `${file.name}.obj`,
    );
  }
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(
      "Loadplan OBJ export\nUnits: millimeters. Y up. X = container length, Z = container width. Origin = inner corner.\nModels use exact packing dimensions, all layers. Supports are schematic.\n",
    ),
  };
  for (const result of results) {
    const f = modelFiles(result, frame);
    files[`${f.name}.obj`] = strToU8(
      withMaterials
        ? f.obj
        : f.obj.replace(/^mtllib .*\n/m, "").replace(/^usemtl .*\n/gm, ""),
    );
    if (withMaterials) files[`${f.name}.mtl`] = strToU8(f.mtl);
  }
  return saveFile(
    new Blob([new Uint8Array(zipSync(files))]),
    "Loadplan-OBJ.zip",
  );
}

export function renderModel(result: PackingResult): string {
  const model = buildModel(result, true);
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(1200, 650);
    renderer.setClearColor("#f4f4f5");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    model.scale.setScalar(0.001);
    const s = result.container.size;
    model.position.set(-s.x / 2000, 0, -s.y / 2000);
    scene.add(model);
    scene.add(new THREE.HemisphereLight("#ffffff", "#999999", 2.4));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(-4, 9, 5);
    scene.add(light);
    const extent = Math.max(s.x, s.y, s.z * 1.6) / 1000;
    const camera = new THREE.PerspectiveCamera(
      36,
      1200 / 650,
      extent / 1000,
      extent * 100,
    );
    camera.position.set(extent * 0.95, extent * 0.85, extent * 1.2);
    camera.lookAt(0, s.z / 2000, 0);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    disposeModel(model);
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
