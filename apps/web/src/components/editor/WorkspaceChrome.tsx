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
      ? "1 doigt pour déplacer · pincer pour zoomer"
      : publicMode === "write"
        ? saveState === "cloud-synced"
          ? "Modifications synchronisées"
          : saveState === "saving"
            ? "Synchronisation…"
            : saveState === "offline"
              ? "Hors connexion"
              : saveState === "conflict"
                ? "Conflit de synchronisation"
                : saveState === "error"
                  ? "Erreur de synchronisation"
                  : "Lien public modifiable"
        : readOnly
          ? "Lecture seule"
          : saveState === "saved"
            ? "Enregistré sur cet appareil"
            : saveState === "cloud-synced"
              ? "Synchronisé dans le cloud"
              : saveState === "saving"
                ? "Sauvegarde…"
                : saveState === "offline"
                  ? "Hors connexion"
                  : saveState === "conflict"
                    ? "Conflit de synchronisation"
                    : "Erreur de sauvegarde";
  const PublicModeIcon = publicMode === "read" ? Eye : PencilLine;

  return (
    <header
      className={`editor-header${publicMode ? ` public-editor-header public-editor-header--${publicMode}` : ""}`}
    >
      <button
        className="back-button"
        onClick={onBack}
        aria-label={publicMode ? "Retour à Notylo" : "Retour aux cahiers"}
        title={publicMode ? "Retour à Notylo" : undefined}
      >
        <ArrowLeft size={18} />
      </button>
      <div className="editor-title">
        <span className="document-kind">
          {publicMode ? "LIEN PUBLIC" : document.notebook.mode === "book" ? "CAHIER" : "WHITEBOARD"}
        </span>
        <h1>{document.notebook.title}</h1>
      </div>
      {publicMode && (
        <div className={`public-mode-badge public-mode-badge--${publicMode}`}>
          <PublicModeIcon size={14} />
          <span>{publicMode === "read" ? "Lecture seule" : "Lecture et écriture"}</span>
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
            aria-label={toolsOpen ? "Masquer les outils" : "Afficher les outils"}
            aria-expanded={toolsOpen}
          >
            <PanelLeft size={17} />
          </button>
        )}
        {!readOnly && (
          <button onClick={onUndo} aria-label="Annuler">
            <Undo2 size={17} />
          </button>
        )}
        {!readOnly && (
          <button onClick={onRedo} aria-label="Rétablir">
            <Redo2 size={17} />
          </button>
        )}
        {onShare && (
          <button
            className="share-button share-trigger"
            onClick={onShare}
            aria-haspopup="dialog"
            title="Partager ce notebook"
          >
            <Share2 size={15} /> Partager
          </button>
        )}
        <button className="share-button export-trigger" onClick={onExport}>
          Exporter
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
    <div className="arrow-point-handles" aria-label="Points de la flèche">
      {arrow.points?.map((point, index) => (
        <button
          key={`${arrow.id}-${index}`}
          className={
            index === arrow.points!.length - 1 ? "arrow-point arrow-endpoint" : "arrow-point"
          }
          style={{ left: arrow.x + point.x, top: arrow.y + offsetY + point.y }}
          aria-label={
            index === 0
              ? "Déplacer le départ de la flèche"
              : index === arrow.points!.length - 1
                ? "Déplacer la pointe de la flèche"
                : `Déplacer le coude ${index}`
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
      aria-label="Page du cahier"
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
      <span>
        Page {active + 1} / {pages.length}
      </span>
      <button
        disabled={active >= pages.length - 1}
        onClick={() => pages[active + 1] && onChange(pages[active + 1]!.id)}
      >
        <ChevronDown size={16} />
      </button>
      {canAdd && (
        <button title="Ajouter une page" onClick={onNew}>
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}

export type { DocumentObject };
