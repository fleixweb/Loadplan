import { expect, it } from "vitest";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { Box3, Vector3 } from "three";
import { modelFiles, disposeModel } from "../src/domain/modelExport";
import { pack } from "../src/domain/packing";
import { CONTAINERS, SAMPLE_CARGO } from "../src/domain/sample";

it("OBJ 展开所有实例、保留精确尺寸与编号，能由独立解析器重新读取", () => {
  const cargo = {
    ...SAMPLE_CARGO[0],
    quantity: 2,
    size: { x: 600, y: 400, z: 400 },
    maxLayers: 2,
  };
  const result = pack(CONTAINERS[0], [cargo]);
  result.placements[0].serialNumber = "SN001";
  const files = modelFiles(result, false);
  expect(files.obj).toContain("SN001");
  expect(files.obj).toContain("units: millimeters");
  const model = new OBJLoader().parse(files.obj);
  expect(model.children).toHaveLength(2);
  const size = new Box3()
    .setFromObject(model.children[0])
    .getSize(new Vector3());
  expect(size.toArray()).toEqual([600, 400, 400]);
  const second = new Box3().setFromObject(model.children[1]);
  const first = new Box3().setFromObject(model.children[0]);
  expect(second.min.toArray()).not.toEqual(first.min.toArray());
  expect(files.mtl).toContain("Kd ");
  disposeModel(model);
});

it("柜体框架是可选模型，非法结果不能导出", () => {
  const result = pack(CONTAINERS[0], [{ ...SAMPLE_CARGO[0], quantity: 1 }]);
  const model = new OBJLoader().parse(modelFiles(result, true).obj);
  expect(model.children).toHaveLength(13);
  disposeModel(model);
  result.placements[0].position.x = 999999;
  expect(() => modelFiles(result, false)).toThrow();
});
