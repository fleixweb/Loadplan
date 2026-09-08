import { pack } from "./packing";
import type { Cargo, Container } from "./types";

self.onmessage = (
  event: MessageEvent<{ container: Container; cargo: Cargo[] }>,
) => {
  try {
    self.postMessage({ result: pack(event.data.container, event.data.cargo) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "计算失败，请检查输入。",
    });
  }
};
