#!/usr/bin/env bash
set -euo pipefail

build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT

tar \
  --exclude='./.git' \
  --exclude='./.pnpm-store' \
  --exclude='./.corepack-cache' \
  --exclude='./.playwright-cli' \
  --exclude='./node_modules' \
  --exclude='*/node_modules' \
  --exclude='./apps/desktop/src-tauri/target' \
  --exclude='./output' \
  -C /workspace -cf - . \
  | tar -C "$build_dir" -xf -

pnpm config set store-dir "${PNPM_HOME}/store"
cd "$build_dir"
pnpm install --frozen-lockfile
pnpm --dir apps/desktop build:linux

output_dir="/workspace/output/desktop-bundles"
mkdir -p "$output_dir"
cp -a apps/desktop/src-tauri/target/release/bundle/. "$output_dir/"
