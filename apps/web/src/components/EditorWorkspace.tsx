import DOMPurify from "dompurify";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  type Camera,
  CanvasEngine,
  DEFAULT_CAMERA,
  screenToWorld,
  type Point,
  type Rect
} from "@notylo/canvas-engine";
import {
  applyOperation,
  createId,
  transformObject,
  type DocumentObject,
  type InkDynamics,
  type NotebookDocument,
  type ShapeObject
} from "@notylo/document-model";
import {
  defaultPosition,
  newInk,
  newMath,
  newShape,
  newTable,
  newText,
  objectBoundsFromPoints
} from "../lib/factories";
import type { SaveState } from "../lib/session";
import { webPlatform } from "../lib/platform";
import { captureSpacingForZoom, compactInkPoints } from "../lib/ink";
import {
  appendEraserPoint,
  eraseObjects,
  eraserGestureBounds,
  type EraserMode,
  type EraserResult
} from "../lib/eraser";
import { isApproximatelyStraight } from "../lib/straight-line";
import { CanvasLayer } from "./CanvasLayer";
import { DOMObject } from "./DOMObject";
import { SelectionBox } from "./SelectionBox";
import { Inspector } from "./Inspector";
import { ExportDialog } from "./ExportDialog";
import { EditorToolRail } from "./editor/EditorToolRail";
import { EditorHeader, ArrowPointHandles, PageNavigator, Paper } from "./editor/WorkspaceChrome";
import { WorkspaceDrawers } from "./editor/WorkspaceDrawers";
import { DEFAULT_COLORS, type IconShape } from "./editor/workspaceConstants";
import {
  distance,
  bookHeight,
  getBookPageOffsets,
  getDocumentOrigin,
  iconShapeBetween,
  midpoint,
  normalizeRect,
  resizeTransform,
  whiteboardStyle
} from "./editor/geometry";
import { appendCoalescedInkPoints, recognizeInkShape, toInkPoint } from "./editor/inkGestures";
import {
  attachToDocument,
  documentRefCount,
  recognizeSelected,
  sha256
} from "./editor/documentHelpers";
import type { OcrMode } from "../lib/ocr";
import {
  readStoredBoolean,
  readStoredNumber,
  readStoredPalette,
  readStoredSidebar
} from "./editor/preferences";
import { t } from "../i18n";
import type {
  DraftInk,
  DragState,
  SidebarPosition,
  StraightenGesture,
  Tool,
  ViewSize
} from "./editor/types";

export type { Tool } from "./editor/types";
interface Props {
  readonly document: NotebookDocument;
  readonly documentRef: MutableRefObject<NotebookDocument>;
  readonly saveState: SaveState;
  readonly onAdd: (object: DocumentObject) => void;
  readonly onUpdate: (
    before: readonly DocumentObject[],
    after: readonly DocumentObject[],
    label?: string
  ) => void;
  readonly onDelete: (objects: readonly DocumentObject[]) => void;
  readonly onAddPage: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onReplace: (updater: (current: NotebookDocument) => NotebookDocument) => void;
  readonly onShare?: () => void;
  readonly readOnly?: boolean;
  readonly publicMode?: "read" | "write";
}
interface EraserGestureState {
  readonly baseDocument: NotebookDocument;
  readonly path: Point[];
  readonly sourceIndex: CanvasEngine;
  result: EraserResult;
}
const INTERNAL_CLIPBOARD = "application/x-notylo-objects";
const STRAIGHTEN_DELAY_MS = 2_000;
const STRAIGHTEN_STILLNESS_PX = 4;

