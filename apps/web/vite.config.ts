import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  base: process.env.VITE_TAURI_BUILD === "true" ? "./" : "/",
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  server: { port: 5173, host: "0.0.0.0" },
  build: { sourcemap: true },
  test: { environment: "jsdom", globals: true, include: ["src/**/*.test.ts"] }
});
