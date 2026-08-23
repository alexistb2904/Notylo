import { Circle, RectangleHorizontal, Square, Triangle, Waypoints } from "lucide-react";
import type { InkBrush, InkDynamics, ShapeObject } from "@notylo/document-model";
import { t } from "../../i18n";

export const DEFAULT_COLORS = ["#292927", "#2764d9", "#d4433d", "#258a57", "#d1a510"];

const PRESSURE_WIDTH: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};
const PRESSURE_OPACITY: InkDynamics = { ...PRESSURE_WIDTH, pressureAffectsOpacity: true };

function makeBrush(
  id: string,
  tip: InkBrush["tip"],
  overrides: Partial<InkBrush> & Pick<InkBrush, "dynamics">
): InkBrush {
  return {
    id,
    tip,
    spacing: 0.1,
    hardness: 1,
    flow: 1,
    opacity: 1,
    aspect: 1,
    angle: 0,
    rotation: "fixed",
    scatter: 0,
    grain: 0,
    blendMode: tip === "round" ? "normal" : "multiply",
    ...overrides
  };
}

/** Presets are real brush recipes: tip mask, spacing, flow and sensor dynamics. */
export const BRUSHES = [
  {
    id: "ink-fineliner",
    name: t("brush.pen"),
    detail: t("brush.penDetail"),
    size: 2.4,
    tool: "pen" as const,
    stabilizer: 0.5,
    brush: makeBrush("ink-fineliner", "round", {
      spacing: 0.11, hardness: 0.96, flow: 1, dynamics: PRESSURE_WIDTH
    })
  },
  {
    id: "ink-calligraphy",
    name: t("brush.calligraphy"),
    detail: t("brush.calligraphyDetail"),
    size: 4.8,
    tool: "pen" as const,
    stabilizer: 0.62,
    brush: makeBrush("ink-calligraphy", "chisel", {
      spacing: 0.075, hardness: 0.9, flow: 0.92, aspect: 0.28, angle: -34,
      rotation: "tilt", dynamics: PRESSURE_OPACITY
    })
  },
  {
    id: "pencil-sketch",
    name: t("brush.pencil"),
    detail: t("brush.pencilDetail"),
    size: 3.2,
    tool: "pencil" as const,
    stabilizer: 0.46,
    brush: makeBrush("pencil-sketch", "graphite", {
      spacing: 0.13, hardness: 0.72, flow: 0.68, opacity: 0.95, scatter: 0.13,
      grain: 0.62, dynamics: { ...PRESSURE_OPACITY, tiltAffectsAngle: true }
    })
  },
  {
    id: "pencil-2b",
    name: t("brush.softPencil"),
    detail: t("brush.softPencilDetail"),
    size: 5.2,
    tool: "pencil" as const,
    stabilizer: 0.54,
    brush: makeBrush("pencil-2b", "graphite", {
      spacing: 0.1, hardness: 0.52, flow: 0.55, opacity: 0.84, aspect: 0.62,
      scatter: 0.2, grain: 0.82, rotation: "tilt",
      dynamics: { ...PRESSURE_OPACITY, tiltAffectsAngle: true }
    })
  },
  {
    id: "marker-medium",
    name: t("brush.marker"),
    detail: t("brush.markerDetail"),
    size: 8.5,
    tool: "pen" as const,
    stabilizer: 0.66,
    brush: makeBrush("marker-medium", "chisel", {
      spacing: 0.07, hardness: 0.86, flow: 0.72, opacity: 0.78, aspect: 0.46,
      angle: -18, dynamics: { ...PRESSURE_WIDTH, pressureAffectsWidth: false }
    })
  },
  {
    id: "dry-brush",
    name: t("brush.paint"),
    detail: t("brush.paintDetail"),
    size: 7.5,
    tool: "pen" as const,
    stabilizer: 0.58,
    brush: makeBrush("dry-brush", "bristle", {
      spacing: 0.09, hardness: 0.74, flow: 0.78, opacity: 0.95, aspect: 0.5,
      scatter: 0.09, grain: 0.46, rotation: "direction", dynamics: PRESSURE_OPACITY
    })
  },
  {
    id: "highlighter-flat",
    name: t("brush.highlighter"),
    detail: t("brush.highlighterDetail"),
    size: 4.5,
    tool: "highlighter" as const,
    stabilizer: 0.6,
    brush: makeBrush("highlighter-flat", "chisel", {
      spacing: 0.055, hardness: 0.9, flow: 0.26, opacity: 0.28, aspect: 0.32,
      angle: -12,
      dynamics: {
        pressureSensitivity: 0.5, pressureAffectsWidth: false,
        pressureAffectsOpacity: false, tiltAffectsAngle: false
      }
    })
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
