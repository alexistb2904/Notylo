import type { CSSProperties, MutableRefObject } from "react";
import type { Tool } from "./types";
import { BRUSHES, ICONS, type BrushPreset, type IconShape } from "./workspaceConstants";

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
  onColor(color: string, index: number): void;
  onPaletteColor(color: string, index: number): void;
  onCloseBrushes(): void;
  onBrush(brush: BrushPreset): void;
  onCloseIcons(): void;
  onIcon(shape: IconShape): void;
}

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
  onColor,
  onPaletteColor,
  onCloseBrushes,
  onBrush,
  onCloseIcons,
  onIcon
}: Props) {
  return (
    <>
      {(tool === "pen" || tool === "pencil" || tool === "highlighter") && paletteVisible && (
        <div
          className="floating-palette"
          role="toolbar"
          aria-label="Palette de dessin"
          onPointerDown={(event) => event.stopPropagation()}
        >
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
                aria-label={`Couleur ${index + 1}. Double-cliquez pour la modifier.`}
                aria-pressed={index === paletteIndex}
              />
              <input
                ref={(element) => {
                  paletteInputRefs.current[index] = element;
                }}
                tabIndex={-1}
                aria-label={`Modifier la couleur ${index + 1}`}
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
          aria-label="Brosses et épaisseurs"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div>
            <strong>Brosses</strong>
            <button onClick={onCloseBrushes} aria-label="Fermer">
              ×
            </button>
          </div>
          <p>Choisissez une sensation de trait.</p>
          <div className="brush-grid">
            {BRUSHES.map((brush) => (
              <button
                key={brush.name}
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
        </div>
      )}
      {showIcons && (
        <div
          className="icon-drawer"
          role="dialog"
          aria-label="Icônes de base"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div>
            <strong>Icônes</strong>
            <button onClick={onCloseIcons} aria-label="Fermer">
              ×
            </button>
          </div>
          <p>Choisissez une forme, puis glissez du point A au point B.</p>
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
