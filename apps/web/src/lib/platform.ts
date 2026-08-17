export interface PlatformAdapter {
  openFiles(accept: string, multiple?: boolean): Promise<readonly File[]>;
  saveFile(name: string, blob: Blob): Promise<void>;
  getClipboardText(): Promise<string>;
  setClipboardText(value: string): Promise<void>;
}

export const webPlatform: PlatformAdapter = {
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
