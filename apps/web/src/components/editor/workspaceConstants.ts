import { Circle, RectangleHorizontal, Square, Triangle, Waypoints } from "lucide-react";
import type { ShapeObject } from "@notylo/document-model";

export const DEFAULT_COLORS = ["#292927", "#2764d9", "#d4433d", "#258a57", "#d1a510"];

/**
 * Notylo is a note-taking app, not a paint program. Keep three deliberately
 * different writing tools instead of pretending to provide a large brush engine.
 * Legacy brush ids remain supported by the renderer for existing notebooks.
 */
export const BRUSHES = [
  {
    id: "ink-fineliner",
    name: "Stylo",
    detail: "Net · précis · opaque",
    size: 2.4,
    tool: "pen" as const,
    smoothing: 0.46,
    texture: "ink"
  },
  {
    id: "pencil-sketch",
    name: "Crayon",
    detail: "Graphite · texturé · sensible à la pression",
    size: 3.2,
    tool: "pencil" as const,
    smoothing: 0.34,
    texture: "graphite"
  },
  {
    id: "highlighter-flat",
    name: "Surligneur",
    detail: "Large · translucide · superposable",
    size: 4.5,
    tool: "highlighter" as const,
    smoothing: 0.4,
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
