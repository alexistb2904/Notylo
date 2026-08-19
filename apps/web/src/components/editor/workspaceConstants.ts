import { Circle, RectangleHorizontal, Square, Triangle, Waypoints } from "lucide-react";
import type { ShapeObject } from "@notylo/document-model";
import { t } from "../../i18n";

export const DEFAULT_COLORS = ["#292927", "#2764d9", "#d4433d", "#258a57", "#d1a510"];

/**
 * Notylo is a note-taking app, not a paint program. Keep three deliberately
 * different writing tools instead of pretending to provide a large brush engine.
 * Legacy brush ids remain supported by the renderer for existing notebooks.
 */
export const BRUSHES = [
  {
    id: "ink-fineliner",
    name: t("brush.pen"),
    detail: t("brush.penDetail"),
    size: 2.4,
    tool: "pen" as const,
    smoothing: 0.46,
    texture: "ink"
  },
  {
    id: "pencil-sketch",
    name: t("brush.pencil"),
    detail: t("brush.pencilDetail"),
    size: 3.2,
    tool: "pencil" as const,
    smoothing: 0.34,
    texture: "graphite"
  },
  {
    id: "highlighter-flat",
    name: t("brush.highlighter"),
    detail: t("brush.highlighterDetail"),
    size: 4.5,
    tool: "highlighter" as const,
    smoothing: 0.4,
    texture: "highlighter"
  }
] as const;

export type BrushPreset = (typeof BRUSHES)[number];

export const ICONS = [
  { shape: "square", label: t("icon.square"), icon: Square, width: 120, height: 120 },
  { shape: "rectangle", label: t("icon.rectangle"), icon: RectangleHorizontal, width: 180, height: 112 },
  { shape: "circle", label: t("icon.circle"), icon: Circle, width: 128, height: 128 },
  { shape: "triangle", label: t("icon.triangle"), icon: Triangle, width: 150, height: 130 },
  { shape: "poly-arrow", label: t("icon.arrow"), icon: Waypoints, width: 240, height: 140 }
] as const satisfies readonly {
  readonly shape: ShapeObject["shape"];
  readonly label: string;
  readonly icon: typeof Square;
  readonly width: number;
  readonly height: number;
}[];

export type IconShape = (typeof ICONS)[number]["shape"];
