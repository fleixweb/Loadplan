import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("/three/") ? "three" : undefined,
      },
    },
  },
});
