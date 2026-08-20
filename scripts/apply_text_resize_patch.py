from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "packages/document-model/src/types.ts",
    '''  readonly color: string;
  readonly align: "left" | "center" | "right";
}''',
    '''  readonly color: string;
  readonly align: "left" | "center" | "right";
  /** Optional for backward compatibility with notebooks created before rich text controls. */
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}'''
)

replace_once(
    "apps/web/src/components/CanvasLayer.tsx",
    '''        selection={props.selection}
        dragOffset={props.dragOffset}
      />''',
    '''        selection={props.selection}
        selectionTransform={props.selectionTransform}
        dragOffset={props.dragOffset}
      />'''
)

replace_once(
    "apps/web/src/components/VectorObjectLayer.tsx",
    '''  NotebookDocument,
  ShapeObject
} from "@notylo/document-model";''',
    '''  NotebookDocument,
  ShapeObject,
  Transform
} from "@notylo/document-model";'''
)
replace_once(
    "apps/web/src/components/VectorObjectLayer.tsx",
    '''  readonly selection: readonly DocumentObject[];
  readonly dragOffset: Point;
}''',
    '''  readonly selection: readonly DocumentObject[];
  readonly selectionTransform?: Transform | undefined;
  readonly dragOffset: Point;
}'''
)
replace_once(
    "apps/web/src/components/VectorObjectLayer.tsx",
    '''        {objects.map((object) => {
          const pageOffsetY = object.pageId ? (props.pageOffsets?.[object.pageId] ?? 0) : 0;
          const selected = selectedIds.has(object.id);
          const dx = selected ? props.dragOffset.x : 0;
          const dy = pageOffsetY + (selected ? props.dragOffset.y : 0);
          return object.type === "ink" ? (
            <SvgInk key={object.id} object={object} dx={dx} dy={dy} />
          ) : (
            <SvgShape key={object.id} object={object} dx={dx} dy={dy} />
          );
        })}''',
    '''        {objects.map((object) => {
          const pageOffsetY = object.pageId ? (props.pageOffsets?.[object.pageId] ?? 0) : 0;
          const selected = selectedIds.has(object.id);
          const moveX = selected ? props.dragOffset.x : 0;
          const moveY = pageOffsetY + (selected ? props.dragOffset.y : 0);
          const resize = selected ? props.selectionTransform : undefined;
          const resizeTransform = resize
            ? `translate(${resize.dx} ${resize.dy}) scale(${resize.scaleX ?? 1} ${resize.scaleY ?? 1})`
            : "";
          const placementTransform = moveX || moveY ? `translate(${moveX} ${moveY})` : "";
          const transform = [placementTransform, resizeTransform].filter(Boolean).join(" ");
          return (
            <g key={object.id} transform={transform || undefined}>
              {object.type === "ink" ? (
                <SvgInk object={object} dx={0} dy={0} />
              ) : (
                <SvgShape object={object} dx={0} dy={0} />
              )}
            </g>
          );
        })}'''
)

replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  transformObject,
  type DocumentObject,
  type InkDynamics,
  type NotebookDocument,
  type ShapeObject
} from "@notylo/document-model";''',
    '''  transformObject,
  type DocumentObject,
  type InkDynamics,
  type NotebookDocument,
  type ShapeObject,
  type TextObject,
  type Transform
} from "@notylo/document-model";'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''import { WorkspaceDrawers } from "./editor/WorkspaceDrawers";
import { DEFAULT_COLORS, type IconShape } from "./editor/workspaceConstants";''',
    '''import { WorkspaceDrawers } from "./editor/WorkspaceDrawers";
