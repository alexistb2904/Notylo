import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  // Tauri serves the built frontend through its app protocol. Relative asset
  // URLs prevent WebView2 from resolving /assets/* as the HTML fallback.
  base: "./",
  resolve: {
    // Workspace links and Vite's pre-bundling must resolve these packages to
    // exactly one runtime instance. Otherwise React Router hooks fail in the
    // embedded WebView with an "Invalid hook call" and leave a blank window.
    dedupe: ["react", "react-dom"]
  },
  server: { port: 5173, host: "0.0.0.0" },
  build: { sourcemap: true },
  test: { environment: "jsdom", globals: true, include: ["src/**/*.test.ts"] }
});
