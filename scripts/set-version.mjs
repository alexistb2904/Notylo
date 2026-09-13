import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedVersion = process.argv[2];
const checkOnly = requestedVersion === "--check";

const rootPackagePath = resolve(root, "package.json");
const webPackagePath = resolve(root, "apps/web/package.json");
const desktopPackagePath = resolve(root, "apps/desktop/package.json");
const tauriConfigPath = resolve(root, "apps/desktop/src-tauri/tauri.conf.json");
const cargoTomlPath = resolve(root, "apps/desktop/src-tauri/Cargo.toml");
const cargoLockPath = resolve(root, "apps/desktop/src-tauri/Cargo.lock");

const rootPackage = await readJson(rootPackagePath);
const expectedVersion = checkOnly ? rootPackage.version : requestedVersion;

if (!expectedVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion)) {
  throw new Error("Usage: pnpm version:notylo <semver> (example: 1.1.0 or 1.1.0-beta.1)");
}

const webPackage = await readJson(webPackagePath);
const desktopPackage = await readJson(desktopPackagePath);
const tauriConfig = await readJson(tauriConfigPath);
const cargoToml = await readFile(cargoTomlPath, "utf8");
const cargoLock = await readFile(cargoLockPath, "utf8");

const current = {
  root: rootPackage.version,
  web: webPackage.version,
  desktop: desktopPackage.version,
  tauri: tauriConfig.version,
  tauriWindow: tauriConfig.app?.windows?.[0]?.url,
  cargo: packageVersionFromCargoToml(cargoToml),
  cargoLock: packageVersionFromCargoLock(cargoLock)
};

const expectedWindow = `notylo-${expectedVersion}.html`;
const mismatches = Object.entries(current).filter(([key, value]) =>
  key === "tauriWindow" ? value !== expectedWindow : value !== expectedVersion
);

if (checkOnly) {
  if (mismatches.length) {
    const details = mismatches.map(([key, value]) => `  ${key}: ${String(value)}`).join("\n");
    throw new Error(`Notylo versions are out of sync. Expected ${expectedVersion}:\n${details}`);
  }
  console.log(`Notylo version ${expectedVersion} is synchronized.`);
  process.exit(0);
}

rootPackage.version = expectedVersion;
webPackage.version = expectedVersion;
desktopPackage.version = expectedVersion;
tauriConfig.version = expectedVersion;
if (!tauriConfig.app?.windows?.[0]) throw new Error("Tauri main window configuration is missing.");
tauriConfig.app.windows[0].url = expectedWindow;

const nextCargoToml = replaceCargoPackageVersion(cargoToml, expectedVersion);
const nextCargoLock = replaceCargoLockPackageVersion(cargoLock, expectedVersion);

await Promise.all([
  writeJson(rootPackagePath, rootPackage),
  writeJson(webPackagePath, webPackage),
  writeJson(desktopPackagePath, desktopPackage),
  writeJson(tauriConfigPath, tauriConfig),
  writeFile(cargoTomlPath, nextCargoToml),
  writeFile(cargoLockPath, nextCargoLock)
]);

console.log(`Notylo version synchronized to ${expectedVersion}.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function packageVersionFromCargoToml(source) {
  const packageSection = source.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  return packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
}

function packageVersionFromCargoLock(source) {
  return source.match(/\[\[package\]\]\s*\nname = "notylo"\s*\nversion = "([^"]+)"/)?.[1];
}

function replaceCargoPackageVersion(source, version) {
  const packageSection = source.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[0];
  if (!packageSection) throw new Error("Cargo.toml [package] section is missing.");
  const updated = packageSection.replace(/(^version\s*=\s*")[^"]+("$)/m, `$1${version}$2`);
  if (updated === packageSection && packageVersionFromCargoToml(source) !== version) {
    throw new Error("Unable to update Cargo.toml package version.");
  }
  return source.replace(packageSection, updated);
}

function replaceCargoLockPackageVersion(source, version) {
  const pattern = /(\[\[package\]\]\s*\nname = "notylo"\s*\nversion = ")[^"]+("\s*\n)/;
  if (!pattern.test(source)) throw new Error("Notylo package entry is missing from Cargo.lock.");
  return source.replace(pattern, `$1${version}$2`);
}
