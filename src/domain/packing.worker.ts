import { pack } from "./packing";
import { compareAlgorithms } from "./comparison";
import { runCaseSuite } from "./cases";
import type { PackingRequest, PackingResponse } from "./worker-protocol";

self.onmessage = (event: MessageEvent<PackingRequest>) => {
  try {
    const request = event.data;
    const response: PackingResponse =
      request.task === "suite"
        ? { suite: runCaseSuite() }
        : request.task === "compare"
          ? { runs: compareAlgorithms(request.container, request.cargo) }
          : { result: pack(request.container, request.cargo) };
    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "计算失败，请检查输入。",
    });
  }
};