import { TextFormattingToolbar, type TextFormatPatch } from "./editor/TextFormattingToolbar";
import { previewObjectBounds, transformChanged } from "./editor/resizePreview";
import { DEFAULT_COLORS, type IconShape } from "./editor/workspaceConstants";'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const dragFrameRef = useRef<number | undefined>(undefined);
  const [showInspector, setShowInspector] = useState(false);''',
    '''  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const dragFrameRef = useRef<number | undefined>(undefined);
  const [resizePreviewTransform, setResizePreviewTransform] = useState<Transform>();
  const resizePreviewTransformRef = useRef<Transform | undefined>(undefined);
  const resizeFrameRef = useRef<number | undefined>(undefined);
  const [showInspector, setShowInspector] = useState(false);'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''      if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
    },
    []
  );''',
    '''      if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
      if (resizeFrameRef.current !== undefined) window.cancelAnimationFrame(resizeFrameRef.current);
    },
    []
  );'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  const resetDragOffset = useCallback(() => {
    if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    dragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
  }, []);
  const keepInsidePage = useCallback(''',
    '''  const resetDragOffset = useCallback(() => {
    if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    dragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
  }, []);
  const queueResizePreview = useCallback((transform: Transform) => {
    resizePreviewTransformRef.current = transform;
    if (resizeFrameRef.current !== undefined) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = undefined;
      setResizePreviewTransform(resizePreviewTransformRef.current);
    });
  }, []);
  const resetResizePreview = useCallback(() => {
    if (resizeFrameRef.current !== undefined) window.cancelAnimationFrame(resizeFrameRef.current);
    resizeFrameRef.current = undefined;
    resizePreviewTransformRef.current = undefined;
    setResizePreviewTransform(undefined);
  }, []);
  const keepInsidePage = useCallback('''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''        interactionPageRef.current = undefined;
        dragRef.current = undefined;
        setCanvasActive(false);''',
    '''        interactionPageRef.current = undefined;
        dragRef.current = undefined;
        resetResizePreview();
        setCanvasActive(false);'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''      state.kind === "lasso" ||
      state.kind === "pan" ||
      state.kind === "move"
    )''',
    '''      state.kind === "lasso" ||
      state.kind === "pan" ||
      state.kind === "move" ||
      state.kind === "resize" ||
      state.kind === "arrow-point"
    )'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''    if (state.kind === "lasso") setLasso((current) => [...current, point]);
    if (state.kind === "resize") resizePointRef.current = point;
    if (state.kind === "arrow-point") resizePointRef.current = point;''',
    '''    if (state.kind === "lasso") setLasso((current) => [...current, point]);
    if (state.kind === "resize" && state.bounds && state.handle) {
      resizePointRef.current = point;
      queueResizePreview(resizeTransform(state.bounds, point, state.handle));
      return;
    }
    if (state.kind === "arrow-point") resizePointRef.current = point;'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''    if (
      state.kind === "resize" &&
      state.originals &&
      state.bounds &&
      state.handle &&
      resizePointRef.current
    ) {
      const transform = resizeTransform(state.bounds, resizePointRef.current, state.handle);
      props.onUpdate(
        state.originals,
        state.originals.map((object) => keepInsidePage(transformObject(object, transform))),
        t("ops.resizeSelection")
      );
      resizePointRef.current = undefined;
    }''',
    '''    if (state.kind === "resize" && state.originals && state.bounds && state.handle) {
      const finalPoint = interactionPointAt(event);
      const transform = resizeTransform(state.bounds, finalPoint, state.handle);
      const after = state.originals.map((object) =>
        keepInsidePage(transformObject(object, transform))
      );
      resetResizePreview();
      resizePointRef.current = undefined;
      if (transformChanged(transform))
        props.onUpdate(state.originals, after, t("ops.resizeSelection"));
      interactionPageRef.current = undefined;
      return;
    }'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  const selectedObjects = scopedObjects.filter((object) => selectedIds.includes(object.id));
  const runOcr = async (mode: OcrMode) => {''',
    '''  const selectedObjects = scopedObjects.filter((object) => selectedIds.includes(object.id));
  const previewSelectedObjects = resizePreviewTransform
    ? selectedObjects.map((object) => previewObjectBounds(object, resizePreviewTransform))
    : selectedObjects;
  const previewById = new Map(previewSelectedObjects.map((object) => [object.id, object]));
  const selectedText =
    selectedObjects.length === 1 && selectedObjects[0]?.type === "text"
      ? (selectedObjects[0] as TextObject)
      : undefined;
  const previewText =
    previewSelectedObjects.length === 1 && previewSelectedObjects[0]?.type === "text"
      ? (previewSelectedObjects[0] as TextObject)
      : undefined;
  const updateTextFormat = (patch: TextFormatPatch) => {
    if (!selectedText) return;
    const current = props.documentRef.current.objects.find(
      (object): object is TextObject => object.id === selectedText.id && object.type === "text"
    );
    if (!current) return;
    props.onUpdate(
      [current],
      [{ ...current, ...patch, updatedAt: Date.now() }],
      t("ops.formatText")
    );
  };
  const textToolbarPosition = (() => {
    if (!previewText) return undefined;
    const pageOffset = previewText.pageId ? (pageOffsets[previewText.pageId] ?? 0) : 0;
    const rawX = origin.x + camera.x + (previewText.x + previewText.width / 2) * camera.zoom;
    const topY = origin.y + camera.y + (pageOffset + previewText.y) * camera.zoom;
    const below = topY < 72;
    const rawY = below ? topY + previewText.height * camera.zoom : topY;
    const halfToolbar = Math.min(300, Math.max(0, (viewSize.width - 24) / 2));
    const x =
      viewSize.width <= 624
        ? viewSize.width / 2
        : Math.max(halfToolbar, Math.min(viewSize.width - halfToolbar, rawX));
    return { x, y: rawY, below };
  })();
  const runOcr = async (mode: OcrMode) => {'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''            selection={selectedObjects}
            selectionRect={selectionRect}''',
    '''            selection={selectedObjects}
            selectionTransform={resizePreviewTransform}
            selectionRect={selectionRect}'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''              .map((object) => (
                <DOMObject
                  key={object.id}
                  object={object}
                  selected={selectedIds.includes(object.id)}
                  dragOffset={selectedIds.includes(object.id) ? dragOffset : undefined}
                  offsetY={object.pageId ? (pageOffsets[object.pageId] ?? 0) : 0}
                  onUpdate={updateObject}
                  readOnly={readOnly}
                />
              ))}''',
    '''              .map((object) => {
                const displayObject = previewById.get(object.id) ?? object;
                return (
                  <DOMObject
                    key={object.id}
                    object={displayObject}
                    selected={selectedIds.includes(object.id)}
                    dragOffset={selectedIds.includes(object.id) ? dragOffset : undefined}
                    offsetY={object.pageId ? (pageOffsets[object.pageId] ?? 0) : 0}
                    onUpdate={updateObject}
                    readOnly={readOnly}
                  />
                );
              })}'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''              <SelectionBox
                objects={selectedObjects}
                dragOffset={dragOffset}''',
    '''              <SelectionBox
                objects={previewSelectedObjects}
                dragOffset={dragOffset}'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''                  const bounds = engine.current.selectionBounds();
                  if (!bounds) return;
                  event.stopPropagation();''',
    '''                  const bounds = engine.current.selectionBounds();
                  if (!bounds) return;
                  resetResizePreview();
                  event.stopPropagation();'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''            {!readOnly &&
              selectedObjects.length === 1 &&
              selectedObjects[0]?.type === "shape" &&''',
    '''            {!readOnly &&
              !resizePreviewTransform &&
              selectedObjects.length === 1 &&
              selectedObjects[0]?.type === "shape" &&'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''          </div>
          {document.notebook.mode === "whiteboard" && (
            <div className="whiteboard-coordinate">''',
    '''          </div>
          {!readOnly && selectedText && textToolbarPosition && (
            <TextFormattingToolbar
              object={selectedText}
              x={textToolbarPosition.x}
              y={textToolbarPosition.y}
              below={textToolbarPosition.below}
              onChange={updateTextFormat}
            />
          )}
          {document.notebook.mode === "whiteboard" && (
            <div className="whiteboard-coordinate">'''
)

