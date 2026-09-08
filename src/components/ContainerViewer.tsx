import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Camera,
  Layers3,
  Maximize,
  RotateCcw,
  Scan,
  Square,
  View,
} from "lucide-react";
import type { PackingResult, Placement } from "../domain/types";
import { cargoGeometry } from "./cargoGeometry";

interface Props {
  result: PackingResult;
  onSelect: (box: Placement | null) => void;
  selected: string | null;
  stale: boolean;
}
interface SceneApi {
  view: (preset: string) => void;
  save: () => void;
  filter: (layer: number) => void;
  walls: (on: boolean) => void;
  select: (id: string | null) => void;
}

export default function ContainerViewer({
  result,
  onSelect,
  selected,
  stale,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const selectCallback = useRef(onSelect);
  selectCallback.current = onSelect;
  const [layer, setLayer] = useState(0);
  const [wall, setWall] = useState(false);
  const [preset, setPreset] = useState("iso");
  const [webglError, setWebglError] = useState("");
  const maxLayer = Math.max(1, ...result.placements.map((p) => p.layer));

  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglError(
        "当前浏览器无法启用 3D 图形。计算结果仍可在下方表格查看和导出。",
      );
      return;
    }
    setWebglError("");
    setLayer(0);
    setPreset("iso");
    setWall(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#eef2ef", 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "集装箱三维装载图，拖动旋转，滚轮缩放，点击纸箱查看详情",
    );
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 180);
    const control = new OrbitControls(camera, renderer.domElement);
    control.enableDamping = true;
    control.dampingFactor = 0.09;
    control.maxPolarAngle = Math.PI / 2 + 0.13;
    control.minDistance = 1;
    control.maxDistance = 38;
    scene.add(new THREE.HemisphereLight("#ffffff", "#adb9af", 2.4));
    const light = new THREE.DirectionalLight("#fff8e7", 3.2);
    light.position.set(-4, 9, 5);
    scene.add(light);
    const fill = new THREE.DirectionalLight("#dde8f0", 1.2);
    fill.position.set(5, 2, -5);
    scene.add(fill);
    const { x, y, z } = result.container.size;
    const L = x / 1000,
      W = y / 1000,
      H = z / 1000;
    const extent = Math.max(L, W, H * 1.6);
    camera.near = extent / 10000;
    camera.far = extent * 100;
    control.minDistance = extent * 0.08;
    control.maxDistance = extent * 12;
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const edgeGeometry = new THREE.EdgesGeometry(boxGeometry);
    const wallGroup = new THREE.Group();
    const addWall = (
      sx: number,
      sy: number,
      sz: number,
      px: number,
      py: number,
      pz: number,
    ) => {
      const m = new THREE.Mesh(
        boxGeometry,
        new THREE.MeshStandardMaterial({
          color: "#799b92",
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, pz);
      wallGroup.add(m);
    };
    addWall(L, H, 0.012, 0, H / 2, -W / 2);
    addWall(L, H, 0.012, 0, H / 2, W / 2);
    addWall(0.012, H, W, -L / 2, H / 2, 0);
    wallGroup.visible = false;
    scene.add(wallGroup);
    const frame = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: "#638278",
        transparent: true,
        opacity: 0.6,
      }),
    );
    frame.scale.set(L, H, W);
    frame.position.y = H / 2;
    scene.add(frame);
    const floor = new THREE.Mesh(
      boxGeometry,
      new THREE.MeshStandardMaterial({ color: "#ccd6ce", roughness: 1 }),
    );
    floor.scale.set(L + 0.09, 0.045, W + 0.09);
    floor.position.y = -0.03;
    scene.add(floor);
    const grid = new THREE.GridHelper(30, 60, "#cdd8d0", "#e0e7e1");
    grid.position.y = -0.058;
    scene.add(grid);
    const door = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({ color: "#2b7967" }),
    );
    door.scale.set(
      0.018,
      result.container.door.height / 1000,
      result.container.door.width / 1000,
    );
    door.position.set(L / 2 + 0.018, result.container.door.height / 2000, 0);
    scene.add(door);

    // Business coordinates: X length / Y width / Z up -> Three.js X / Z / Y.
    const location = (p: Placement) =>
      new THREE.Vector3(
        (p.position.x + p.size.x / 2) / 1000 - L / 2,
        (p.position.z + p.size.z / 2) / 1000,
        (p.position.y + p.size.y / 2) / 1000 - W / 2,
      );
    const objects: THREE.InstancedMesh[] = [];
    const entries: {
      mesh: THREE.InstancedMesh;
      boxes: Placement[];
      matrices: THREE.Matrix4[];
    }[] = [];
    const dummy = new THREE.Object3D();
    for (const cargo of result.cargo) {
      const boxes = result.placements.filter((p) => p.cargoId === cargo.id);
      if (!boxes.length) continue;
      const material = new THREE.MeshStandardMaterial({
        color:
          cargo.shape === "wood-box" || cargo.shape === "wood-frame"
            ? "#b99061"
            : cargo.color,
        roughness: 0.85,
        metalness: 0.01,
      });
      const geometry = cargoGeometry(cargo);
      const mesh = new THREE.InstancedMesh(geometry, material, boxes.length);
      const matrices: THREE.Matrix4[] = [];
      for (let i = 0; i < boxes.length; i++) {
        const p = boxes[i];
        dummy.position.copy(location(p));
        dummy.scale.set(
          Math.max(0.001, p.size.x / 1000 - 0.006),
          Math.max(0.001, p.size.z / 1000 - 0.006),
          Math.max(0.001, p.size.y / 1000 - 0.006),
        );
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.boxes = boxes;
      scene.add(mesh);
      objects.push(mesh);
      entries.push({ mesh, boxes, matrices });
    }
    renderer.domElement.dataset.cylinderCount = String(
      result.placements.filter((p) =>
        result.cargo
          .find((c) => c.id === p.cargoId)
          ?.shape?.startsWith("cylinder"),
      ).length,
    );
    const highlight = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: "#133f35",
        linewidth: 2,
        depthTest: false,
      }),
    );
    highlight.renderOrder = 5;
    highlight.visible = false;
    scene.add(highlight);
    let visibleLayer = 0;
    const drawSelection = (id: string | null) => {
      const p = result.placements.find((b) => b.boxId === id);
      highlight.visible = !!p && (!visibleLayer || p.layer <= visibleLayer);
      if (p) {
        highlight.position.copy(location(p));
        highlight.scale.set(
          p.size.x / 1000 + 0.004,
          p.size.z / 1000 + 0.004,
          p.size.y / 1000 + 0.004,
        );
      }
    };
    let currentView = "iso";
    const fitView = (view: string) => {
      currentView = view;
      const narrow = Math.min(1, Math.max(0.4, camera.aspect));
      const d = (extent * 1.75) / narrow;
      control.target.set(0, H * 0.36, 0);
      camera.up.set(0, 1, 0);
      if (view === "top") camera.position.set(0, d, 0.001);
      else if (view === "side") camera.position.set(0, H * 0.5, d);
      else camera.position.set(d * 0.56, d * 0.57, d * 0.72);
      camera.lookAt(control.target);
      control.update();
    };
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      fitView(currentView);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    fitView("iso");
    const ray = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(objects, false)[0];
      const p =
        hit && hit.instanceId != null
          ? (hit.object.userData.boxes[hit.instanceId] as Placement)
          : null;
      selectCallback.current(p);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    const contextLost = (e: Event) => {
      e.preventDefault();
      setWebglError("3D 图形连接中断，请刷新页面。下方计算结果仍然可用。");
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      control.update();
      renderer.render(scene, camera);
    };
    draw();
    api.current = {
      view: fitView,
      walls: (on) => {
        wallGroup.visible = on;
      },
      select: drawSelection,
      filter: (n) => {
        visibleLayer = n;
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (const entry of entries) {
          entry.boxes.forEach((p, i) =>
            entry.mesh.setMatrixAt(
              i,
              !n || p.layer <= n ? entry.matrices[i] : hidden,
            ),
          );
          entry.mesh.instanceMatrix.needsUpdate = true;
        }
        highlight.visible = false;
      },
      save: () => {
        renderer.render(scene, camera);
        const a = document.createElement("a");
        a.href = renderer.domElement.toDataURL("image/png");
        a.download = `装柜视图-${result.container.id}.png`;
        a.click();
      },
    };
    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      observer.disconnect();
      control.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          (Array.isArray(m.material) ? m.material : [m.material]).forEach(
            (mat) => materials.add(mat),
          );
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [result]);

  useEffect(() => {
    api.current?.select(selected);
  }, [selected]);
  const setView = (name: string) => {
    setPreset(name);
    api.current?.view(name);
  };
  return (
    <section className="viewer" aria-label="三维装载预览">
      <div className="viewer-toolbar">
        <div className="segmented">
          <button
            aria-pressed={preset === "iso"}
            onClick={() => setView("iso")}
          >
            <View size={15} />
            透视
          </button>
          <button
            aria-pressed={preset === "top"}
            onClick={() => setView("top")}
          >
            <Scan size={15} />
            俯视
          </button>
          <button
            aria-pressed={preset === "side"}
            onClick={() => setView("side")}
          >
            <Square size={15} />
            侧视
          </button>
        </div>
        <div className="viewer-actions">
          <button
            className={wall ? "active" : ""}
            aria-pressed={wall}
            onClick={() => {
              setWall(!wall);
              api.current?.walls(!wall);
            }}
            title="显示或隐藏柜壁"
          >
            <Maximize size={16} />
            <span>柜壁</span>
          </button>
          <button
            title="重置视角"
            aria-label="重置视角"
            onClick={() => setView("iso")}
          >
            <RotateCcw size={16} />
          </button>
          <button
            title="下载当前视图 PNG"
            aria-label="下载当前视图 PNG"
            disabled={stale || !!webglError}
            onClick={() => api.current?.save()}
          >
            <Camera size={17} />
          </button>
        </div>
      </div>
      <div className="scene" ref={mount} data-testid="scene" />
      {webglError && (
        <div className="webgl-error" role="status">
          {webglError}
        </div>
      )}
      <div className="scene-caption">
        <span className="caption-line" />
        {result.container.name}
        <small>
          {(result.container.size.x / 1000).toFixed(2)} ×{" "}
          {(result.container.size.y / 1000).toFixed(2)} ×{" "}
          {(result.container.size.z / 1000).toFixed(2)} m
        </small>
      </div>
      <div className="axis-label">X 柜长 · Y 柜宽 · Z 高度</div>
      {result.cargo.some(
        (c) => c.shape?.startsWith("cylinder") || c.shape?.startsWith("wood"),
      ) && (
        <p className="cylinder-caption">
          按整体长方体占位 · 木架与防滚支架仅示意
        </p>
      )}
      <div className="viewer-bottom">
        <div className="layer-control">
          <Layers3 size={17} />
          <label htmlFor="layer">显示层数</label>
          <input
            id="layer"
            type="range"
            min={0}
            max={maxLayer}
            value={layer}
            onChange={(e) => {
              const n = +e.target.value;
              setLayer(n);
              api.current?.filter(n);
              selectCallback.current(null);
            }}
          />
          <output>{layer ? `≤ 第 ${layer} 层` : "全部"}</output>
        </div>
        <span className="gesture-hint">拖动旋转 · 滚轮缩放 · 点击选箱</span>
      </div>
    </section>
  );
}
