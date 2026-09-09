import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"] },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        license: fileURLToPath(new URL('./license.html', import.meta.url)),
      },
      output: {
        manualChunks: (id: string) =>
          id.includes("/three/") ? "three" : undefined,
      },
    },
  },
});
