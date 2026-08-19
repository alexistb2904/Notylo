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
import { t } from "../../i18n";

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
          aria-label={t("tools.closeMenu")}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`tool-rail ${inspectorOpen ? "inspector-open" : ""} ${mobileOpen ? "mobile-sheet-open" : ""}`}
        aria-label={t("tools.aria")}
      >
        <div className="mobile-tool-sheet-heading">
          <div>
            <strong>{t("tools.all")}</strong>
            <span>{t("tools.subtitle")}</span>
          </div>
          <div className="mobile-tool-sheet-actions">
            <button type="button" onClick={toggleInspector} aria-label={t("tools.openSettings")} title={t("tools.properties")}>
              <Settings2 size={18} />
            </button>
            <button type="button" onClick={() => setMobileOpen(false)} aria-label={t("common.close")}>
              <X size={18} />
            </button>
          </div>
        </div>
        <ToolButton icon={<MousePointer2 />} label={t("tools.selectionShortcut")} active={tool === "select"} onClick={() => chooseTool("select")} />
        <ToolButton icon={<LassoSelect />} label={t("tools.lasso")} active={tool === "lasso"} onClick={() => chooseTool("lasso")} />
        <div className="tool-rule" />
        <ToolButton icon={<PenLine />} label={t("tools.penShortcut")} active={tool === "pen"} onClick={() => chooseTool("pen")} />
        <ToolButton icon={<Pencil />} label={t("tools.pencil")} active={tool === "pencil"} onClick={() => chooseTool("pencil")} />
        <button className={`tool-button ${showBrushes ? "active" : ""}`} title={t("tools.brushes")} aria-pressed={showBrushes} onClick={openBrushes}>
          <Paintbrush /><span>{t("tools.brushes")}</span>
        </button>
        <ToolButton icon={<Highlighter />} label={t("tools.highlighter")} active={tool === "highlighter"} onClick={() => chooseTool("highlighter")} />
        <ToolButton icon={<Eraser />} label={t("tools.eraserShortcut")} active={tool === "eraser"} onClick={() => chooseTool("eraser")} />
        <div className="tool-rule" />
        <ToolButton icon={<Type />} label={t("tools.textShortcut")} active={tool === "text"} onClick={() => chooseTool("text")} />
        <ToolButton icon={<Shapes />} label={t("tools.freeShape")} active={tool === "shape"} onClick={() => chooseTool("shape")} />
        <button className={`tool-button ${showIcons || tool === "icon" ? "active" : ""}`} title={t("tools.basicIcons")} aria-expanded={showIcons} onClick={openIcons}>
          <Shapes /><span>{t("tools.icons")}</span>
        </button>
        <ToolButton icon={<Variable />} label={t("tools.equation")} active={tool === "math"} onClick={() => chooseTool("math")} />
        <ToolButton icon={<Table2 />} label={t("tools.table")} active={tool === "table"} onClick={() => chooseTool("table")} />
        <div className="tool-rule" />
        <button className="tool-button" title={t("common.import")} onClick={importFile}><Download /><span>{t("common.import")}</span></button>
        <ToolButton icon={<Hand />} label={t("tools.moveShortcut")} active={tool === "hand"} onClick={() => chooseTool("hand")} />
        <button className="tool-button bottom-tool" title={t("tools.properties")} onClick={toggleInspector}><Settings2 /><span>{t("tools.settings")}</span></button>
      </aside>
      <nav className={`mobile-tool-dock ${inspectorOpen ? "is-obscured" : ""}`} aria-label={t("tools.quick")}>
        <ToolButton icon={<MousePointer2 />} label={t("tools.selection")} active={tool === "select"} onClick={() => chooseTool("select")} />
        <ToolButton icon={<PenLine />} label={t("tools.pen")} active={tool === "pen"} onClick={() => chooseTool("pen")} />
        <ToolButton icon={<Highlighter />} label={t("tools.highlighter")} active={tool === "highlighter"} onClick={() => chooseTool("highlighter")} />
        <ToolButton icon={<Eraser />} label={t("tools.eraser")} active={tool === "eraser"} onClick={() => chooseTool("eraser")} />
        <ToolButton icon={<Hand />} label={t("tools.move")} active={tool === "hand"} onClick={() => chooseTool("hand")} />
        <button type="button" className={`tool-button mobile-more-button ${mobileOpen ? "active" : ""}`} aria-label={mobileOpen ? t("tools.closeAll") : t("tools.more")} aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)}>
          <MoreHorizontal /><span>{t("tools.moreShort")}</span>
        </button>
      </nav>
    </>
  );
}
