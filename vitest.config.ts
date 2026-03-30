import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Run each file in its own context so module-level mocks don't leak
    isolate: true,
  },
  resolve: {
    alias: {
      // mirrors tsconfig "@/*" → "./*" and "./src/*"
      "@": path.resolve(__dirname, "."),
    },
  },
});
