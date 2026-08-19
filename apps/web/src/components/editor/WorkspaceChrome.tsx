import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { DocumentObject, NotebookDocument, ShapeObject } from "@notylo/document-model";
import type { SaveState } from "../../lib/session";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  PanelLeft,
  PencilLine,
  Plus,
  Redo2,
  Share2,
  Undo2
} from "lucide-react";
import { t } from "../../i18n";

export type PublicAccessMode = "read" | "write";

export function EditorHeader({
  document,
  saveState,
  onUndo,
  onRedo,
  onBack,
  onExport,
  toolsOpen,
  onToggleTools,
  readOnly = false,
  publicMode,
  onShare
}: {
  readonly document: NotebookDocument;
  readonly saveState: SaveState;
  onUndo(): void;
  onRedo(): void;
  onBack(): void;
  onExport(): void;
  readonly toolsOpen: boolean;
  readonly readOnly?: boolean;
  readonly publicMode?: PublicAccessMode;
  readonly onShare?: () => void;
  onToggleTools(): void;
}) {
  const label =
    publicMode === "read"
      ? t("header.publicReadHint")
      : publicMode === "write"
        ? saveState === "cloud-synced"
          ? t("header.changesSynced")
          : saveState === "saving"
            ? t("header.syncing")
            : saveState === "offline"
              ? t("header.offline")
              : saveState === "conflict"
                ? t("header.syncConflict")
                : saveState === "error"
                  ? t("header.syncError")
                  : t("header.publicEditable")
        : readOnly
          ? t("header.readOnly")
          : saveState === "saved"
            ? t("header.savedDevice")
            : saveState === "cloud-synced"
              ? t("header.syncedCloud")
              : saveState === "saving"
                ? t("header.saving")
                : saveState === "offline"
                  ? t("header.offline")
                  : saveState === "conflict"
                    ? t("header.syncConflict")
                    : t("header.saveError");
  const PublicModeIcon = publicMode === "read" ? Eye : PencilLine;
  const publicModeLabel = publicMode === "read" ? t("header.readOnly") : t("header.readWrite");

  return (
    <header
      className={`editor-header${publicMode ? ` public-editor-header public-editor-header--${publicMode}` : ""}`}
    >
      <button
        className="back-button"
        onClick={onBack}
        aria-label={publicMode ? t("common.backToNotylo") : t("header.backNotebooks")}
        title={publicMode ? t("common.backToNotylo") : undefined}
      >
        <ArrowLeft size={18} />
      </button>
      <div className="editor-title">
        <span className="document-kind">
          {publicMode
            ? t("header.publicKind")
            : document.notebook.mode === "book"
              ? t("header.bookKind")
              : t("header.whiteboardKind")}
        </span>
        <h1>{document.notebook.title}</h1>
      </div>
      {publicMode && (
        <div
          className={`public-mode-badge public-mode-badge--${publicMode}`}
          aria-label={publicModeLabel}
          title={publicModeLabel}
        >
          <PublicModeIcon size={14} aria-hidden="true" />
          <span aria-hidden="true">{publicModeLabel}</span>
        </div>
      )}
      <div className={`save-status ${saveState} ${publicMode ? "public-save-status" : ""}`}>
        <span>●</span>
        {label}
      </div>
      <div className="header-actions">
        {!readOnly && (
          <button
            className="mobile-tools-toggle"
            onClick={onToggleTools}
            aria-label={toolsOpen ? t("header.hideTools") : t("header.showTools")}
            aria-expanded={toolsOpen}
          >
            <PanelLeft size={17} />
          </button>
        )}
        {!readOnly && (
          <button onClick={onUndo} aria-label={t("header.undo")}>
            <Undo2 size={17} />
          </button>
        )}
        {!readOnly && (
          <button onClick={onRedo} aria-label={t("header.redo")}>
            <Redo2 size={17} />
          </button>
        )}
        {onShare && (
          <button
            className="share-button share-trigger"
            onClick={onShare}
            aria-haspopup="dialog"
            title={t("header.shareNotebook")}
          >
            <Share2 size={15} /> {t("header.share")}
          </button>
        )}
        <button className="share-button export-trigger" onClick={onExport}>
          {t("header.export")}
        </button>
      </div>
    </header>
  );
}

export function ArrowPointHandles({
  arrow,
  offsetY = 0,
  onStart
}: {
  readonly arrow: ShapeObject;
  readonly offsetY?: number | undefined;
  onStart(index: number, event: ReactPointerEvent<HTMLButtonElement>): void;
}) {
  return (
    <div className="arrow-point-handles" aria-label={t("header.arrowPoints")}>
      {arrow.points?.map((point, index) => (
        <button
          key={`${arrow.id}-${index}`}
          className={
            index === arrow.points!.length - 1 ? "arrow-point arrow-endpoint" : "arrow-point"
          }
          style={{ left: arrow.x + point.x, top: arrow.y + offsetY + point.y }}
          aria-label={
            index === 0
              ? t("header.moveArrowStart")
              : index === arrow.points!.length - 1
                ? t("header.moveArrowEnd")
                : t("header.moveArrowBend", { index })
          }
          onPointerDown={(event) => onStart(index, event)}
        />
      ))}
    </div>
  );
}

export function ToolButton({
  icon,
  label,
  active,
  onClick
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly active: boolean;
  onClick(): void;
}) {
  return (
    <button
      className={`tool-button ${active ? "active" : ""}`}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      <span>{label.split(" ")[0]}</span>
    </button>
  );
}

export function Paper({
  page,
  offsetY = 0
}: {
  readonly page: {
    readonly width: number;
    readonly height: number;
    readonly background: {
      readonly kind: string;
      readonly color: string;
      readonly lineColor?: string;
    };
  };
  readonly offsetY?: number | undefined;
}) {
  return (
    <div
      className={`paper ${page.background.kind}`}
      style={
        {
          width: page.width,
          height: page.height,
          top: offsetY,
          backgroundColor: page.background.color,
          "--line-color": page.background.lineColor ?? "#dbe7e3"
        } as CSSProperties
      }
      aria-label={t("header.paperPage")}
    />
  );
}

export function PageNavigator({
  pages,
  current,
  onChange,
  onNew,
  canAdd = true
}: {
  readonly pages: readonly { readonly id: string; readonly index: number }[];
  readonly current?: string | undefined;
  onChange(id: string): void;
  onNew(): void;
  readonly canAdd?: boolean;
}) {
  const active = pages.findIndex((page) => page.id === current);
  return (
    <div className="page-nav" onPointerDown={(event) => event.stopPropagation()}>
      <button
        disabled={active <= 0}
        onClick={() => pages[active - 1] && onChange(pages[active - 1]!.id)}
      >
        <ChevronUp size={16} />
      </button>
      <span>{t("common.page", { current: active + 1, total: pages.length })}</span>
      <button
        disabled={active >= pages.length - 1}
        onClick={() => pages[active + 1] && onChange(pages[active + 1]!.id)}
      >
        <ChevronDown size={16} />
      </button>
      {canAdd && (
        <button title={t("common.addPage")} onClick={onNew}>
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}

export type { DocumentObject };
