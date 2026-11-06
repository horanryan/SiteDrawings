import type { DrawingTool } from "./model";

// One source for the tool buttons, keyboard handler, and Quick Guide.
export const TOOL_SHORTCUTS: Record<DrawingTool, string> = {
  select: "V", wall: "L", dashed: "D", rectangle: "R", circle: "C",
  triangle: "T", diamond: "I", pentagon: "P", hexagon: "H", octagon: "O", star: "S",
  ellipse: "U", parallelogram: "J", subprocess: "K",
  dimension: "M", arrow: "A", note: "N", freehand: "F",
};

export const ACTION_SHORTCUTS = { layers: "Y", guide: "G", fit: "0", shapes: "B", export: "E", zoomIn: "+", zoomOut: "-" } as const;

export function toolForKey(key: string, modified = false): DrawingTool | undefined {
  if (modified) return undefined;
  return (Object.entries(TOOL_SHORTCUTS) as Array<[DrawingTool, string]>).find(([, shortcut]) => shortcut.toLowerCase() === key.toLowerCase())?.[0];
}

export const QUICK_GUIDE: Array<[string, string]> = [
  [TOOL_SHORTCUTS.select, "Select and move"],
  [TOOL_SHORTCUTS.wall, "Line"],
  [TOOL_SHORTCUTS.dashed, "Dashed line"],
  [TOOL_SHORTCUTS.rectangle, "Rectangle"],
  [TOOL_SHORTCUTS.circle, "Circle"],
  [TOOL_SHORTCUTS.triangle, "Triangle"],
  [TOOL_SHORTCUTS.diamond, "Diamond"],
  [TOOL_SHORTCUTS.pentagon, "Pentagon"],
  [TOOL_SHORTCUTS.hexagon, "Hexagon"],
  [TOOL_SHORTCUTS.octagon, "Octagon"],
  [TOOL_SHORTCUTS.star, "Star"],
  [TOOL_SHORTCUTS.ellipse, "Start / end"],
  [TOOL_SHORTCUTS.parallelogram, "Input / output"],
  [TOOL_SHORTCUTS.subprocess, "Subprocess"],
  [TOOL_SHORTCUTS.dimension, "Dimension"],
  [TOOL_SHORTCUTS.arrow, "Arrow annotation"],
  [TOOL_SHORTCUTS.note, "Add note"],
  [TOOL_SHORTCUTS.freehand, "Freehand"],
  [ACTION_SHORTCUTS.shapes, "Open / close Shapes"],
  [ACTION_SHORTCUTS.layers, "Show / hide layers"],
  [ACTION_SHORTCUTS.guide, "Open / close Quick Guide"],
  [ACTION_SHORTCUTS.fit, "Fit drawing"],
  [ACTION_SHORTCUTS.zoomIn, "Zoom in (also = )"],
  [ACTION_SHORTCUTS.zoomOut, "Zoom out"],
  [ACTION_SHORTCUTS.export, "Open / close Export"],
  ["Ctrl/⌘ + D", "Duplicate selection"],
  ["Ctrl/⌘ + A", "Select all"],
  ["Delete", "Delete selection"],
  ["Ctrl/⌘ + Z", "Undo"],
  ["Ctrl/⌘ + Y", "Redo (also Ctrl/⌘ + Shift + Z)"],
  ["Ctrl/⌘ + S", "Save drawing"],
  ["Space + drag", "Pan canvas"],
  ["Enter", "New line while editing a note"],
  ["Ctrl/⌘ + Enter", "Finish note editing"],
  ["Esc", "Cancel note edit / select tool / close menus"],
];
