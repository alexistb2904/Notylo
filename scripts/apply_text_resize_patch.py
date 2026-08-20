from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


# Document model: additive optional typography fields keep existing notebooks compatible.
replace_once(
    "packages/document-model/src/types.ts",
    '''export interface TextObject extends BaseObject {
  readonly type: "text";
  readonly html: string;
  readonly plainText: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly align: "left" | "center" | "right";
}''',
    '''export interface TextObject extends BaseObject {
  readonly type: "text";
  readonly html: string;
  readonly plainText: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight?: 400 | 500 | 600 | 700;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly lineHeight?: number;
  readonly color: string;
  readonly align: "left" | "center" | "right";
}'''
)

replace_once(
    "apps/web/src/lib/factories.ts",
    '''    fontFamily: "Newsreader, serif",
    fontSize: 22,
    color: "#292927",
    align: "left"''',
    '''    fontFamily: "Newsreader, serif",
    fontSize: 22,
    fontWeight: 400,
    italic: false,
    underline: false,
    lineHeight: 1.35,
    color: "#292927",
    align: "left"'''
)

# Inspector: expose typography only when one text object is selected.
replace_once(
    "apps/web/src/components/Inspector.tsx",
    'import type { InkDynamics, PageBackground } from "@notylo/document-model";',
    'import type { InkDynamics, PageBackground, TextObject } from "@notylo/document-model";'
)
replace_once(
    "apps/web/src/components/Inspector.tsx",
    'import { t } from "../i18n";\n',
    'import { t } from "../i18n";\nimport { TextFormattingControls, type TextStylePatch } from "./TextFormattingControls";\n'
)
replace_once(
    "apps/web/src/components/Inspector.tsx",
    '''  eraserMode,
  eraserSize,
  onColor,''',
    '''  eraserMode,
  eraserSize,
  textSelection,
  onTextStyle,
  onColor,'''
)
replace_once(
    "apps/web/src/components/Inspector.tsx",
    '''  readonly eraserMode: EraserMode;
  readonly eraserSize: number;
  onColor(value: string): void;''',
    '''  readonly eraserMode: EraserMode;
  readonly eraserSize: number;
  readonly textSelection?: TextObject | undefined;
  onTextStyle(value: TextStylePatch): void;
  onColor(value: string): void;'''
)
replace_once(
    "apps/web/src/components/Inspector.tsx",
    '''  const toolName = tool === "pen" ? t("inspector.pen") : tool === "pencil" ? t("inspector.pencil") : tool === "highlighter" ? t("inspector.highlighter") : tool === "eraser" ? t("inspector.eraser") : t("inspector.space");''',
    '''  const toolName = textSelection ? t("inspector.text") : tool === "pen" ? t("inspector.pen") : tool === "pencil" ? t("inspector.pencil") : tool === "highlighter" ? t("inspector.highlighter") : tool === "eraser" ? t("inspector.eraser") : t("inspector.space");'''
)
replace_once(
    "apps/web/src/components/Inspector.tsx",
    '''      <section className="settings-section" aria-labelledby="stroke-settings">''',
    '''      {textSelection && <TextFormattingControls object={textSelection} onChange={onTextStyle} />}
      {!textSelection && <section className="settings-section" aria-labelledby="stroke-settings">'''
)
replace_once(
    "apps/web/src/components/Inspector.tsx",
    '''      </section>
      {isInkTool && (''',
    '''      </section>}
      {!textSelection && isInkTool && ('''
)

# Vector layer: selected preview objects replace committed geometry while resizing.
replace_once(
    "apps/web/src/components/VectorObjectLayer.tsx",
    '''  for (const selected of props.selection) {
    if (!isVectorObject(selected) || present.has(selected.id)) continue;
    visible.push(selected);
    present.add(selected.id);
  }

  return visible
    .filter((object) => !object.hidden)''',
    '''  for (const selected of props.selection) {
    if (!isVectorObject(selected) || present.has(selected.id)) continue;
    visible.push(selected);
    present.add(selected.id);
  }

  const selectedById = new Map(
    props.selection.filter(isVectorObject).map((object) => [object.id, object] as const)
  );
  visible = visible.map((object) => selectedById.get(object.id) ?? object);

  return visible
    .filter((object) => !object.hidden)'''
)