export function EditorWorkspace(props: Props) {
  const { document } = props;
  const readOnly = props.readOnly ?? false;
  const viewportRef = useRef<HTMLDivElement>(null);
  const engine = useRef(new CanvasEngine());
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [viewSize, setViewSize] = useState<ViewSize>({ width: 1200, height: 800 });
  const [tool, setTool] = useState<Tool>("pen");
  const [palette, setPalette] = useState<string[]>(() =>
    readStoredPalette("notylo-ink-palette", DEFAULT_COLORS)
  );
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [inkColor, setInkColor] = useState(
    () => readStoredPalette("notylo-ink-palette", DEFAULT_COLORS)[0] ?? "#292927"
  );
  const [inkSize, setInkSize] = useState(3.2);
  const [inkSmoothing, setInkSmoothing] = useState(0.55);
  const [brushId, setBrushId] = useState(
    () => localStorage.getItem("notylo-brush-id") ?? "ink-fineliner"
  );
  const [inkDynamics, setInkDynamics] = useState<InkDynamics>(() => ({
    pressureSensitivity: readStoredNumber("notylo-pressure-sensitivity", 0.5, 0, 1),
    pressureAffectsWidth: readStoredBoolean("notylo-pressure-width", true),
    pressureAffectsOpacity: readStoredBoolean("notylo-pressure-opacity", false),
    tiltAffectsAngle: readStoredBoolean("notylo-tilt-angle", false)
  }));
  const [eraserMode, setEraserMode] = useState<EraserMode>(() =>
    localStorage.getItem("notylo-eraser-mode") === "precision" ? "precision" : "object"
  );
  const [eraserSize, setEraserSize] = useState(() =>
    readStoredNumber("notylo-eraser-size", 18, 4, 72)
  );
  const [showPalette, setShowPalette] = useState(() =>
    readStoredBoolean("notylo-floating-palette", true)
  );
  const [showBrushes, setShowBrushes] = useState(false);
  const [showIcons, setShowIcons] = useState(false);
  const [iconShape, setIconShape] = useState<IconShape>("square");
  const [shapeRecognition, setShapeRecognition] = useState(() =>
    readStoredBoolean("notylo-shape-recognition", true)
  );
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() =>
    readStoredSidebar()
  );
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | undefined>(
    () => document.pages[0]?.id
  );
  const interactionPageRef = useRef<NotebookDocument["pages"][number] | undefined>(undefined);
  const autoPageLockedRef = useRef(false);
  const [selectionRect, setSelectionRect] = useState<Rect>();
  const [lasso, setLasso] = useState<readonly Point[]>([]);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const dragFrameRef = useRef<number | undefined>(undefined);
  const [showInspector, setShowInspector] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [stylusOnly, setStylusOnly] = useState(() =>
    readStoredBoolean("notylo-stylus-only", false)
  );
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>();
  const [showExport, setShowExport] = useState(false);
  const [canvasActive, setCanvasActive] = useState(false);
  const draftRef = useRef<DraftInk | undefined>(undefined);
  const shapeDraftRef = useRef<ShapeObject | undefined>(undefined);
  const straightenGestureRef = useRef<StraightenGesture | undefined>(undefined);
  const eraserGestureRef = useRef<EraserGestureState | undefined>(undefined);
  const eraserLastApplyAt = useRef(0);
  const dragRef = useRef<DragState | undefined>(undefined);
  const resizePointRef = useRef<Point | undefined>(undefined);
  const resizeFrameRef = useRef<number | undefined>(undefined);
  const [resizePreview, setResizePreview] = useState<readonly DocumentObject[]>();
  const penRecentAt = useRef(0);
  const activePenPointers = useRef(new Set<number>());
  const internalClipboard = useRef<readonly DocumentObject[]>([]);
  const paletteInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const touchPointers = useRef(new Map<number, Point>());
  const pinch = useRef<
    { distance: number; zoom: number; center: Point; camera: Camera } | undefined
  >(undefined);
  const activePage = document.pages.find((page) => page.id === currentPageId) ?? document.pages[0];
  const pageGap = document.notebook.settings.pageGap ?? 48;
  const pageOffsets = useMemo(
    () => getBookPageOffsets(document.pages, pageGap),
    [document.pages, pageGap]
  );
  const notebookHeight = useMemo(
    () => bookHeight(document.pages, pageGap),
    [document.pages, pageGap]
  );
  const scopedObjects = useMemo(
    () =>
      document.objects.filter((object) =>
        document.notebook.mode === "whiteboard" ? !object.pageId : object.pageId === activePage?.id
      ),
    [document.objects, document.notebook.mode, activePage?.id]
  );
  const origin = useMemo(
    () => getDocumentOrigin(document, activePage, viewSize),
    [document, activePage, viewSize]
  );

  useEffect(() => {
    if (
      document.notebook.mode === "book" &&
      !document.pages.some((page) => page.id === currentPageId)
    )
      setCurrentPageId(document.pages[0]?.id);
  }, [document.notebook.mode, document.pages, currentPageId]);
  useEffect(() => {
    engine.current.setObjects(scopedObjects);
  }, [scopedObjects]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => localStorage.setItem("notylo-ink-palette", JSON.stringify(palette)), [palette]);
  useEffect(
    () => localStorage.setItem("notylo-floating-palette", String(showPalette)),
    [showPalette]
  );
  useEffect(
    () => localStorage.setItem("notylo-shape-recognition", String(shapeRecognition)),
    [shapeRecognition]
  );
  useEffect(
    () => localStorage.setItem("notylo-sidebar-position", sidebarPosition),
    [sidebarPosition]
  );
  useEffect(() => localStorage.setItem("notylo-stylus-only", String(stylusOnly)), [stylusOnly]);
  useEffect(() => localStorage.setItem("notylo-brush-id", brushId), [brushId]);
  useEffect(() => localStorage.setItem("notylo-eraser-mode", eraserMode), [eraserMode]);
  useEffect(() => localStorage.setItem("notylo-eraser-size", String(eraserSize)), [eraserSize]);
  useEffect(() => {
    localStorage.setItem("notylo-pressure-sensitivity", String(inkDynamics.pressureSensitivity));
    localStorage.setItem("notylo-pressure-width", String(inkDynamics.pressureAffectsWidth));
    localStorage.setItem("notylo-pressure-opacity", String(inkDynamics.pressureAffectsOpacity));
    localStorage.setItem("notylo-tilt-angle", String(inkDynamics.tiltAffectsAngle));
  }, [inkDynamics]);
  useEffect(
    () => () => {
      const timer = straightenGestureRef.current?.timer;
      if (timer !== undefined) window.clearTimeout(timer);
      if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
      if (resizeFrameRef.current !== undefined) window.cancelAnimationFrame(resizeFrameRef.current);
    },
    []
  );

  const clearStraightenGesture = () => {
    const timer = straightenGestureRef.current?.timer;
    if (timer !== undefined) window.clearTimeout(timer);
    straightenGestureRef.current = undefined;
  };
  const scheduleStraightening = (pointerId: number, point: Point) => {
    const current = straightenGestureRef.current;
    if (!current || current.pointerId !== pointerId) return;
    if (current.timer !== undefined) window.clearTimeout(current.timer);
    current.lastMotionPoint = point;
    current.timer = window.setTimeout(() => {
      const gesture = straightenGestureRef.current;
      const draft = draftRef.current;
      if (!gesture || gesture.pointerId !== pointerId || !draft) return;
      const minimumLength = 20 / cameraRef.current.zoom;
      if (!isApproximatelyStraight(draft.points, minimumLength)) return;
      const start = draft.points[0]!;
      const end = draft.points.at(-1)!;
      draft.straightLine = { points: [start, end], startedAt: performance.now() };
      gesture.timer = undefined;
    }, STRAIGHTEN_DELAY_MS);
  };

  const setColor = (color: string, index = paletteIndex) => {
    setInkColor(color);
    setPaletteIndex(index);
  };
  const updatePaletteColor = (color: string, index = paletteIndex) => {
    setInkColor(color);
    setPaletteIndex(index);
    setPalette((current) =>
      current.map((value, currentIndex) => (currentIndex === index ? color : value))
    );
  };

  const worldAt = useCallback(
    (event: Pick<ReactPointerEvent, "clientX" | "clientY">): Point => {
      const bounds = viewportRef.current!.getBoundingClientRect();
      return screenToWorld(
        { x: event.clientX - bounds.left - origin.x, y: event.clientY - bounds.top - origin.y },
        cameraRef.current
      );
    },
    [origin]
  );
  const pageAt = useCallback(
    (world: Point) => {
      if (document.notebook.mode !== "book") return { page: activePage, point: world };
      const page = document.pages.find((item) => {
        const top = pageOffsets[item.id] ?? 0;
        return (
          world.x >= 0 && world.x <= item.width && world.y >= top && world.y <= top + item.height
        );
      });
      return page
        ? { page, point: { x: world.x, y: world.y - (pageOffsets[page.id] ?? 0) } }
        : undefined;
    },
    [activePage, document.notebook.mode, document.pages, pageOffsets]
  );
  const interactionPointAt = useCallback(
    (event: Pick<ReactPointerEvent, "clientX" | "clientY">, inset = 0): Point => {
      const world = worldAt(event);
      if (document.notebook.mode !== "book") return world;
      const page = interactionPageRef.current ?? activePage;
      if (!page) return world;
      const y = world.y - (pageOffsets[page.id] ?? 0);
      return {
        x: Math.max(inset, Math.min(page.width - inset, world.x)),
        y: Math.max(inset, Math.min(page.height - inset, y))
      };
    },
    [activePage, document.notebook.mode, pageOffsets, worldAt]
  );
  const syncSelection = useCallback(() => setSelectedIds(engine.current.selection), []);
  const queueDragOffset = useCallback((offset: Point) => {
    dragOffsetRef.current = offset;
    if (dragFrameRef.current !== undefined) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = undefined;
      setDragOffset(dragOffsetRef.current);
    });
  }, []);
  const resetDragOffset = useCallback(() => {
    if (dragFrameRef.current !== undefined) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    dragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
  }, []);
  const keepInsidePage = useCallback(
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
    (point: Point) => {
      resizePointRef.current = point;
      if (resizeFrameRef.current !== undefined) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = undefined;
        const activeState = dragRef.current;
        const activePoint = resizePointRef.current;
        if (!activeState || activeState.kind !== "resize" || !activePoint) return;
        const preview = resizeObjectsAt(activeState, activePoint);
        setResizePreview(preview);
      });
    },
    [resizeObjectsAt]
  );
  const clearResizePreview = useCallback(() => {
    if (resizeFrameRef.current !== undefined) window.cancelAnimationFrame(resizeFrameRef.current);
    resizeFrameRef.current = undefined;
    setResizePreview(undefined);
  }, []);

  const previewEraserGesture = () => {
    const gesture = eraserGestureRef.current;
    if (!gesture) return;
    const candidates = gesture.sourceIndex.objectsInViewport(
      eraserGestureBounds(gesture.path, eraserSize, 64)
    );
    const result = eraseObjects(candidates, gesture.path, eraserSize, eraserMode);
    gesture.result = result;
    props.onReplace(() =>
      result.before.length
        ? applyOperation(gesture.baseDocument, {
            kind: "update-objects",
            before: result.before,
            after: result.after,
            label: t("ops.eraserPreview")
          })
        : gesture.baseDocument
    );
  };

  const finishEraserGesture = () => {
    const gesture = eraserGestureRef.current;
    eraserGestureRef.current = undefined;
    const result = gesture?.result;
    if (!result?.before.length) return;
    props.onUpdate(
      result.before,
      result.after,
      eraserMode === "object" ? t("ops.eraseObjects") : t("ops.eraseStroke")
    );
  };

  const addAt = useCallback(
    (nextTool: Tool, point: Point) => {
      const base = {
        notebookId: document.notebook.id,
        ...(document.notebook.mode === "book" && interactionPageRef.current
          ? { pageId: interactionPageRef.current.id }
          : {}),
        x: point.x,
        y: point.y,
        width: 180,
        height: 64,
        zIndex: document.objects.length + 1
      };
      let object: DocumentObject | undefined;
      if (nextTool === "text") object = newText(base);
      if (nextTool === "math") object = newMath({ ...base, width: 220, height: 78 });
      if (nextTool === "shape") object = newShape({ ...base, width: 160, height: 100 });
      if (nextTool === "table") object = newTable({ ...base, width: 390, height: 150 });
      if (object) {
        props.onAdd(keepInsidePage(object));
        engine.current.select([object.id]);
        syncSelection();
        setTool("select");
        if (object.type === "text") setShowInspector(true);
      }
    },
    [document, keepInsidePage, props, syncSelection]
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isInkTool = tool === "pen" || tool === "pencil" || tool === "highlighter";
    const isShapeDrawing = tool === "shape" && shapeRecognition;
    const isIconDrawing = tool === "icon";
    const isDirectManipulationTool =
      isInkTool ||
      isShapeDrawing ||
      isIconDrawing ||
      tool === "eraser" ||
      tool === "lasso" ||
      tool === "hand";
    if (event.button !== 0 && event.button !== 1 && event.pointerType !== "pen") return;

    if (event.pointerType === "pen") {
      activePenPointers.current.add(event.pointerId);
      penRecentAt.current = Date.now();
    }

    if (event.pointerType === "touch") {
      const touchNavigates = readOnly || (stylusOnly && (isInkTool || tool === "eraser"));
      if (touchNavigates && !readOnly && activePenPointers.current.size > 0) {
        event.preventDefault();
        return;
      }

      touchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.current.size === 2) {
        const points = [...touchPointers.current.values()];
        pinch.current = {
          distance: distance(points[0]!, points[1]!),
          zoom: cameraRef.current.zoom,
          center: midpoint(points[0]!, points[1]!),
          camera: cameraRef.current
        };
        draftRef.current = undefined;
        if (eraserGestureRef.current?.result.before.length) finishEraserGesture();
        else eraserGestureRef.current = undefined;
        interactionPageRef.current = undefined;
        dragRef.current = undefined;
        setCanvasActive(false);
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      if (touchNavigates) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        interactionPageRef.current = undefined;
        dragRef.current = { kind: "pan", start: { x: event.clientX, y: event.clientY } };
        return;
      }
    }

    if (readOnly) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      interactionPageRef.current = undefined;
      dragRef.current = { kind: "pan", start: { x: event.clientX, y: event.clientY } };
      return;
    }

    if (event.button === 1 && event.pointerType === "mouse") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      interactionPageRef.current = undefined;
      dragRef.current = { kind: "pan", start: { x: event.clientX, y: event.clientY } };
      return;
    }
    if (
      document.notebook.settings.palmRejection === "auto" &&
      event.pointerType === "touch" &&
      Date.now() - penRecentAt.current < 800
    )
      return;
    if (isDirectManipulationTool || event.button === 1) event.preventDefault();
    const hitPage = pageAt(worldAt(event));
    if (document.notebook.mode === "book" && !hitPage && tool !== "hand" && event.button !== 1)
      return;
    if (hitPage?.page && hitPage.page.id !== activePage?.id) setCurrentPageId(hitPage.page.id);
    interactionPageRef.current = hitPage?.page ?? activePage;
    const drawInset =
      isInkTool || isShapeDrawing ? (tool === "highlighter" ? inkSize * 2 : inkSize / 2) + 2 : 0;
    const point = interactionPointAt(event, drawInset);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (isInkTool || isShapeDrawing) {
      clearStraightenGesture();
      draftRef.current = {
        points: [toInkPoint(event, point)],
        tool: isShapeDrawing ? "pen" : (tool as DraftInk["tool"]),
        color: inkColor,
        size: tool === "highlighter" ? inkSize * 4 : inkSize,
        smoothing: inkSmoothing,
        captureZoom: cameraRef.current.zoom,
        brushId: isShapeDrawing ? "ink-fineliner" : brushId,
        dynamics: inkDynamics,
        ...(isShapeDrawing ? { recognizeShape: true } : {})
      };
      setCanvasActive(true);
      dragRef.current = { kind: "draw", start: point };
      if (isInkTool)
        straightenGestureRef.current = { pointerId: event.pointerId, lastMotionPoint: point };
      return;
    }
    if (isIconDrawing) {
      shapeDraftRef.current = iconShapeBetween(
        point,
        point,
        iconShape,
        document.notebook.id,
        interactionPageRef.current?.id,
        document.objects.length + 1,
        inkColor
      );
      setCanvasActive(true);
      dragRef.current = { kind: "draw-icon", start: point };
      return;
    }
    if (tool === "eraser") {
      const erasePageId = interactionPageRef.current?.id;
      const source = props.documentRef.current.objects.filter((object) =>
        document.notebook.mode === "whiteboard" ? !object.pageId : object.pageId === erasePageId
      );
      const sourceIndex = new CanvasEngine();
      sourceIndex.setObjects(source);
      engine.current.select([]);
      syncSelection();
      eraserGestureRef.current = {
        baseDocument: props.documentRef.current,
        path: [point],
        sourceIndex,
        result: { before: [], after: [] }
      };
      eraserLastApplyAt.current = event.timeStamp;
      dragRef.current = { kind: "erase", start: point };
      setCanvasActive(true);
      previewEraserGesture();
      return;
    }
    if (tool === "hand" || event.button === 1) {
      dragRef.current = { kind: "pan", start: { x: event.clientX, y: event.clientY } };
      return;
    }
    if (tool === "lasso") {
      setLasso([point]);
      dragRef.current = { kind: "lasso", start: point };
      return;
    }
    if (tool !== "select") {
      addAt(tool, point);
      return;
    }
    const hit = engine.current.objectAt(point);
    if (hit) {
      engine.current.select(
        [hit.id],
        event.shiftKey ? "add" : event.ctrlKey || event.metaKey ? "toggle" : "replace"
      );
      syncSelection();
      if (hit.type === "text" && !event.shiftKey && !event.ctrlKey && !event.metaKey)
        setShowInspector(true);
      resetDragOffset();
      dragRef.current = {
        kind: "move",
        start: point,
        originals: scopedObjects.filter((object) => engine.current.selection.includes(object.id))
      };
    } else {
      engine.current.select([]);
      syncSelection();
      setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
      dragRef.current = { kind: "select", start: point };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      if (!readOnly && stylusOnly && activePenPointers.current.size > 0) return;
      touchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinch.current && touchPointers.current.size >= 2) {
      const points = [...touchPointers.current.values()];
      const currentDistance = distance(points[0]!, points[1]!);
      const rect = viewportRef.current!.getBoundingClientRect();
      const currentCenter = midpoint(points[0]!, points[1]!);
      const initialAt = {
        x: pinch.current.center.x - rect.left - origin.x,
        y: pinch.current.center.y - rect.top - origin.y
      };
      const currentAt = {
        x: currentCenter.x - rect.left - origin.x,
        y: currentCenter.y - rect.top - origin.y
      };
      const before = screenToWorld(initialAt, pinch.current.camera);
      const zoom = Math.min(
        10,
        Math.max(0.05, (pinch.current.zoom * currentDistance) / pinch.current.distance)
      );
      setCamera({ x: currentAt.x - before.x * zoom, y: currentAt.y - before.y * zoom, zoom });
      event.preventDefault();
      return;
    }
    const state = dragRef.current;
    if (!state) return;
    if (
      state.kind === "draw" ||
      state.kind === "erase" ||
      state.kind === "lasso" ||
      state.kind === "pan" ||
      state.kind === "move" ||
      state.kind === "resize" ||
      state.kind === "arrow-point"
    )
      event.preventDefault();
    if (state.kind === "pan") {
      setCamera((current) => ({
        ...current,
        x: current.x + event.clientX - state.start.x,
        y: current.y + event.clientY - state.start.y
      }));
      dragRef.current = { ...state, start: { x: event.clientX, y: event.clientY } };
      return;
    }
    if (readOnly) return;
    const drawInset = state.kind === "draw" ? (draftRef.current?.size ?? inkSize) / 2 + 2 : 0;
    const point = interactionPointAt(event, drawInset);
    if (state.kind === "draw" && draftRef.current) {
      const captureSpacing = captureSpacingForZoom(cameraRef.current.zoom, draftRef.current.size);
      appendCoalescedInkPoints(
        draftRef.current.points,
        event,
        (sample) => interactionPointAt(sample, drawInset),
        captureSpacing
      );
      const gesture = straightenGestureRef.current;
      const end = draftRef.current.points.at(-1);
      const stillness = STRAIGHTEN_STILLNESS_PX / cameraRef.current.zoom;
      if (
        gesture &&
        gesture.pointerId === event.pointerId &&
        end &&
        distance(end, gesture.lastMotionPoint) >= stillness
      ) {
        draftRef.current.straightLine = undefined;
        scheduleStraightening(event.pointerId, end);
      }
      return;
    }
    if (state.kind === "erase") {
      if (event.timeStamp - eraserLastApplyAt.current < 14) return;
      const gesture = eraserGestureRef.current;
      if (gesture) {
        appendEraserPoint(gesture.path, point, eraserSize);
        previewEraserGesture();
      }
      eraserLastApplyAt.current = event.timeStamp;
      return;
    }
    if (state.kind === "draw-icon") {
      shapeDraftRef.current = iconShapeBetween(
        state.start,
        point,
        iconShape,
        document.notebook.id,
        interactionPageRef.current?.id,
        document.objects.length + 1,
        inkColor
      );
      return;
    }
    if (state.kind === "move") {
      queueDragOffset({ x: point.x - state.start.x, y: point.y - state.start.y });
      return;
    }
    if (state.kind === "select") {
      setSelectionRect(normalizeRect(state.start, point));
      return;
    }
    if (state.kind === "lasso") setLasso((current) => [...current, point]);
    if (state.kind === "resize") {
      queueResizePreview(point);
      return;
    }
    if (state.kind === "arrow-point") resizePointRef.current = point;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    setCanvasActive(false);
    if (event.pointerType === "pen") activePenPointers.current.delete(event.pointerId);
    if (event.pointerType === "touch") {
      touchPointers.current.delete(event.pointerId);
      if (touchPointers.current.size < 2) pinch.current = undefined;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const state = dragRef.current;
    dragRef.current = undefined;
    if (readOnly) {
      interactionPageRef.current = undefined;
      return;
    }
    const straightenGesture = straightenGestureRef.current;
    const snappedToLine =
      straightenGesture?.pointerId === event.pointerId && draftRef.current?.straightLine;
    clearStraightenGesture();
    if (!state) return;
    if (state.kind === "draw" && draftRef.current) {
      const draft = draftRef.current;
      draftRef.current = undefined;
      if (!snappedToLine) {
        const drawInset = draft.size / 2 + 2;
        const captureSpacing = captureSpacingForZoom(cameraRef.current.zoom, draft.size);
        appendCoalescedInkPoints(
          draft.points,
          event,
          (sample) => interactionPointAt(sample, drawInset),
          captureSpacing
        );
      }
      if (draft.points.length > 0) {
        const compactTolerance = Math.max(0.22, Math.min(0.72, draft.size * 0.075));
        const points = snappedToLine
          ? [...snappedToLine.points]
          : compactInkPoints(draft.points, compactTolerance);
        const bounds = objectBoundsFromPoints(points);
        const ink = newInk({
          notebookId: document.notebook.id,
          ...(document.notebook.mode === "book" && interactionPageRef.current
            ? { pageId: interactionPageRef.current.id }
            : {}),
          ...bounds,
          zIndex: document.objects.length + 1,
          points,
          color: draft.color,
          size: draft.size,
          tool: draft.tool,
          smoothing: draft.smoothing,
          captureZoom: draft.captureZoom,
          brushId: draft.brushId,
          dynamics: draft.dynamics
        });
        props.onAdd(keepInsidePage(ink));
        if (draft.recognizeShape) {
          const shape = recognizeInkShape(ink);
          if (shape) {
            window.setTimeout(() => {
              if (props.documentRef.current.objects.some((object) => object.id === ink.id))
                props.onUpdate(
                  [ink],
                  [{ ...shape, id: ink.id, createdAt: ink.createdAt }],
                  t("ops.adjustShape")
                );
            }, 2000);
          }
        }
      }
    }
    if (state.kind === "erase") {
      const gesture = eraserGestureRef.current;
      if (gesture) {
        appendEraserPoint(gesture.path, interactionPointAt(event), eraserSize);
        previewEraserGesture();
      }
      finishEraserGesture();
      interactionPageRef.current = undefined;
      return;
    }
    if (state.kind === "draw-icon") {
      const shape = iconShapeBetween(
        state.start,
        interactionPointAt(event),
        iconShape,
        document.notebook.id,
        interactionPageRef.current?.id,
        document.objects.length + 1,
        inkColor
      );
      shapeDraftRef.current = undefined;
      if (Math.max(shape.width, shape.height) >= 4) {
        props.onAdd(keepInsidePage(shape));
        engine.current.select([shape.id]);
        syncSelection();
        setTool("select");
      }
    }
    if (state.kind === "move" && state.originals) {
      const offset = dragOffsetRef.current;
      if (offset.x || offset.y)
        props.onUpdate(
          state.originals,
          state.originals.map((object) =>
            keepInsidePage(transformObject(object, { dx: offset.x, dy: offset.y }))
          ),
          t("ops.moveSelection")
        );
      resetDragOffset();
    }
    if (
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
    }
    if (
      state.kind === "arrow-point" &&
      state.arrow &&
      state.pointIndex !== undefined &&
      resizePointRef.current
    ) {
      const node = resizePointRef.current;
      const points = state.arrow.points?.map((point, index) =>
        index === state.pointIndex
          ? {
              x: Math.max(0, Math.min(state.arrow!.width, node.x - state.arrow!.x)),
              y: Math.max(0, Math.min(state.arrow!.height, node.y - state.arrow!.y))
            }
          : point
      );
      if (points)
        props.onUpdate(
          [state.arrow],
          [{ ...state.arrow, points, updatedAt: Date.now() }],
          t("ops.editArrow")
        );
      resizePointRef.current = undefined;
    }
    if (state.kind === "select" && selectionRect) {
      engine.current.selectRect(selectionRect, false);
      syncSelection();
      setSelectionRect(undefined);
    }
    if (state.kind === "lasso") {
      engine.current.selectLasso(lasso);
      syncSelection();
      setLasso([]);
    }
    interactionPageRef.current = undefined;
  };

  const insertFiles = useCallback(
    async (files: readonly File[], point?: Point) => {
      for (const file of files) {
        const position = point ?? defaultPosition(document.objects.length);
        const objectBase = {
          notebookId: document.notebook.id,
          ...(document.notebook.mode === "book" && activePage ? { pageId: activePage.id } : {}),
          x: position.x,
          y: position.y,
          zIndex: document.objects.length + 1
        };
        const hash = await sha256(file);
        if (file.type.startsWith("image/")) {
          const asset = await attachToDocument(
            props.onReplace,
            { type: "image", mimeType: file.type, size: file.size, hash, originalName: file.name },
            file
          );
          props.onAdd({
            id: createId(),
            ...objectBase,
            type: "image",
            assetId: asset.id,
            alt: file.name,
            width: 360,
            height: 240,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const asset = await attachToDocument(
            props.onReplace,
            {
              type: "pdf",
              mimeType: file.type || "application/pdf",
              size: file.size,
              hash,
              originalName: file.name
            },
            file
          );
          props.onAdd({
            id: createId(),
            ...objectBase,
            type: "pdf",
            assetId: asset.id,
            pageNumber: 1,
            pageCount: 1,
            zoom: 1,
            width: 500,
            height: 640,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        } else if (file.name.toLowerCase().endsWith(".docx")) {
          const buffer = await file.arrayBuffer();
          const html = DOMPurify.sanitize(
            (await mammoth.convertToHtml({ arrayBuffer: buffer })).value
          );
          const asset = await attachToDocument(
            props.onReplace,
            {
              type: "docx",
              mimeType:
                file.type ||
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              size: file.size,
              hash,
              originalName: file.name
            },
            file
          );
          props.onAdd({
            id: createId(),
            ...objectBase,
            type: "docx",
            assetId: asset.id,
            html,
            plainText: new DOMParser().parseFromString(html, "text/html").body.textContent ?? "",
            width: 540,
            height: 420,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        } else if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
          const workbook = XLSX.read(await file.arrayBuffer());
          const sheetName = workbook.SheetNames[0] ?? t("factory.sheet1");
          const sheet = workbook.Sheets[sheetName];
          const rows = sheet
            ? XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 })
            : [];
          const cells: Record<string, string | number> = {};
          rows.slice(0, 30).forEach((row, rowIndex) =>
            row.forEach((value, columnIndex) => {
              if (value !== undefined)
                cells[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] = value;
            })
          );
          const asset = await attachToDocument(
            props.onReplace,
            {
              type: "spreadsheet",
              mimeType:
                file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              size: file.size,
              hash,
              originalName: file.name
            },
            file
          );
          props.onAdd({
            id: createId(),
            ...objectBase,
            type: "spreadsheet",
            assetId: asset.id,
            sheetName,
            cells,
            columnWidths: {},
            rowHeights: {},
            width: 540,
            height: 310,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        } else if (/\.(txt|md)$/i.test(file.name)) {
          props.onAdd(newText({ ...objectBase, width: 420, height: 180, text: await file.text() }));
        }
      }
    },
    [document, activePage, props]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (readOnly) return;
      const point = defaultPosition(documentRefCount(props.documentRef));
      const own = event.clipboardData?.getData(INTERNAL_CLIPBOARD);
      if (own) {
        try {
          const objects = JSON.parse(own) as DocumentObject[];
          objects.forEach((object) =>
            props.onAdd({
              ...object,
              id: createId(),
              x: object.x + 24,
              y: object.y + 24,
              createdAt: Date.now(),
              updatedAt: Date.now()
            })
          );
          event.preventDefault();
          return;
        } catch {
          /* fall through */
        }
      }
      const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (imageFiles.length) {
        event.preventDefault();
        void insertFiles(imageFiles, point);
        return;
      }
      const html = event.clipboardData?.getData("text/html");
      const text = event.clipboardData?.getData("text/plain");
      if (html || text) {
        event.preventDefault();
        const clean = html ? DOMPurify.sanitize(html) : (text ?? "");
        const plain = new DOMParser().parseFromString(clean, "text/html").body.textContent ?? clean;
        props.onAdd(
          newText({
            notebookId: document.notebook.id,
            ...(document.notebook.mode === "book" && activePage ? { pageId: activePage.id } : {}),
            x: point.x,
            y: point.y,
            width: 360,
            height: 90,
            zIndex: document.objects.length + 1,
            text: plain
          })
        );
      }
    };
    const onCopy = (event: ClipboardEvent) => {
      if (readOnly) return;
      const selected = props.documentRef.current.objects.filter((object) =>
        selectedIds.includes(object.id)
      );
      if (!selected.length) return;
      internalClipboard.current = selected;
      event.clipboardData?.setData(INTERNAL_CLIPBOARD, JSON.stringify(selected));
      event.preventDefault();
    };
    const onKeys = (event: KeyboardEvent) => {
      if (readOnly) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === "INPUT") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) props.onRedo();
        else props.onUndo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        props.onRedo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selected = props.documentRef.current.objects.filter((object) =>
          selectedIds.includes(object.id)
        );
        selected.forEach((object) =>
          props.onAdd({
            ...object,
            id: createId(),
            x: object.x + 24,
            y: object.y + 24,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
        );
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selected = props.documentRef.current.objects.filter((object) =>
          selectedIds.includes(object.id)
        );
        if (selected.length) {
          event.preventDefault();
          props.onDelete(selected);
          engine.current.select([]);
          syncSelection();
        }
      }
      const shortcuts: Partial<Record<string, Tool>> = {
        v: "select",
        p: "pen",
        e: "eraser",
        t: "text",
        h: "hand"
      };
      if (!event.ctrlKey && !event.metaKey && shortcuts[event.key.toLowerCase()]) {
        const nextTool = shortcuts[event.key.toLowerCase()]!;
        setTool(nextTool);
        if (nextTool === "pen") setBrushId("ink-fineliner");
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", onCopy);
    window.addEventListener("keydown", onKeys);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("keydown", onKeys);
    };
  }, [document, activePage, selectedIds, insertFiles, props, readOnly, syncSelection]);

  const updateObject = (
    before: DocumentObject,
    after: DocumentObject,
    label = t("ops.editObject")
  ) => props.onUpdate([before], [after], label);
  const selectedObjects = scopedObjects.filter((object) => selectedIds.includes(object.id));
  const visualSelectedObjects = resizePreview ?? selectedObjects;
  const resizePreviewById = new Map((resizePreview ?? []).map((object) => [object.id, object] as const));
  const selectedTextObject =
    selectedObjects.length === 1 && selectedObjects[0]?.type === "text"
      ? selectedObjects[0]
      : undefined;
  const runOcr = async (mode: OcrMode) => {
    if (ocrBusy) return;
    setOcrBusy(true);
    setOcrStatus(mode === "math" ? t("ocr.preparingFormula") : t("ocr.preparingText"));
    try {
      const confidence = await recognizeSelected(selectedObjects, props.onAdd, mode);
      setOcrStatus(
        mode === "math"
          ? t("ocr.formulaAdded", { confidence })
          : t("ocr.textAdded", { confidence })
      );
    } catch (error) {
      setOcrStatus(error instanceof Error ? error.message : t("ocr.failed"));
    } finally {
      setOcrBusy(false);
    }
  };

  return (
    <section className={`editor-shell${props.publicMode ? ` public-editor public-${props.publicMode}` : ""}`}>
      <EditorHeader
        document={document}
        saveState={props.saveState}
        readOnly={readOnly}
        {...(props.publicMode ? { publicMode: props.publicMode } : {})}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onBack={() => {
          if (props.publicMode) window.location.assign("/");
          else history.back();
        }}
        onExport={() => setShowExport(true)}
        {...(props.onShare ? { onShare: props.onShare } : {})}
        toolsOpen={mobileToolsOpen}
        onToggleTools={() => setMobileToolsOpen((value) => !value)}
      />
      <div
        className={`editor-main sidebar-${sidebarPosition} ${
          mobileToolsOpen ? "mobile-tools-open" : ""
        }`}
      >
        {!readOnly && (
          <EditorToolRail
            tool={tool}
            showBrushes={showBrushes}
            showIcons={showIcons}
            inspectorOpen={showInspector}
            onToolChange={(nextTool) => {
              setTool(nextTool);
              setMobileToolsOpen(false);
              if (nextTool === "pen") setBrushId("ink-fineliner");
              if (nextTool === "pencil") setBrushId("pencil-sketch");
              if (nextTool === "highlighter") setBrushId("highlighter-flat");
            }}
            onToggleBrushes={() => setShowBrushes((value) => !value)}
            onToggleIcons={() => {
              setShowIcons((value) => !value);
              setShowBrushes(false);
            }}
            onImport={() =>
              void webPlatform
                .openFiles("image/*,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md", true)
                .then((files) => insertFiles(files))
            }
            onToggleInspector={() => {
              setShowInspector((value) => !value);
              setMobileToolsOpen(false);
            }}
          />
        )}
        <div
          className={`canvas-area ${
            tool === "pen" ||
            tool === "pencil" ||
            tool === "highlighter" ||
            tool === "eraser" ||
            tool === "lasso" ||
            tool === "hand"
              ? "canvas-area--direct-manipulation"
              : ""
          }`}
          ref={viewportRef}
          style={
            document.notebook.mode === "whiteboard"
              ? whiteboardStyle(document.notebook.settings.whiteboardBackground)
              : undefined
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDragStart={(event) => event.preventDefault()}
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              const rect = viewportRef.current!.getBoundingClientRect();
              const at = {
                x: event.clientX - rect.left - origin.x,
                y: event.clientY - rect.top - origin.y
              };
              const factor = event.deltaY > 0 ? 0.9 : 1.1;
              const before = screenToWorld(at, cameraRef.current);
              const zoom = Math.min(10, Math.max(0.05, cameraRef.current.zoom * factor));
              setCamera({ x: at.x - before.x * zoom, y: at.y - before.y * zoom, zoom });
              return;
            }
            if (document.notebook.mode !== "book") return;
            event.preventDefault();
            const current = cameraRef.current;
            const minY = Math.min(0, viewSize.height - 64 - notebookHeight * current.zoom);
            const nextY = Math.max(minY, Math.min(0, current.y - event.deltaY));
            const viewportCenter = (-nextY + viewSize.height / 2) / current.zoom;
            const visiblePage = document.pages.find((page) => {
              const top = pageOffsets[page.id] ?? 0;
              return viewportCenter >= top && viewportCenter <= top + page.height;
            });
            if (visiblePage) setCurrentPageId(visiblePage.id);
            const reachedBottom = nextY <= minY + 1;
            if (event.deltaY <= 0 || !reachedBottom) autoPageLockedRef.current = false;
            if (!readOnly && event.deltaY > 0 && reachedBottom && !autoPageLockedRef.current) {
              autoPageLockedRef.current = true;
              setCamera({ ...current, y: nextY });
              props.onAddPage();
              return;
            }
            setCamera({ ...current, y: nextY });
          }}
          onDrop={(event) => {
            if (readOnly) return;
            event.preventDefault();
            const hitPage = pageAt(worldAt(event));
            if (document.notebook.mode === "book" && !hitPage) return;
            if (hitPage?.page && hitPage.page.id !== activePage?.id)
              setCurrentPageId(hitPage.page.id);
            void insertFiles(
              Array.from(event.dataTransfer.files),
              hitPage?.point ?? worldAt(event)
            );
          }}
          onDragOver={(event) => event.preventDefault()}
        >
          <CanvasLayer
            documentRef={props.documentRef}
            activePageId={interactionPageRef.current?.id ?? activePage?.id}
            pageOffsets={pageOffsets}
            documentMode={document.notebook.mode}
            origin={origin}
            cameraRef={cameraRef}
            draftRef={draftRef}
            shapeDraftRef={shapeDraftRef}
            selection={visualSelectedObjects}
            selectionRect={selectionRect}
            lasso={lasso}
            dragOffset={dragOffset}
            renderContinuously={canvasActive}
          />
          {!readOnly && (
            <WorkspaceDrawers
              tool={tool}
              paletteVisible={showPalette}
              palette={palette}
              paletteIndex={paletteIndex}
              paletteInputRefs={paletteInputRefs}
              showBrushes={showBrushes}
              showIcons={showIcons}
              iconShape={iconShape}
              brushId={brushId}
              onColor={setColor}
              onPaletteColor={updatePaletteColor}
              onCloseBrushes={() => setShowBrushes(false)}
              onBrush={(brush) => {
                setTool(brush.tool);
                setBrushId(brush.id);
                setInkSize(brush.size);
                setInkSmoothing(brush.smoothing);
                setShowBrushes(false);
              }}
              onCloseIcons={() => setShowIcons(false)}
              onIcon={(shape) => {
                setIconShape(shape);
                setTool("icon");
                setShowIcons(false);
              }}
            />
          )}
          <div
            className="document-space"
            style={{
              width:
                document.notebook.mode === "book"
                  ? Math.max(...document.pages.map((page) => page.width))
                  : undefined,
              height: document.notebook.mode === "book" ? notebookHeight : undefined,
              transform: `translate(${origin.x + camera.x}px, ${origin.y + camera.y}px) scale(${camera.zoom})`
            }}
          >
            {document.notebook.mode === "book" &&
              document.pages.map((page) => (
                <Paper key={page.id} page={page} offsetY={pageOffsets[page.id] ?? 0} />
              ))}
            {(document.notebook.mode === "book"
              ? document.objects.filter((object) => Boolean(object.pageId))
              : scopedObjects
            )
              .filter((object) => object.type !== "ink" && object.type !== "shape")
              .map((object) => {
                const renderedObject = resizePreviewById.get(object.id) ?? object;
                if (renderedObject.type === "ink" || renderedObject.type === "shape") return null;
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
              })}
            {!readOnly && selectedObjects.length > 0 && (
              <SelectionBox
                objects={visualSelectedObjects}
                dragOffset={dragOffset}
                offsetY={activePage ? (pageOffsets[activePage.id] ?? 0) : 0}
                onResizeStart={(handle, event) => {
                  const bounds = engine.current.selectionBounds();
                  if (!bounds) return;
                  event.stopPropagation();
                  viewportRef.current?.setPointerCapture(event.pointerId);
                  const start = interactionPointAt(event);
                  resizePointRef.current = start;
                  dragRef.current = {
                    kind: "resize",
                    start,
                    originals: selectedObjects,
                    bounds,
                    handle
                  };
                }}
              />
            )}
            {!readOnly &&
              selectedObjects.length === 1 &&
              selectedObjects[0]?.type === "shape" &&
              selectedObjects[0].shape === "poly-arrow" &&
              selectedObjects[0].points && (
                <ArrowPointHandles
                  arrow={selectedObjects[0] as ShapeObject}
                  offsetY={activePage ? (pageOffsets[activePage.id] ?? 0) : 0}
                  onStart={(index, event) => {
                    event.stopPropagation();
                    viewportRef.current?.setPointerCapture(event.pointerId);
                    const start = interactionPointAt(event);
                    resizePointRef.current = start;
                    dragRef.current = {
                      kind: "arrow-point",
                      start,
                      arrow: selectedObjects[0] as ShapeObject,
                      pointIndex: index
                    };
                  }}
                />
              )}
          </div>
          {document.notebook.mode === "whiteboard" && (
            <div className="whiteboard-coordinate">
              {Math.round(-camera.x / camera.zoom)}, {Math.round(-camera.y / camera.zoom)}
            </div>
          )}
          <div className="zoom-controls" onPointerDown={(event) => event.stopPropagation()}>
            <button
              onClick={() =>
                setCamera((value) => ({ ...value, zoom: Math.max(0.05, value.zoom * 0.9) }))
              }
            >
              −
            </button>
            <button onClick={() => setCamera(DEFAULT_CAMERA)}>
              {Math.round(camera.zoom * 100)}%
            </button>
            <button
              onClick={() =>
                setCamera((value) => ({ ...value, zoom: Math.min(10, value.zoom * 1.1) }))
              }
            >
              +
            </button>
          </div>
          {document.notebook.mode === "book" && (
            <PageNavigator
              pages={document.pages}
              current={activePage?.id}
              onChange={(id) => {
                interactionPageRef.current = undefined;
                setCurrentPageId(id);
                const offset = pageOffsets[id] ?? 0;
                setCamera((current) => ({ ...current, y: -offset * current.zoom }));
              }}
              onNew={props.onAddPage}
              canAdd={!readOnly}
            />
          )}
        </div>
        {showInspector && (
          <Inspector
            tool={tool}
            color={inkColor}
            size={inkSize}
            smoothing={inkSmoothing}
            dynamics={inkDynamics}
            eraserMode={eraserMode}
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
            paletteVisible={showPalette}
            sidebarPosition={sidebarPosition}
            stylusOnly={stylusOnly}
            shapeRecognition={shapeRecognition}
            whiteboardBackground={document.notebook.settings.whiteboardBackground}
            isWhiteboard={document.notebook.mode === "whiteboard"}
            pageGap={pageGap}
            autoCalculate={document.notebook.settings.autoCalculate}
            onColor={updatePaletteColor}
            onSize={setInkSize}
            onSmoothing={setInkSmoothing}
            onDynamics={setInkDynamics}
            onEraserMode={setEraserMode}
            onEraserSize={setEraserSize}
            onPaletteVisible={setShowPalette}
            onSidebarPosition={setSidebarPosition}
            onStylusOnly={setStylusOnly}
            onShapeRecognition={setShapeRecognition}
            onWhiteboardBackground={(background) =>
              props.onReplace((current) => ({
                ...current,
                notebook: {
                  ...current.notebook,
                  settings: { ...current.notebook.settings, whiteboardBackground: background }
                }
              }))
            }
            onPageGap={(nextGap) =>
              props.onReplace((current) => ({
                ...current,
                notebook: {
                  ...current.notebook,
                  settings: { ...current.notebook.settings, pageGap: nextGap }
                }
              }))
            }
            onAutoCalculate={(checked) =>
              props.onReplace((current) => ({
                ...current,
                notebook: {
                  ...current.notebook,
                  settings: { ...current.notebook.settings, autoCalculate: checked }
                }
              }))
            }
            onOcr={(mode) => void runOcr(mode)}
            onClose={() => setShowInspector(false)}
            ocrBusy={ocrBusy}
            ocrStatus={ocrStatus}
          />
        )}
      </div>
      {showExport && <ExportDialog document={document} onClose={() => setShowExport(false)} />}
    </section>
  );
}
