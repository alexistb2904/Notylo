import type { InkDynamics, PageBackground } from "@notylo/document-model";
import type { OcrMode } from "../lib/ocr";
import type { Tool } from "./editor/types";
import {
  Calculator,
  CircleHelp,
  LayoutPanelLeft,
  Palette,
  ScanText,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";

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
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <div className="inspector-icon">
          <SlidersHorizontal size={16} />
        </div>
        <div>
          <p className="eyebrow">Propriétés</p>
          <h2>
            {tool === "pen"
              ? "Stylo"
              : tool === "pencil"
                ? "Crayon"
                : tool === "highlighter"
                  ? "Surligneur"
                  : "Espace"}
          </h2>
        </div>
      </div>
      <section className="settings-section" aria-labelledby="stroke-settings">
        <h3 id="stroke-settings">Trait</h3>
        <label className="property-label color-property">
          <span>
            <Palette size={14} /> Couleur
          </span>
          <input type="color" value={color} onChange={(event) => onColor(event.target.value)} />
        </label>
        <label className="property-label range-property">
          <span>Épaisseur</span>
          <strong>{size.toFixed(1)} px</strong>
          <input
            type="range"
            min="1"
            max="14"
            step="0.2"
            value={size}
            onChange={(event) => onSize(Number(event.target.value))}
          />
        </label>
        <label className="property-label range-property">
          <span>Lissage</span>
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
          <span>Palette flottante</span>
          <input
            aria-label="Afficher la palette flottante"
            type="checkbox"
            checked={paletteVisible}
            onChange={(event) => onPaletteVisible(event.target.checked)}
          />
        </label>
        {!isWhiteboard && (
          <label className="property-label range-property">
            <span>Espacement des pages</span>
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
      <section className="settings-section pressure-settings" aria-labelledby="pressure-settings">
        <div className="section-title-row">
          <h3 id="pressure-settings">Pression du stylet</h3>
          <span className="tablet-status">STYLET</span>
        </div>
        <label className="property-label range-property">
          <span>Sensibilité</span>
          <strong>
            {dynamics.pressureSensitivity < 0.4
              ? "Ferme"
              : dynamics.pressureSensitivity > 0.6
                ? "Souple"
                : "Normale"}
          </strong>
          <input
            aria-label="Sensibilité de la pression du stylet"
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
            <small>Ferme</small>
            <small>Souple</small>
          </span>
        </label>
        <div className="dynamics-list">
          <label className="toggle-row compact-toggle">
            <span>
              <strong>Largeur</strong>
              <small>La pression module l’épaisseur.</small>
            </span>
            <input
              aria-label="La pression change la largeur"
              type="checkbox"
              checked={dynamics.pressureAffectsWidth}
              onChange={(event) =>
                onDynamics({ ...dynamics, pressureAffectsWidth: event.target.checked })
              }
            />
          </label>
          <label className="toggle-row compact-toggle">
            <span>
              <strong>Opacité</strong>
              <small>Un appui léger dépose moins de matière.</small>
            </span>
            <input
              aria-label="La pression change l’opacité"
              type="checkbox"
              checked={dynamics.pressureAffectsOpacity}
              onChange={(event) =>
                onDynamics({ ...dynamics, pressureAffectsOpacity: event.target.checked })
              }
            />
          </label>
          <label className="toggle-row compact-toggle">
            <span>
              <strong>Angle</strong>
              <small>L’inclinaison oriente la pointe et les soies.</small>
            </span>
            <input
              aria-label="L’inclinaison du stylet change l’angle"
              type="checkbox"
              checked={dynamics.tiltAffectsAngle}
              onChange={(event) =>
                onDynamics({ ...dynamics, tiltAffectsAngle: event.target.checked })
              }
            />
          </label>
        </div>
      </section>
      <section className="settings-section" aria-labelledby="workspace-settings">
        <h3 id="workspace-settings">Espace de travail</h3>
        <div className="setting-copy">
          <span className="setting-icon">
            <LayoutPanelLeft size={14} />
          </span>
          <span>
            <strong>Barre d’outils</strong>
            <div className="three-way">
              <button
                aria-pressed={sidebarPosition === "left"}
                onClick={() => onSidebarPosition("left")}
              >
                Gauche
              </button>
              <button
                aria-pressed={sidebarPosition === "right"}
                onClick={() => onSidebarPosition("right")}
              >
                Droite
              </button>
              <button
                aria-pressed={sidebarPosition === "hidden"}
                onClick={() => onSidebarPosition("hidden")}
              >
                Cacher
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
              <strong>Formes propres</strong>
              <small>Ajuste cercle, triangle, ligne et rectangle après 2 s.</small>
            </span>
          </span>
          <input
            aria-label="Activer les formes propres"
            type="checkbox"
            checked={shapeRecognition}
            onChange={(event) => onShapeRecognition(event.target.checked)}
          />
        </label>
      </section>
      {isWhiteboard && (
        <section className="settings-section" aria-labelledby="background-settings">
          <h3 id="background-settings">Fond du whiteboard</h3>
          <div className="three-way background-options">
            {(["blank", "dots", "grid-5", "ruled"] as const).map((kind) => (
              <button
                key={kind}
                aria-pressed={background.kind === kind}
                onClick={() => updateBackground({ kind })}
              >
                {kind === "blank"
                  ? "Uni"
                  : kind === "dots"
                    ? "Points"
                    : kind === "grid-5"
                      ? "Quadrillage"
                      : "Lignes"}
              </button>
            ))}
          </div>
          <label className="property-label">
            <span>Arrière-plan</span>
            <input
              type="color"
              value={background.color}
              onChange={(event) => updateBackground({ color: event.target.value })}
            />
          </label>
          {background.kind !== "blank" && (
            <label className="property-label">
              <span>Tracé</span>
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
        <h3 id="smart-settings">Assistance</h3>
        <label className="toggle-row">
          <span className="setting-copy">
            <span className="setting-icon">
              <Calculator size={14} />
            </span>
            <span>
              <strong>Calcul automatique</strong>
              <small>Détecte une expression terminée par « = ».</small>
            </span>
          </span>
          <input
            aria-label="Activer le calcul automatique"
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
        <h3 id="recognition-settings">Reconnaissance</h3>
        <div className="recognition-actions">
          <button className="outline-action" disabled={ocrBusy} onClick={() => onOcr("text")}>
            <ScanText size={16} /> Lire le texte
          </button>
          <button className="outline-action" disabled={ocrBusy} onClick={() => onOcr("math")}>
            <Calculator size={16} /> Convertir en maths
          </button>
        </div>
        <p className="inspector-note">
          <CircleHelp size={13} /> OCR local dans votre navigateur, optimisé pour les notes et les
          expressions mathématiques.
        </p>
        {ocrStatus && (
          <p className="recognition-status" role="status">
            {ocrStatus}
          </p>
        )}
      </section>
    </aside>
  );
}