# Workspace live resize state and typography integration.
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  const dragRef = useRef<DragState | undefined>(undefined);
  const resizePointRef = useRef<Point | undefined>(undefined);''',
    '''  const dragRef = useRef<DragState | undefined>(undefined);
  const resizePointRef = useRef<Point | undefined>(undefined);
  const resizeFrameRef = useRef<number | undefined>(undefined);
  const resizePreviewRef = useRef<readonly DocumentObject[] | undefined>(undefined);
  const [resizePreview, setResizePreview] = useState<readonly DocumentObject[]>();'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''      if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
    },''',
    '''      if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
      if (resizeFrameRef.current !== undefined) window.cancelAnimationFrame(resizeFrameRef.current);
    },'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  const keepInsidePage = useCallback(
    <T extends DocumentObject>(object: T): T => {
      if (document.notebook.mode !== "book" || !object.pageId) return object;
      const page = document.pages.find((item) => item.id === object.pageId);
      if (!page) return object;
      return {
        ...object,
        x: Math.max(0, Math.min(Math.max(0, page.width - object.width), object.x)),
        y: Math.max(0, Math.min(Math.max(0, page.height - object.height), object.y))
      };
    },
    [document.notebook.mode, document.pages]
  );

  const previewEraserGesture = () => {''',
    '''  const keepInsidePage = useCallback(
    <T extends DocumentObject>(object: T): T => {
      if (document.notebook.mode !== "book" || !object.pageId) return object;
      const page = document.pages.find((item) => item.id === object.pageId);
      if (!page) return object;
      return {
        ...object,
        x: Math.max(0, Math.min(Math.max(0, page.width - object.width), object.x)),
        y: Math.max(0, Math.min(Math.max(0, page.height - object.height), object.y))
      };
    },
    [document.notebook.mode, document.pages]
  );

  const resizeObjectsAt = useCallback(
    (state: DragState, point: Point): readonly DocumentObject[] => {
      if (state.kind !== "resize" || !state.originals || !state.bounds || !state.handle) return [];
      const transform = resizeTransform(state.bounds, point, state.handle);
      return state.originals.map((object) => keepInsidePage(transformObject(object, transform)));
    },
    [keepInsidePage]
  );
  const queueResizePreview = useCallback(
    (state: DragState, point: Point) => {
      resizePointRef.current = point;
      if (resizeFrameRef.current !== undefined) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = undefined;
        const activeState = dragRef.current;
        const activePoint = resizePointRef.current;
        if (!activeState || activeState.kind !== "resize" || !activePoint) return;
        const preview = resizeObjectsAt(activeState, activePoint);
        resizePreviewRef.current = preview;
        setResizePreview(preview);
      });
    },
    [resizeObjectsAt]
  );
  const clearResizePreview = useCallback(() => {
    if (resizeFrameRef.current !== undefined) window.cancelAnimationFrame(resizeFrameRef.current);
    resizeFrameRef.current = undefined;
    resizePreviewRef.current = undefined;
    setResizePreview(undefined);
  }, []);

  const previewEraserGesture = () => {'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''      state.kind === "lasso" ||
      state.kind === "pan" ||
      state.kind === "move"''',
    '''      state.kind === "lasso" ||
      state.kind === "pan" ||
      state.kind === "move" ||
      state.kind === "resize" ||
      state.kind === "arrow-point"'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''    if (state.kind === "lasso") setLasso((current) => [...current, point]);
    if (state.kind === "resize") resizePointRef.current = point;
    if (state.kind === "arrow-point") resizePointRef.current = point;''',
    '''    if (state.kind === "lasso") setLasso((current) => [...current, point]);
    if (state.kind === "resize") {
      queueResizePreview(state, point);
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
    '''    if (
      state.kind === "resize" &&
      state.originals &&
      state.bounds &&
      state.handle
    ) {
      const finalPoint = interactionPointAt(event);
      const finalObjects = resizeObjectsAt(state, finalPoint);
      clearResizePreview();
      if (finalObjects.length)
        props.onUpdate(state.originals, finalObjects, t("ops.resizeSelection"));
      resizePointRef.current = undefined;
    }'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''      engine.current.select(
        [hit.id],
        event.shiftKey ? "add" : event.ctrlKey || event.metaKey ? "toggle" : "replace"
      );
      syncSelection();''',
    '''      engine.current.select(
        [hit.id],
        event.shiftKey ? "add" : event.ctrlKey || event.metaKey ? "toggle" : "replace"
      );
      syncSelection();
      if (hit.type === "text" && !event.shiftKey && !event.ctrlKey && !event.metaKey)
        setShowInspector(true);'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''  const selectedObjects = scopedObjects.filter((object) => selectedIds.includes(object.id));
  const runOcr = async (mode: OcrMode) => {''',
    '''  const selectedObjects = scopedObjects.filter((object) => selectedIds.includes(object.id));
  const visualSelectedObjects = resizePreview ?? selectedObjects;
  const resizePreviewById = new Map((resizePreview ?? []).map((object) => [object.id, object] as const));
  const selectedTextObject =
    selectedObjects.length === 1 && selectedObjects[0]?.type === "text"
      ? selectedObjects[0]
      : undefined;
  const runOcr = async (mode: OcrMode) => {'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''            selection={selectedObjects}
            selectionRect={selectionRect}''',
    '''            selection={visualSelectedObjects}
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
                const renderedObject = resizePreviewById.get(object.id) ?? object;
                return (
                  <DOMObject
                    key={object.id}
                    object={renderedObject}
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
    '''                objects={selectedObjects}
                dragOffset={dragOffset}''',
    '''                objects={visualSelectedObjects}
                dragOffset={dragOffset}'''
)
replace_once(
    "apps/web/src/components/EditorWorkspace.tsx",
    '''            eraserMode={eraserMode}
            eraserSize={eraserSize}
            paletteVisible={showPalette}''',
    '''            eraserMode={eraserMode}
            eraserSize={eraserSize}
            textSelection={selectedTextObject}
            onTextStyle={(patch) => {
              if (!selectedTextObject) return;
              props.onUpdate(
                [selectedTextObject],
                [{ ...selectedTextObject, ...patch, updatedAt: Date.now() }],
                t("ops.formatText")
              );
            }}
            paletteVisible={showPalette}'''
)

# i18n: typography controls in both supported languages.
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "inspector.eraser": "Eraser",
  "inspector.space": "Workspace",''',
    '''  "inspector.eraser": "Eraser",
  "inspector.text": "Text",
  "inspector.space": "Workspace",
  "text.typography": "Typography",
  "text.font": "Font",
  "text.fontSize": "Font size",
  "text.style": "Text style",
  "text.bold": "Bold",
  "text.italic": "Italic",
  "text.underline": "Underline",
  "text.alignLeft": "Align left",
  "text.alignCenter": "Align center",
  "text.alignRight": "Align right",
  "text.lineHeight": "Line spacing",
  "text.resizeHint": "Resize the text box directly: text reflows live while you drag.",'''
)
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "ops.editObject": "Edit object",
  "ops.addObject": "Add object",''',
    '''  "ops.editObject": "Edit object",
  "ops.formatText": "Format text",
  "ops.addObject": "Add object",'''
)
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "inspector.eraser": "Gomme",
  "inspector.space": "Espace",''',
    '''  "inspector.eraser": "Gomme",
  "inspector.text": "Texte",
  "inspector.space": "Espace",
  "text.typography": "Typographie",
  "text.font": "Police",
  "text.fontSize": "Taille de police",
  "text.style": "Style du texte",
  "text.bold": "Gras",
  "text.italic": "Italique",
  "text.underline": "Souligné",
  "text.alignLeft": "Aligner à gauche",
  "text.alignCenter": "Centrer",
  "text.alignRight": "Aligner à droite",
  "text.lineHeight": "Interligne",
  "text.resizeHint": "Redimensionnez directement la zone de texte : le contenu se réorganise en temps réel pendant le glissement.",'''
)
replace_once(
    "apps/web/src/i18n/index.ts",
    '''  "ops.editObject": "Modifier l’objet",
  "ops.addObject": "Ajouter un objet",''',
    '''  "ops.editObject": "Modifier l’objet",
  "ops.formatText": "Mettre en forme le texte",
  "ops.addObject": "Ajouter un objet",'''
)
