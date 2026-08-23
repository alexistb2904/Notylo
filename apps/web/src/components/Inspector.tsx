import type { InkDynamics, PageBackground } from "@notylo/document-model";
import type { OcrMode } from "../lib/ocr";
import type { EraserMode } from "../lib/eraser";
import type { Tool } from "./editor/types";
import {
  Calculator,
  CircleHelp,
  LayoutPanelLeft,
  Palette,
  PenTool,
  ScanText,
  SlidersHorizontal,
  Sparkles,
  X
} from "lucide-react";
import { t } from "../i18n";

type SidebarPosition = "left" | "right" | "hidden";

export function Inspector({
  tool,
  color,
  size,
  autoCalculate,
  smoothing,
  dynamics,
  paletteVisible,
  sidebarPosition,
  shapeRecognition,
  whiteboardBackground,
  isWhiteboard,
  pageGap,
  stylusOnly,
  eraserMode,
  eraserSize,
  onColor,
  onSize,
  onSmoothing,
  onDynamics,
  onPaletteVisible,
  onSidebarPosition,
  onShapeRecognition,
  onWhiteboardBackground,
  onPageGap,
  onAutoCalculate,
  onOcr,
  onStylusOnly,
  onEraserMode,
  onEraserSize,
  onClose,
  ocrBusy,
  ocrStatus
}: {
  readonly tool: Tool;
  readonly color: string;
  readonly size: number;
  readonly smoothing: number;
  readonly dynamics: InkDynamics;
  readonly autoCalculate: boolean;
  readonly paletteVisible: boolean;
  readonly sidebarPosition: SidebarPosition;
  readonly shapeRecognition: boolean;
  readonly whiteboardBackground?: PageBackground | undefined;
  readonly isWhiteboard: boolean;
  readonly pageGap: number;
  readonly stylusOnly: boolean;
  readonly eraserMode: EraserMode;
  readonly eraserSize: number;
  onColor(value: string): void;
  onSize(value: number): void;
  onSmoothing(value: number): void;
  onDynamics(value: InkDynamics): void;
  onPaletteVisible(value: boolean): void;
  onSidebarPosition(value: SidebarPosition): void;
  onShapeRecognition(value: boolean): void;
  onWhiteboardBackground(value: PageBackground): void;
  onPageGap(value: number): void;
  onAutoCalculate(value: boolean): void;
  onOcr(mode: OcrMode): void;
  onStylusOnly(value: boolean): void;
  onEraserMode(value: EraserMode): void;
  onEraserSize(value: number): void;
  onClose(): void;
  readonly ocrBusy: boolean;
  readonly ocrStatus: string | undefined;
}) {
  const background = whiteboardBackground ?? {
    kind: "dots" as const,
    color: "#e7e7e3",
    lineColor: "#9c9c96"
  };
  const updateBackground = (change: Partial<PageBackground>) =>
    onWhiteboardBackground({ ...background, ...change });
  const isInkTool = tool === "pen" || tool === "pencil" || tool === "highlighter";
  const toolName =
    tool === "pen"
      ? t("inspector.pen")
      : tool === "pencil"
        ? t("inspector.pencil")
        : tool === "highlighter"
          ? t("inspector.highlighter")
          : tool === "eraser"
            ? t("inspector.eraser")
            : t("inspector.space");
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <div className="inspector-icon">
          <SlidersHorizontal size={16} />
        </div>
        <div>
          <p className="eyebrow">{t("inspector.properties")}</p>
          <h2>{toolName}</h2>
        </div>
        <button className="inspector-close" onClick={onClose} aria-label={t("inspector.close")}>
          <X size={17} />
        </button>
      </div>
      <section className="settings-section" aria-labelledby="stroke-settings">
        <h3 id="stroke-settings">
          {tool === "eraser" ? t("inspector.eraser") : t("inspector.stroke")}
        </h3>
        {tool === "eraser" ? (
          <>
            <div className="setting-copy">
              <span>
                <strong>{t("inspector.mode")}</strong>
                <small>{t("inspector.eraserDescription")}</small>
                <div className="three-way">
                  <button
                    aria-pressed={eraserMode === "object"}
                    onClick={() => onEraserMode("object")}
                  >
                    {t("inspector.wholeObject")}
                  </button>
                  <button
                    aria-pressed={eraserMode === "precision"}
                    onClick={() => onEraserMode("precision")}
                  >
                    {t("inspector.precisionEraser")}
                  </button>
                </div>
              </span>
            </div>
            <label className="property-label range-property">
              <span>{t("inspector.size")}</span>
              <strong>{Math.round(eraserSize)} px</strong>
              <input
                aria-label={t("inspector.eraserSize")}
                type="range"
                min="4"
                max="72"
                step="1"
                value={eraserSize}
                onChange={(event) => onEraserSize(Number(event.target.value))}
              />
            </label>
          </>
        ) : (
          <>
            <label className="property-label color-property">
              <span>
                <Palette size={14} /> {t("inspector.color")}
              </span>
              <input type="color" value={color} onChange={(event) => onColor(event.target.value)} />
            </label>
            <label className="property-label range-property">
              <span>{t("inspector.thickness")}</span>
              <strong>{size.toFixed(1)} px</strong>
              <input
                type="range"
                min="0.8"
                max="64"
                step="0.2"
                value={size}
                onChange={(event) => onSize(Number(event.target.value))}
              />
            </label>
            <label className="property-label range-property">
              <span>{t("inspector.smoothing")}</span>
              <strong>{Math.round(smoothing * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={smoothing}
                onChange={(event) => onSmoothing(Number(event.target.value))}
              />
            </label>
            <label className="toggle-row compact-toggle">
              <span>{t("inspector.floatingPalette")}</span>
              <input
                aria-label={t("inspector.showFloatingPalette")}
                type="checkbox"
                checked={paletteVisible}
                onChange={(event) => onPaletteVisible(event.target.checked)}
              />
            </label>
          </>
        )}
        {!isWhiteboard && (
          <label className="property-label range-property">
            <span>{t("inspector.pageSpacing")}</span>
            <strong>{pageGap} px</strong>
            <input
              type="range"
              min="16"
              max="160"
              step="4"
              value={pageGap}
              onChange={(event) => onPageGap(Number(event.target.value))}
            />
          </label>
        )}
      </section>
      {isInkTool && (
        <section className="settings-section pressure-settings" aria-labelledby="pressure-settings">
          <div className="section-title-row">
            <h3 id="pressure-settings">{t("inspector.stylusDynamics")}</h3>
            <span className="tablet-status">{t("inspector.stylusBadge")}</span>
          </div>
          <label className="property-label range-property">
            <span>{t("inspector.sensitivity")}</span>
            <strong>
              {dynamics.pressureSensitivity < 0.4
                ? t("inspector.firm")
                : dynamics.pressureSensitivity > 0.6
                  ? t("inspector.soft")
                  : t("inspector.normal")}
            </strong>
            <input
              aria-label={t("inspector.pressureSensitivity")}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={dynamics.pressureSensitivity}
              onChange={(event) =>
                onDynamics({ ...dynamics, pressureSensitivity: Number(event.target.value) })
              }
            />
            <span className="pressure-scale" aria-hidden="true">
              <small>{t("inspector.firm")}</small>
              <small>{t("inspector.soft")}</small>
            </span>
          </label>
          <div className="dynamics-list">
            <label className="toggle-row compact-toggle">
              <span>
                <strong>{t("inspector.width")}</strong>
                <small>{t("inspector.widthDescription")}</small>
              </span>
              <input
                aria-label={t("inspector.pressureWidth")}
                type="checkbox"
                checked={dynamics.pressureAffectsWidth}
                onChange={(event) =>
                  onDynamics({ ...dynamics, pressureAffectsWidth: event.target.checked })
                }
              />
            </label>
            <label className="toggle-row compact-toggle">
              <span>
                <strong>{t("inspector.opacity")}</strong>
                <small>{t("inspector.opacityDescription")}</small>
              </span>
              <input
                aria-label={t("inspector.pressureOpacity")}
                type="checkbox"
                checked={dynamics.pressureAffectsOpacity}
                onChange={(event) =>
                  onDynamics({ ...dynamics, pressureAffectsOpacity: event.target.checked })
                }
              />
            </label>
            {tool === "pencil" && (
              <label className="toggle-row compact-toggle">
                <span>
                  <strong>{t("inspector.tilt")}</strong>
                  <small>{t("inspector.tiltDescription")}</small>
                </span>
                <input
                  aria-label={t("inspector.tiltAria")}
                  type="checkbox"
                  checked={dynamics.tiltAffectsAngle}
                  onChange={(event) =>
                    onDynamics({ ...dynamics, tiltAffectsAngle: event.target.checked })
                  }
                />
              </label>
            )}
          </div>
        </section>
      )}
      <section className="settings-section" aria-labelledby="workspace-settings">
        <h3 id="workspace-settings">{t("inspector.workspace")}</h3>
        <div className="setting-copy">
          <span className="setting-icon">
            <LayoutPanelLeft size={14} />
          </span>
          <span>
            <strong>{t("inspector.toolbar")}</strong>
            <div className="three-way">
              <button
                aria-pressed={sidebarPosition === "left"}
                onClick={() => onSidebarPosition("left")}
              >
                {t("inspector.left")}
              </button>
              <button
                aria-pressed={sidebarPosition === "right"}
                onClick={() => onSidebarPosition("right")}
              >
                {t("inspector.right")}
              </button>
              <button
                aria-pressed={sidebarPosition === "hidden"}
                onClick={() => onSidebarPosition("hidden")}
              >
                {t("inspector.hide")}
              </button>
            </div>
          </span>
        </div>
        <label className="toggle-row compact-toggle">
          <span className="setting-copy">
            <span className="setting-icon">
              <Sparkles size={14} />
            </span>
            <span>
              <strong>{t("inspector.cleanShapes")}</strong>
              <small>{t("inspector.cleanShapesDescription")}</small>
            </span>
          </span>
          <input
            aria-label={t("inspector.cleanShapesAria")}
            type="checkbox"
            checked={shapeRecognition}
            onChange={(event) => onShapeRecognition(event.target.checked)}
          />
        </label>
        <label className="toggle-row compact-toggle stylus-only-setting">
          <span className="setting-copy">
            <span className="setting-icon">
              <PenTool size={14} />
            </span>
            <span>
              <strong>{t("inspector.stylusOnly")}</strong>
              <small>{t("inspector.stylusOnlyDescription")}</small>
            </span>
          </span>
          <input
            aria-label={t("inspector.stylusOnlyAria")}
            type="checkbox"
            checked={stylusOnly}
            onChange={(event) => onStylusOnly(event.target.checked)}
          />
        </label>
      </section>
      {isWhiteboard && (
        <section className="settings-section" aria-labelledby="background-settings">
          <h3 id="background-settings">{t("inspector.whiteboardBackground")}</h3>
          <div className="three-way background-options">
            {(["blank", "dots", "grid-5", "ruled"] as const).map((kind) => (
              <button
                key={kind}
                aria-pressed={background.kind === kind}
                onClick={() => updateBackground({ kind })}
              >
                {kind === "blank"
                  ? t("inspector.backgroundSolid")
                  : kind === "dots"
                    ? t("inspector.backgroundDots")
                    : kind === "grid-5"
                      ? t("inspector.backgroundGrid")
                      : t("inspector.backgroundLines")}
              </button>
            ))}
          </div>
          <label className="property-label">
            <span>{t("inspector.background")}</span>
            <input
              type="color"
              value={background.color}
              onChange={(event) => updateBackground({ color: event.target.value })}
            />
          </label>
          {background.kind !== "blank" && (
            <label className="property-label">
              <span>{t("inspector.guide")}</span>
              <input
                type="color"
                value={background.lineColor ?? "#a4a4a1"}
                onChange={(event) => updateBackground({ lineColor: event.target.value })}
              />
            </label>
          )}
        </section>
      )}
      <section className="settings-section" aria-labelledby="smart-settings">
        <h3 id="smart-settings">{t("inspector.assistance")}</h3>
        <label className="toggle-row">
          <span className="setting-copy">
            <span className="setting-icon">
              <Calculator size={14} />
            </span>
            <span>
              <strong>{t("inspector.autoCalculate")}</strong>
              <small>{t("inspector.autoCalculateDescription")}</small>
            </span>
          </span>
          <input
            aria-label={t("inspector.autoCalculateAria")}
            type="checkbox"
            checked={autoCalculate}
            onChange={(event) => onAutoCalculate(event.target.checked)}
          />
        </label>
      </section>
      <section
        className="settings-section recognition-section"
        aria-labelledby="recognition-settings"
      >
        <h3 id="recognition-settings">{t("inspector.recognition")}</h3>
        <div className="recognition-actions">
          <button className="outline-action" disabled={ocrBusy} onClick={() => onOcr("text")}>
            <ScanText size={16} /> {t("inspector.readText")}
          </button>
          <button className="outline-action" disabled={ocrBusy} onClick={() => onOcr("math")}>
            <Calculator size={16} /> {t("inspector.convertMath")}
          </button>
        </div>
        {ocrStatus && (
          <p className="recognition-status" role="status">
            {ocrStatus}
          </p>
        )}
      </section>
      <section className="settings-section" aria-labelledby="help-settings">
        <h3 id="help-settings">{t("inspector.tip")}</h3>
        <div className="setting-copy">
          <span className="setting-icon">
            <CircleHelp size={14} />
          </span>
          <small>{t("inspector.eraserTip")}</small>
        </div>
      </section>
    </aside>
  );
}
