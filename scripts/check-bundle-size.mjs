import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const distDir = new URL("../apps/web/dist/assets/", import.meta.url);
const maxChunkBytes = Number(process.env.NOTYLO_MAX_JS_CHUNK_BYTES ?? 1_200_000);

async function collectJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory.pathname, entry.name);
    if (entry.isDirectory()) files.push(...(await collectJsFiles(new URL(`file://${path}/`))));
    else if (entry.isFile() && entry.name.endsWith(".js")) {
      const info = await stat(path);
      files.push({ path, bytes: info.size });
    }
  }
  return files;
}

let files;
try {
  files = await collectJsFiles(distDir);
} catch (error) {
  console.error("Bundle budget could not inspect apps/web/dist. Run `pnpm build` first.");
  throw error;
}

if (!files.length) {
  throw new Error("Bundle budget found no JavaScript chunks in apps/web/dist/assets.");
}

files.sort((a, b) => b.bytes - a.bytes);
console.log("Largest web JavaScript chunks:");
for (const file of files.slice(0, 10)) {
  console.log(`  ${(file.bytes / 1024).toFixed(1)} KiB  ${relative(process.cwd(), file.path)}`);
}

const oversized = files.filter((file) => file.bytes > maxChunkBytes);
if (oversized.length) {
  console.error(`\nBundle budget exceeded: JavaScript chunks must stay below ${(maxChunkBytes / 1024).toFixed(0)} KiB.`);
  for (const file of oversized) {
    console.error(`  ${(file.bytes / 1024).toFixed(1)} KiB  ${relative(process.cwd(), file.path)}`);
  }
  process.exitCode = 1;
}