replace_once(
    "apps/web/src/styles.css",
    '''.floating-palette {
  left: 18px;''',
    '''.text-format-toolbar {
  position: absolute;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  max-width: calc(100% - 24px);
  min-height: 42px;
  padding: 5px;
  overflow-x: auto;
  color: var(--tone-950);
  background: color-mix(in srgb, var(--tone-highlight) 94%, transparent);
  border: 1px solid var(--tone-300);
  border-radius: 11px;
  box-shadow: 0 12px 32px var(--tone-shadow);
  backdrop-filter: blur(14px);
  transform: translate(-50%, calc(-100% - 10px));
  pointer-events: auto;
  scrollbar-width: none;
}
.text-format-toolbar::-webkit-scrollbar {
  display: none;
}
.text-format-toolbar.is-below {
  transform: translate(-50%, 10px);
}
.text-format-toolbar select,
.text-format-toolbar input[type="number"] {
  height: 31px;
  color: var(--tone-850);
  background: var(--tone-100);
  border: 1px solid var(--tone-300);
  border-radius: 7px;
  outline: none;
}
.text-format-font {
  width: 132px;
  padding: 0 8px;
  font-size: 11px;
}
.text-format-size {
  width: 55px;
  padding: 0 6px;
  font-size: 11px;
  text-align: center;
}
.text-format-divider {
  width: 1px;
  height: 23px;
  margin: 0 2px;
  flex: 0 0 1px;
  background: var(--tone-300);
}
.text-format-icon,
.text-format-color {
  width: 31px;
  height: 31px;
  flex: 0 0 31px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  color: var(--tone-700);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
}
.text-format-icon:hover,
.text-format-icon[aria-pressed="true"],
.text-format-color:hover {
  color: var(--tone-950);
  background: var(--tone-100);
  border-color: var(--tone-300);
}
.text-format-align {
  display: flex;
  gap: 1px;
}
.text-format-color {
  position: relative;
  cursor: pointer;
}
.text-format-color input {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 8px;
  height: 8px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--tone-100);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.text-format-color input::-webkit-color-swatch-wrapper {
  padding: 0;
}
.text-format-color input::-webkit-color-swatch {
  border: 0;
}

.floating-palette {
  left: 18px;'''
)
replace_once(
    "apps/web/src/styles.css",
    '''.text-object {
  width: 100%;
  min-height: 100%;
  padding: 3px;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
}''',
    '''.text-object {
  width: 100%;
  height: 100%;
  min-height: 100%;
  padding: 3px;
  overflow: auto;
  outline: none;
  line-height: 1.25;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  scrollbar-width: thin;
}'''
)

replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "dom.resizeSW": "Resize from bottom left",

  "factory.writeHere": "Write here",''',
    '''  "dom.resizeSW": "Resize from bottom left",

  "textFormat.aria": "Text formatting",
  "textFormat.fontFamily": "Font family",
  "textFormat.fontSize": "Font size",
  "textFormat.bold": "Bold",
  "textFormat.italic": "Italic",
  "textFormat.underline": "Underline",
  "textFormat.alignment": "Text alignment",
  "textFormat.alignLeft": "Align text left",
  "textFormat.alignCenter": "Center text",
  "textFormat.alignRight": "Align text right",
  "textFormat.color": "Text color",

  "factory.writeHere": "Write here",'''
)
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "ops.resizeSelection": "Resize selection",
  "ops.editArrow": "Edit arrow path",''',
    '''  "ops.resizeSelection": "Resize selection",
  "ops.formatText": "Format text",
  "ops.editArrow": "Edit arrow path",'''
)
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "dom.resizeSW": "Redimensionner en bas à gauche",

  "factory.writeHere": "Écrire ici",''',
    '''  "dom.resizeSW": "Redimensionner en bas à gauche",

  "textFormat.aria": "Mise en forme du texte",
  "textFormat.fontFamily": "Police",
  "textFormat.fontSize": "Taille de police",
  "textFormat.bold": "Gras",
  "textFormat.italic": "Italique",
  "textFormat.underline": "Souligné",
  "textFormat.alignment": "Alignement du texte",
  "textFormat.alignLeft": "Aligner le texte à gauche",
  "textFormat.alignCenter": "Centrer le texte",
  "textFormat.alignRight": "Aligner le texte à droite",
  "textFormat.color": "Couleur du texte",

  "factory.writeHere": "Écrire ici",'''
)
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "ops.resizeSelection": "Redimensionner la sélection",
  "ops.editArrow": "Modifier le tracé de la flèche",''',
    '''  "ops.resizeSelection": "Redimensionner la sélection",
  "ops.formatText": "Mettre en forme le texte",
  "ops.editArrow": "Modifier le tracé de la flèche",'''
)
