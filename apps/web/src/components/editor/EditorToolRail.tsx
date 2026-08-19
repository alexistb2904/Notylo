import { useState } from "react";
import {
  Download,
  Eraser,
  Hand,
  Highlighter,
  LassoSelect,
  MoreHorizontal,
  MousePointer2,
  Paintbrush,
  Pencil,
  PenLine,
  Settings2,
  Shapes,
  Table2,
  Type,
  Variable,
  X
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const chooseTool = (nextTool: Tool) => {
    setMobileOpen(false);
    onToolChange(nextTool);
  };

  const openBrushes = () => {
    setMobileOpen(false);
    onToggleBrushes();
  };

  const openIcons = () => {
    setMobileOpen(false);
    onToggleIcons();
  };

  const importFile = () => {
    setMobileOpen(false);
    onImport();
  };

  const toggleInspector = () => {
    setMobileOpen(false);
    onToggleInspector();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="mobile-tool-scrim"
          aria-label="Fermer le menu d’outils"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`tool-rail ${inspectorOpen ? "inspector-open" : ""} ${
          mobileOpen ? "mobile-sheet-open" : ""
        }`}
        aria-label="Outils"
      >
        <div className="mobile-tool-sheet-heading">
          <div>
            <strong>Tous les outils</strong>
            <span>Ajouter, sélectionner ou annoter</span>
          </div>
          <div className="mobile-tool-sheet-actions">
            <button
              type="button"
              onClick={toggleInspector}
              aria-label="Ouvrir les réglages"
              title="Propriétés"
            >
              <Settings2 size={18} />
            </button>
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </div>

        <ToolButton
          icon={<MousePointer2 />}
          label="Sélection (V)"
          active={tool === "select"}
          onClick={() => chooseTool("select")}
        />
        <ToolButton
          icon={<LassoSelect />}
          label="Lasso"
          active={tool === "lasso"}
          onClick={() => chooseTool("lasso")}
        />
        <div className="tool-rule" />
        <ToolButton
          icon={<PenLine />}
          label="Stylo (P)"
          active={tool === "pen"}
          onClick={() => chooseTool("pen")}
        />
        <ToolButton
          icon={<Pencil />}
          label="Crayon"
          active={tool === "pencil"}
          onClick={() => chooseTool("pencil")}
        />
        <button
          className={`tool-button ${showBrushes ? "active" : ""}`}
          title="Brosses"
          aria-pressed={showBrushes}
          onClick={openBrushes}
        >
          <Paintbrush />
          <span>Brosses</span>
        </button>
        <ToolButton
          icon={<Highlighter />}
          label="Surligneur"
          active={tool === "highlighter"}
          onClick={() => chooseTool("highlighter")}
        />
        <ToolButton
          icon={<Eraser />}
          label="Gomme (E)"
          active={tool === "eraser"}
          onClick={() => chooseTool("eraser")}
        />
        <div className="tool-rule" />
        <ToolButton
          icon={<Type />}
          label="Texte (T)"
          active={tool === "text"}
          onClick={() => chooseTool("text")}
        />
        <ToolButton
          icon={<Shapes />}
          label="Forme libre"
          active={tool === "shape"}
          onClick={() => chooseTool("shape")}
        />
        <button
          className={`tool-button ${showIcons || tool === "icon" ? "active" : ""}`}
          title="Icônes de base"
          aria-expanded={showIcons}
          onClick={openIcons}
        >
          <Shapes />
          <span>Icônes</span>
        </button>
        <ToolButton
          icon={<Variable />}
          label="Équation"
          active={tool === "math"}
          onClick={() => chooseTool("math")}
        />
        <ToolButton
          icon={<Table2 />}
          label="Tableau"
          active={tool === "table"}
          onClick={() => chooseTool("table")}
        />
        <div className="tool-rule" />
        <button className="tool-button" title="Importer" onClick={importFile}>
          <Download />
          <span>Importer</span>
        </button>
        <ToolButton
          icon={<Hand />}
          label="Déplacer (H)"
          active={tool === "hand"}
          onClick={() => chooseTool("hand")}
        />
        <button className="tool-button bottom-tool" title="Propriétés" onClick={toggleInspector}>
          <Settings2 />
          <span>Réglages</span>
        </button>
      </aside>

      <nav
        className={`mobile-tool-dock ${inspectorOpen ? "is-obscured" : ""}`}
        aria-label="Outils rapides"
      >
        <ToolButton
          icon={<MousePointer2 />}
          label="Sélection"
          active={tool === "select"}
          onClick={() => chooseTool("select")}
        />
        <ToolButton
          icon={<PenLine />}
          label="Stylo"
          active={tool === "pen"}
          onClick={() => chooseTool("pen")}
        />
        <ToolButton
          icon={<Highlighter />}
          label="Surligneur"
          active={tool === "highlighter"}
          onClick={() => chooseTool("highlighter")}
        />
        <ToolButton
          icon={<Eraser />}
          label="Gomme"
          active={tool === "eraser"}
          onClick={() => chooseTool("eraser")}
        />
        <ToolButton
          icon={<Hand />}
          label="Déplacer"
          active={tool === "hand"}
          onClick={() => chooseTool("hand")}
        />
        <button
          type="button"
          className={`tool-button mobile-more-button ${mobileOpen ? "active" : ""}`}
          aria-label={mobileOpen ? "Fermer tous les outils" : "Plus d’outils"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <MoreHorizontal />
          <span>Plus</span>
        </button>
      </nav>
    </>
  );
}
