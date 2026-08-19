import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { createNotezip } from "@notylo/import-export";
import type { NotebookDocument } from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { webPlatform } from "../lib/platform";
import { t } from "../i18n";

const repository = new NotebookRepository();

export function ExportDialog({
  document,
  onClose
}: {
  readonly document: NotebookDocument;
  onClose(): void;
}) {
  const capture = async () => {
    const surface = window.document.querySelector<HTMLElement>(".canvas-area");
    if (!surface) throw new Error(t("export.captureUnavailable"));
    return html2canvas(surface, {
      backgroundColor: "#e4e8e5",
      scale: 2,
      ignoreElements: (element) =>
        element.classList.contains("zoom-controls") ||
        element.classList.contains("page-nav") ||
        element.classList.contains("whiteboard-coordinate")
    });
  };
  const png = async () => {
    const canvas = await capture();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(t("export.pngFailed"));
    await webPlatform.saveFile(`${safeName(document.notebook.title)}.png`, blob);
  };
  const pdf = async () => {
    const canvas = await capture();
    const pdfDocument = new jsPDF({
      orientation: canvas.width > canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
      compress: true
    });
    pdfDocument.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    await webPlatform.saveFile(
      `${safeName(document.notebook.title)}.pdf`,
      pdfDocument.output("blob")
    );
  };
  const native = async () => {
    const assets = (
      await Promise.all(
        document.assets.map(async (metadata) => {
          const stored = await repository.getAsset(metadata.id);
          return stored ? { metadata, blob: stored.blob } : undefined;
        })
      )
    ).filter((asset): asset is { metadata: NotebookDocument["assets"][number]; blob: Blob } =>
      Boolean(asset)
    );
    await webPlatform.saveFile(
      `${safeName(document.notebook.title)}.notezip`,
      await createNotezip(document, assets)
    );
  };
  const perform = async (action: () => Promise<void>) => {
    try {
      await action();
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : t("export.failed"));
    }
  };
  return (
    <div className="export-popover" role="dialog" aria-label={t("export.dialogAria")}>
      <p className="eyebrow">{t("export.localCopy")}</p>
      <h2>{t("common.export")}</h2>
      <button onClick={() => void perform(png)}>
        <span>PNG</span>{t("export.currentView")}
      </button>
      <button onClick={() => void perform(pdf)}>
        <span>PDF</span>{t("export.printable")}
      </button>
      <button onClick={() => void perform(native)}>
        <span>NOTEZIP</span>{t("export.completeBackup")}
      </button>
      <button className="close-export" onClick={onClose}>
        {t("common.close")}
      </button>
    </div>
  );
}
function safeName(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "notylo";
}
