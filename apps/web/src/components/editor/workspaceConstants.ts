import { Circle, RectangleHorizontal, Square, Triangle, Waypoints } from "lucide-react";
import type { InkDynamics, ShapeObject } from "@notylo/document-model";
import { t } from "../../i18n";

export const DEFAULT_COLORS = ["#292927", "#2764d9", "#d4433d", "#258a57", "#d1a510"];

const PRESSURE_WIDTH: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};

const PRESSURE_OPACITY: InkDynamics = {
  ...PRESSURE_WIDTH,
  pressureAffectsOpacity: true
};

/** Each preset carries its own dynamics, so choosing a brush always gives a useful result. */
export const BRUSHES = [
  {
    id: "ink-fineliner",
    name: t("brush.pen"),
    detail: t("brush.penDetail"),
    size: 2.4,
    tool: "pen" as const,
    smoothing: 0.58,
    texture: "ink",
    dynamics: PRESSURE_WIDTH
  },
  {
    id: "ink-calligraphy",
    name: t("brush.calligraphy"),
    detail: t("brush.calligraphyDetail"),
    size: 4.8,
    tool: "pen" as const,
    smoothing: 0.72,
    texture: "nib",
    dynamics: PRESSURE_OPACITY
  },
  {
    id: "pencil-sketch",
    name: t("brush.pencil"),
    detail: t("brush.pencilDetail"),
    size: 3.2,
    tool: "pencil" as const,
    smoothing: 0.56,
    texture: "graphite",
    dynamics: { ...PRESSURE_OPACITY, tiltAffectsAngle: true }
  },
  {
    id: "pencil-2b",
    name: t("brush.softPencil"),
    detail: t("brush.softPencilDetail"),
    size: 5.2,
    tool: "pencil" as const,
    smoothing: 0.68,
    texture: "graphite-soft",
    dynamics: { ...PRESSURE_OPACITY, tiltAffectsAngle: true }
  },
  {
    id: "marker-medium",
    name: t("brush.marker"),
    detail: t("brush.markerDetail"),
    size: 8.5,
    tool: "pen" as const,
    smoothing: 0.78,
    texture: "marker",
    dynamics: {
      pressureSensitivity: 0.5,
      pressureAffectsWidth: false,
      pressureAffectsOpacity: true,
      tiltAffectsAngle: false
    }
  },
  {
    id: "wet-paint",
    name: t("brush.paint"),
    detail: t("brush.paintDetail"),
    size: 7.5,
    tool: "pen" as const,
    smoothing: 0.74,
    texture: "paint",
    dynamics: PRESSURE_OPACITY
  },
  {
    id: "highlighter-flat",
    name: t("brush.highlighter"),
    detail: t("brush.highlighterDetail"),
    size: 4.5,
    tool: "highlighter" as const,
    smoothing: 0.64,
    texture: "highlighter",
    dynamics: {
      pressureSensitivity: 0.5,
      pressureAffectsWidth: false,
      pressureAffectsOpacity: false,
      tiltAffectsAngle: false
    }
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
