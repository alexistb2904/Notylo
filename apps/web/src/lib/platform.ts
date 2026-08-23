import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

export interface PlatformAdapter {
  openFiles(accept: string, multiple?: boolean): Promise<readonly File[]>;
  saveFile(name: string, blob: Blob): Promise<void>;
  getClipboardText(): Promise<string>;
  setClipboardText(value: string): Promise<void>;
}

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function dialogFilters(accept: string) {
  const extensions = accept
    .split(",")
    .map((value) => value.trim().replace(/^\./, ""))
    .filter((value) => /^[a-z0-9]+$/i.test(value));
  return extensions.length ? [{ name: extensions.map((value) => value.toUpperCase()).join(", "), extensions }] : undefined;
}

function filename(path: string): string {
  return path.split(/[\\/]/).pop() || "imported-file";
}

const browserPlatform: PlatformAdapter = {
  openFiles(accept, multiple = false) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.click();
    });
  },
  async saveFile(name, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async getClipboardText() {
    return navigator.clipboard.readText();
  },
  async setClipboardText(value) {
    await navigator.clipboard.writeText(value);
  }
};

const tauriPlatform: PlatformAdapter = {
  async openFiles(accept, multiple = false) {
    const filters = dialogFilters(accept);
    const selection = await open({ multiple, ...(filters ? { filters } : {}) });
    const paths = selection === null ? [] : Array.isArray(selection) ? selection : [selection];
    return Promise.all(
      paths.map(async (path) =>
        new File([await readFile(path)], filename(path), { type: "application/octet-stream" })
      )
    );
  },
  async saveFile(name, blob) {
    const filters = dialogFilters(extensionOf(name));
    const path = await save({ defaultPath: name, ...(filters ? { filters } : {}) });
    if (!path) return;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  },
  getClipboardText: readText,
  setClipboardText: writeText
};

function extensionOf(name: string): string {
  const extension = name.split(".").pop();
  return extension && extension !== name ? `.${extension}` : "";
}

/**
 * Uses native dialogs, scoped filesystem access and the system clipboard in
 * Tauri; the exact same UI remains available in a normal browser.
 */
export const webPlatform: PlatformAdapter = isTauri ? tauriPlatform : browserPlatform;
