import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const command = process.argv[2];
if (command !== "dev" && command !== "build") {
  throw new Error("Usage: node scripts/web.mjs <dev|build>");
}

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("pnpm", ["--dir", "../web", command], {
  cwd: desktopDirectory,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_API_URL: process.env.NOTYLO_DESKTOP_API_URL ?? "https://notes.alexistb.com/api",
    VITE_TAURI_BUILD: "true"
  }
});

if (result.error) throw result.error;
if (result.status === 0 && command === "build") {
  // Start each packaged release from a versioned document. WebView2 otherwise
  // may reuse an older cached index.html whose asset URLs no longer exist.
  const { version } = JSON.parse(readFileSync(resolve(desktopDirectory, "package.json"), "utf8"));
  copyFileSync(
    resolve(desktopDirectory, "../web/dist/index.html"),
    resolve(desktopDirectory, `../web/dist/notylo-${version}.html`)
  );
}
process.exit(result.status ?? 1);
