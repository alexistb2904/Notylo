import {
  Download,
  Eraser,
  Hand,
  Highlighter,
  LassoSelect,
  MousePointer2,
  Paintbrush,
  Pencil,
  PenLine,
  Settings2,
  Shapes,
  Table2,
  Type,
  Variable
} from "lucide-react";
import type { Tool } from "./types";
import { ToolButton } from "./WorkspaceChrome";

interface Props {
  readonly tool: Tool;
  readonly showBrushes: boolean;
  readonly showIcons: boolean;
  readonly inspectorOpen: boolean;
  onToolChange(tool: Tool): void;
  onToggleBrushes(): void;
  onToggleIcons(): void;
  onImport(): void;
  onToggleInspector(): void;
}

export function EditorToolRail({
  tool,
  showBrushes,
  showIcons,
  inspectorOpen,
  onToolChange,
  onToggleBrushes,
  onToggleIcons,
  onImport,
  onToggleInspector
}: Props) {
  return (
    <aside className={`tool-rail ${inspectorOpen ? "inspector-open" : ""}`} aria-label="Outils">
      <ToolButton
        icon={<MousePointer2 />}
        label="Sélection (V)"
        active={tool === "select"}
        onClick={() => onToolChange("select")}
      />
      <ToolButton
        icon={<LassoSelect />}
        label="Lasso"
        active={tool === "lasso"}
        onClick={() => onToolChange("lasso")}
      />
      <div className="tool-rule" />
      <ToolButton
        icon={<PenLine />}
        label="Stylo (P)"
        active={tool === "pen"}
        onClick={() => onToolChange("pen")}
      />
      <ToolButton
        icon={<Pencil />}
        label="Crayon"
        active={tool === "pencil"}
        onClick={() => onToolChange("pencil")}
      />
      <button
        className={`tool-button ${showBrushes ? "active" : ""}`}
        title="Brosses"
        aria-pressed={showBrushes}
        onClick={onToggleBrushes}
      >
        <Paintbrush />
        <span>Brosses</span>
      </button>
      <ToolButton
        icon={<Highlighter />}
        label="Surligneur"
        active={tool === "highlighter"}
        onClick={() => onToolChange("highlighter")}
      />
      <ToolButton
        icon={<Eraser />}
        label="Gomme (E)"
        active={tool === "eraser"}
        onClick={() => onToolChange("eraser")}
      />
      <div className="tool-rule" />
      <ToolButton
        icon={<Type />}
        label="Texte (T)"
        active={tool === "text"}
        onClick={() => onToolChange("text")}
      />
      <ToolButton
        icon={<Shapes />}
        label="Forme libre"
        active={tool === "shape"}
        onClick={() => onToolChange("shape")}
      />
      <button
        className={`tool-button ${showIcons || tool === "icon" ? "active" : ""}`}
        title="Icônes de base"
        aria-expanded={showIcons}
        onClick={onToggleIcons}
      >
        <Shapes />
        <span>Icônes</span>
      </button>
      <ToolButton
        icon={<Variable />}
        label="Équation"
        active={tool === "math"}
        onClick={() => onToolChange("math")}
      />
      <ToolButton
        icon={<Table2 />}
        label="Tableau"
        active={tool === "table"}
        onClick={() => onToolChange("table")}
      />
      <div className="tool-rule" />
      <button className="tool-button" title="Importer" onClick={onImport}>
        <Download />
        <span>Importer</span>
      </button>
      <ToolButton
        icon={<Hand />}
        label="Déplacer (H)"
        active={tool === "hand"}
        onClick={() => onToolChange("hand")}
      />
      <button className="tool-button bottom-tool" title="Propriétés" onClick={onToggleInspector}>
        <Settings2 />
        <span>Réglages</span>
      </button>
    </aside>
  );
}
