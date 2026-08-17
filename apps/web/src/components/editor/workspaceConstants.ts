import { Circle, RectangleHorizontal, Square, Triangle, Waypoints } from "lucide-react";
import type { ShapeObject } from "@notylo/document-model";

export const DEFAULT_COLORS = ["#292927", "#2764d9", "#d4433d", "#258a57", "#d1a510"];
export const BRUSHES = [
  {
    id: "ink-fineliner",
    name: "Encre précise",
    detail: "Net · rond",
    size: 2.2,
    tool: "pen" as const,
    smoothing: 0.46,
    texture: "ink"
  },
  {
    id: "ink-calligraphy",
    name: "Plume souple",
    detail: "Plein & délié",
    size: 5.2,
    tool: "pen" as const,
    smoothing: 0.58,
    texture: "nib"
  },
  {
    id: "pencil-sketch",
    name: "Crayon esquisse",
    detail: "Sec · granuleux",
    size: 3.1,
    tool: "pencil" as const,
    smoothing: 0.24,
    texture: "graphite"
  },
  {
    id: "pencil-2b",
    name: "Crayon 2B",
    detail: "Tendre · dense",
    size: 5.4,
    tool: "pencil" as const,
    smoothing: 0.34,
    texture: "graphite-soft"
  },
  {
    id: "marker-medium",
    name: "Marqueur biseauté",
    detail: "Large · franc",
    size: 10,
    tool: "pen" as const,
    smoothing: 0.54,
    texture: "marker"
  },
  {
    id: "wet-paint",
    name: "Pinceau humide",
    detail: "Soies · matière",
    size: 13,
    tool: "pen" as const,
    smoothing: 0.48,
    texture: "paint"
  },
  {
    id: "highlighter-flat",
    name: "Surligneur",
    detail: "Plat · translucide",
    size: 4.5,
    tool: "highlighter" as const,
    smoothing: 0.44,
    texture: "highlighter"
  }
] as const;
export type BrushPreset = (typeof BRUSHES)[number];
export const ICONS = [
  { shape: "square", label: "Carré", icon: Square, width: 120, height: 120 },
  { shape: "rectangle", label: "Rectangle", icon: RectangleHorizontal, width: 180, height: 112 },
  { shape: "circle", label: "Cercle parfait", icon: Circle, width: 128, height: 128 },
  { shape: "triangle", label: "Triangle", icon: Triangle, width: 150, height: 130 },
  { shape: "poly-arrow", label: "Flèche modulable", icon: Waypoints, width: 240, height: 140 }
] as const satisfies readonly {
  readonly shape: ShapeObject["shape"];
  readonly label: string;
  readonly icon: typeof Square;
  readonly width: number;
  readonly height: number;
}[];
export type IconShape = (typeof ICONS)[number]["shape"];
