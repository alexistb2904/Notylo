import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent
} from "react";
import { GripVertical } from "lucide-react";
import type { Tool } from "./types";
import { BRUSHES, ICONS, type BrushPreset, type IconShape } from "./workspaceConstants";
import { readStoredPoint } from "./preferences";
import { t } from "../../i18n";

interface Props {
  readonly tool: Tool;
  readonly paletteVisible: boolean;
  readonly palette: readonly string[];
  readonly paletteIndex: number;
  readonly paletteInputRefs: MutableRefObject<(HTMLInputElement | null)[]>;
  readonly showBrushes: boolean;
  readonly showIcons: boolean;
  readonly iconShape: IconShape;
  readonly brushId: string;
  readonly size: number;
  readonly smoothing: number;
  onColor(color: string, index: number): void;
  onPaletteColor(color: string, index: number): void;
  onCloseBrushes(): void;
  onBrush(brush: BrushPreset): void;
  onSize(size: number): void;
  onSmoothing(smoothing: number): void;
  onCloseIcons(): void;
  onIcon(shape: IconShape): void;
}

const MOBILE_PALETTE_QUERY = "(max-width: 760px)";

export function WorkspaceDrawers({
  tool,
  paletteVisible,
  palette,
  paletteIndex,
  paletteInputRefs,
  showBrushes,
  showIcons,
  iconShape,
  brushId,
  size,
  smoothing,
  onColor,
  onPaletteColor,
  onCloseBrushes,
  onBrush,
  onSize,
  onSmoothing,
  onCloseIcons,
  onIcon
}: Props) {
  const mobilePalette = useRef(window.matchMedia(MOBILE_PALETTE_QUERY).matches).current;
  const paletteStorageKey = mobilePalette
    ? "notylo-floating-palette-position-mobile"
    : "notylo-floating-palette-position";
  const hadStoredPalettePosition = useRef(localStorage.getItem(paletteStorageKey) !== null);
  const [palettePosition, setPalettePosition] = useState(() =>
    readStoredPoint(paletteStorageKey, mobilePalette ? { x: 12, y: 86 } : { x: 18, y: 18 })
  );
  const paletteRef = useRef<HTMLDivElement>(null);
  const paletteDrag = useRef<
    { pointerId: number; startX: number; startY: number; x: number; y: number } | undefined
  >(undefined);

  const clampPalettePosition = useCallback(
    (position: { x: number; y: number }) => {
      const element = paletteRef.current;
      const host = element?.parentElement;
      if (!element || !host) return position;
      const edge = 8;
      const bottomClearance = mobilePalette ? 86 : edge;
      const maxX = Math.max(edge, host.clientWidth - element.offsetWidth - edge);
      const maxY = Math.max(edge, host.clientHeight - element.offsetHeight - bottomClearance);
      return {
        x: Math.min(maxX, Math.max(edge, position.x)),
        y: Math.min(maxY, Math.max(edge, position.y))
      };
    },
    [mobilePalette]
  );

  useEffect(() => {
    localStorage.setItem(paletteStorageKey, JSON.stringify(palettePosition));
  }, [palettePosition, paletteStorageKey]);

  useEffect(() => {
    const element = paletteRef.current;
    const host = element?.parentElement;
    if (!element || !host || !paletteVisible) return;

    if (mobilePalette && !hadStoredPalettePosition.current) {
      hadStoredPalettePosition.current = true;
      setPalettePosition(
        clampPalettePosition({
          x: Math.max(8, (host.clientWidth - element.offsetWidth) / 2),
          y: Math.max(8, host.clientHeight - element.offsetHeight - 86)
        })
      );
    } else {
      setPalettePosition((current) => clampPalettePosition(current));
    }

    const observer = new ResizeObserver(() =>
      setPalettePosition((current) => clampPalettePosition(current))
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [clampPalettePosition, mobilePalette, paletteVisible, tool]);

  const onPaletteGripDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    paletteDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: palettePosition.x,
      y: palettePosition.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPaletteGripMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = paletteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setPalettePosition(
      clampPalettePosition({
        x: drag.x + event.clientX - drag.startX,
        y: drag.y + event.clientY - drag.startY
      })
    );
  };
  const onPaletteGripUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (paletteDrag.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    paletteDrag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      {(tool === "pen" || tool === "pencil" || tool === "highlighter") && paletteVisible && (
        <div
          ref={paletteRef}
          className="floating-palette"
          style={
            {
              left: palettePosition.x,
              top: palettePosition.y,
              "--notylo-palette-x": `${palettePosition.x}px`,
              "--notylo-palette-y": `${palettePosition.y}px`
            } as CSSProperties
          }
          role="toolbar"
          aria-label={t("drawer.palette")}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="palette-grip"
            type="button"
            aria-label={t("drawer.movePalette")}
            title={t("drawer.movePalette")}
            onPointerDown={onPaletteGripDown}
            onPointerMove={onPaletteGripMove}
            onPointerUp={onPaletteGripUp}
            onPointerCancel={onPaletteGripUp}
          >
            <GripVertical size={15} />
          </button>
          {palette.map((color, index) => (
            <span className="palette-swatch" key={`${color}-${index}`}>
              <button
                className={index === paletteIndex ? "selected" : ""}
                style={{ "--swatch": color } as CSSProperties}
                onClick={() => onColor(color, index)}
                onDoubleClick={() => {
                  const input = paletteInputRefs.current[index];
                  if (input?.showPicker) input.showPicker();
                  else input?.click();
                }}
                aria-label={t("drawer.colorEdit", { index: index + 1 })}
                aria-pressed={index === paletteIndex}
              />
              <input
                ref={(element) => {
                  paletteInputRefs.current[index] = element;
                }}
                tabIndex={-1}
                aria-label={t("drawer.editColor", { index: index + 1 })}
                type="color"
                value={color}
                onChange={(event) => onPaletteColor(event.target.value, index)}
              />
            </span>
          ))}
        </div>
      )}
      {showBrushes && (
        <div
          className="brush-drawer"
          role="dialog"
          aria-label={t("drawer.brushesAndSizes")}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div>
            <strong>{t("tools.brushes")}</strong>
            <button onClick={onCloseBrushes} aria-label={t("common.close")}>
              ×
            </button>
          </div>
          <p>{t("drawer.chooseStroke")}</p>
          <div className="brush-grid">
            {BRUSHES.map((brush) => (
              <button
                key={brush.id}
                aria-pressed={brushId === brush.id}
                onClick={() => onBrush(brush)}
              >
                <span
                  className={`brush-preview brush-preview--${brush.texture}`}
                  style={{ "--brush-size": `${Math.min(brush.size, 12)}px` } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="brush-copy">
                  <strong>{brush.name}</strong>
                  <small>{brush.detail}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="brush-controls" aria-label={t("drawer.strokeControls")}>
            <label>
              <span>{t("drawer.size")}</span>
              <output>{size.toFixed(1)} px</output>
              <input aria-label={t("drawer.size")} type="range" min="0.8" max="32" step="0.2" value={size} onChange={(event) => onSize(Number(event.target.value))} />
            </label>
            <label>
              <span>{t("drawer.stabilizer")}</span>
              <output>{Math.round(smoothing * 100)}%</output>
              <input aria-label={t("drawer.stabilizer")} type="range" min="0" max="1" step="0.05" value={smoothing} onChange={(event) => onSmoothing(Number(event.target.value))} />
            </label>
          </div>
        </div>
      )}
      {showIcons && (
        <div
          className="icon-drawer"
          role="dialog"
          aria-label={t("tools.basicIcons")}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div>
            <strong>{t("tools.icons")}</strong>
            <button onClick={onCloseIcons} aria-label={t("common.close")}>
              ×
            </button>
          </div>
          <p>{t("drawer.chooseShape")}</p>
          <div className="icon-grid">
            {ICONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.shape}
                  aria-pressed={iconShape === item.shape}
                  onClick={() => onIcon(item.shape)}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
