export type ItemKind = "wall" | "dashed" | "rectangle" | "circle" | "dimension" | "freehand" | "note" | "arrow";
export type PolygonTool = "triangle" | "diamond" | "pentagon" | "hexagon" | "octagon" | "star" | "ellipse" | "parallelogram" | "subprocess";
export type DrawingTool = "select" | ItemKind | PolygonTool;
export type ShapeTool = Exclude<DrawingTool, "select" | "note">;

export function isPolygonTool(tool: DrawingTool): tool is PolygonTool {
  return ["triangle", "diamond", "pentagon", "hexagon", "octagon", "star", "ellipse", "parallelogram", "subprocess"].includes(tool);
}

export interface Point {
  x: number;
  y: number;
}

export interface ConnectorAnchor {
  shapeId: string;
  // Position relative to the shape's bounding box, retained as the shape is resized.
  u: number;
  v: number;
}

// All saved positions and measurements use feet; grid spacing is a snapping preference.
export interface DrawingItem {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  x2: number;
  y2: number;
  color: string;
  label?: string;
  layerName?: string;
  noteWidth?: number;
  noteHeight?: number;
  widthLabel?: string;
  heightLabel?: string;
  showDimension: boolean;
  points?: Point[];
  bend?: Point; // Arrow bend relative to its start point.
  curve?: Point; // Point on the curve at its midpoint, relative to its start.
  diagramShape?: PolygonTool;
  startAnchor?: ConnectorAnchor;
  endAnchor?: ConnectorAnchor;
  connectorRoute?: "elbow";
  arrowHead?: boolean;
  textSize?: number;
  textColor?: string;
  textFont?: "Arial" | "Georgia" | "monospace";
  textBold?: boolean;
  textItalic?: boolean;
  textAlign?: "left" | "center" | "right";
  fillColor?: string;
}

export interface DrawingFile {
  version: 1;
  name: string;
  gridFeet: number;
  items: DrawingItem[];
}

// The draggable midpoint lies on a quadratic curve; cubic controls let both
// Konva and SVG draw the same geometry and orient the arrowhead consistently.
export function connectorCurvePoints(item: DrawingItem): [Point, Point, Point, Point] | undefined {
  if (item.kind !== "arrow" || !item.curve) return undefined;
  const end = { x: item.x2 - item.x, y: item.y2 - item.y };
  const control = { x: 2 * item.curve.x - end.x / 2, y: 2 * item.curve.y - end.y / 2 };
  return [{ x: 0, y: 0 }, { x: control.x * 2 / 3, y: control.y * 2 / 3 }, { x: end.x + (control.x - end.x) * 2 / 3, y: end.y + (control.y - end.y) * 2 / 3 }, end];
}

export function connectorElbowPoints(item: DrawingItem, shapes: DrawingItem[] = []): Point[] {
  const dx = item.x2 - item.x, dy = item.y2 - item.y;
  const target = item.endAnchor && shapes.find((shape) => shape.id === item.endAnchor!.shapeId);
  if (target && item.endAnchor) {
    const box = itemBounds(target), anchor = item.endAnchor, margin = 0.5;
    const rel = (x: number, y: number) => ({ x: x - item.x, y: y - item.y });
    // When an endpoint is on the far side of its destination, route around the
    // destination rather than crossing its interior to reach that endpoint.
    if (anchor.v > 1 - 1e-6 && anchor.u > 1e-6 && anchor.u < 1 - 1e-6 && item.y < box.top && item.x > box.left && item.x < box.right) {
      const outsideX = box.right + margin;
      return [{ x: 0, y: 0 }, rel(item.x, box.top - margin), rel(outsideX, box.top - margin), rel(outsideX, box.bottom + margin), rel(item.x2, box.bottom + margin), { x: dx, y: dy }];
    }
    if (anchor.v < 1e-6 && anchor.u > 1e-6 && anchor.u < 1 - 1e-6 && item.y > box.bottom && item.x > box.left && item.x < box.right) {
      const outsideX = box.right + margin;
      return [{ x: 0, y: 0 }, rel(item.x, box.bottom + margin), rel(outsideX, box.bottom + margin), rel(outsideX, box.top - margin), rel(item.x2, box.top - margin), { x: dx, y: dy }];
    }
    if (anchor.u > 1 - 1e-6 && anchor.v > 1e-6 && anchor.v < 1 - 1e-6 && item.x < box.left && item.y > box.top && item.y < box.bottom) {
      const outsideY = box.bottom + margin;
      return [{ x: 0, y: 0 }, rel(box.left - margin, item.y), rel(box.left - margin, outsideY), rel(box.right + margin, outsideY), rel(box.right + margin, item.y2), { x: dx, y: dy }];
    }
    if (anchor.u < 1e-6 && anchor.v > 1e-6 && anchor.v < 1 - 1e-6 && item.x > box.right && item.y > box.top && item.y < box.bottom) {
      const outsideY = box.bottom + margin;
      return [{ x: 0, y: 0 }, rel(box.right + margin, item.y), rel(box.right + margin, outsideY), rel(box.left - margin, outsideY), rel(box.left - margin, item.y2), { x: dx, y: dy }];
    }
  }
  const portDirection = (anchor: ConnectorAnchor | undefined, other: Point): Point | undefined => {
    if (!anchor) return undefined;
    const shape = shapes.find((candidate) => candidate.id === anchor.shapeId);
    if (!shape) return undefined;
    const bounds = itemBounds(shape), epsilon = 1e-6;
    const left = anchor.u <= epsilon, right = anchor.u >= 1 - epsilon;
    const top = anchor.v <= epsilon, bottom = anchor.v >= 1 - epsilon;
    if ((left || right) && (top || bottom)) {
      // At a corner use the side facing the other endpoint, then extend away
      // from that side before turning, so the line never traces the outline.
      if ((left && other.x <= bounds.left) || (right && other.x >= bounds.right)) return { x: left ? -1 : 1, y: 0 };
      if ((top && other.y <= bounds.top) || (bottom && other.y >= bounds.bottom)) return { x: 0, y: top ? -1 : 1 };
      return { x: left ? -1 : 1, y: 0 };
    }
    if (left || right) return { x: left ? -1 : 1, y: 0 };
    if (top || bottom) return { x: 0, y: top ? -1 : 1 };
    // Non-cardinal points on an ellipse or polygon use their nearest axis.
    const nx = anchor.u - 0.5, ny = anchor.v - 0.5;
    return Math.abs(nx) >= Math.abs(ny) ? { x: nx < 0 ? -1 : 1, y: 0 } : { x: 0, y: ny < 0 ? -1 : 1 };
  };
  const startDirection = portDirection(item.startAnchor, { x: item.x2, y: item.y2 });
  const endDirection = portDirection(item.endAnchor, { x: item.x, y: item.y });
  if (startDirection || endDirection) {
    const reach = 0.7;
    const start = startDirection ? { x: startDirection.x * reach, y: startDirection.y * reach } : { x: 0, y: 0 };
    const end = endDirection ? { x: dx + endDirection.x * reach, y: dy + endDirection.y * reach } : { x: dx, y: dy };
    const startAxis = startDirection ? (startDirection.x ? "horizontal" : "vertical") : undefined;
    const endAxis = endDirection ? (endDirection.x ? "horizontal" : "vertical") : undefined;
    const first = startAxis ?? endAxis ?? "vertical", last = endAxis ?? first;
    let middle: Point[];
    if (first === "horizontal" && last === "vertical") middle = [{ x: end.x, y: start.y }];
    else if (first === "vertical" && last === "horizontal") middle = [{ x: start.x, y: end.y }];
    else if (first === "horizontal") middle = [{ x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }];
    else middle = [{ x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }];
    return [{ x: 0, y: 0 }, start, ...middle, end, { x: dx, y: dy }];
  }
  const axis = (anchor: ConnectorAnchor | undefined): "horizontal" | "vertical" | undefined => {
    if (!anchor) return undefined;
    const horizontalEdge = anchor.v < 1e-6 || anchor.v > 1 - 1e-6;
    const verticalEdge = anchor.u < 1e-6 || anchor.u > 1 - 1e-6;
    if (horizontalEdge && verticalEdge) return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    if (verticalEdge) return "horizontal";
    if (horizontalEdge) return "vertical";
    return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
  };
  const start = axis(item.startAnchor), end = axis(item.endAnchor);
  if ((start ?? end) === "horizontal") {
    if (end === "vertical") return [{ x: 0, y: 0 }, { x: dx, y: 0 }, { x: dx, y: dy }];
    return [{ x: 0, y: 0 }, { x: dx / 2, y: 0 }, { x: dx / 2, y: dy }, { x: dx, y: dy }];
  }
  if (end === "horizontal") return [{ x: 0, y: 0 }, { x: 0, y: dy }, { x: dx, y: dy }];
  return [{ x: 0, y: 0 }, { x: 0, y: dy / 2 }, { x: dx, y: dy / 2 }, { x: dx, y: dy }];
}

export function roundedElbowPath(item: DrawingItem, scale = 1, shapes: DrawingItem[] = []): string {
  const raw = connectorElbowPoints(item, shapes);
  const points = raw.filter((point, index) => index === 0 || distance(point, raw[index - 1]) > 1e-9);
  if (points.length < 2) return "";
  const fmt = (point: Point) => `${point.x * scale} ${point.y * scale}`;
  let path = `M ${fmt(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const beforeLength = distance(previous, corner), afterLength = distance(corner, next);
    const radius = Math.min(0.25, beforeLength / 2, afterLength / 2);
    const before = { x: corner.x + (previous.x - corner.x) * radius / beforeLength, y: corner.y + (previous.y - corner.y) * radius / beforeLength };
    const after = { x: corner.x + (next.x - corner.x) * radius / afterLength, y: corner.y + (next.y - corner.y) * radius / afterLength };
    path += ` L ${fmt(before)} Q ${fmt(corner)} ${fmt(after)}`;
  }
  return `${path} L ${fmt(points[points.length - 1])}`;
}

export function elbowArrowhead(item: DrawingItem, shapes: DrawingItem[] = []): number[] {
  const points = connectorElbowPoints(item, shapes);
  const tip = points[points.length - 1];
  const previous = [...points].reverse().find((point) => distance(point, tip) > 1e-9);
  if (!previous) return [];
  const length = distance(previous, tip), head = Math.min(0.3, length * 0.7), wing = head * 0.4;
  const ux = (tip.x - previous.x) / length, uy = (tip.y - previous.y) / length;
  const bx = tip.x - ux * head, by = tip.y - uy * head;
  return [tip.x, tip.y, bx - uy * wing, by + ux * wing, bx + uy * wing, by - ux * wing];
}

export const NOTE_MIN_SIZE = 0.25;
export const NOTE_MAX_SIZE = 1000;
export const NOTE_DEFAULT_WIDTH = 5;
export const NOTE_DEFAULT_HEIGHT = 1.5;
export const NOTE_FONT_SIZE = 0.36;
export const NOTE_PADDING = 0.08;
export const NOTE_LINE_HEIGHT = NOTE_FONT_SIZE * 1.2;
export const NOTE_CHARACTER_WIDTH = NOTE_FONT_SIZE * 0.65;

// Fixed-width lettering keeps wrapping consistent between canvas and SVG exports.
export function wrapNoteText(text: string, width: number): string[] {
  const capacity = Math.max(1, Math.floor((width - NOTE_PADDING * 2) / NOTE_CHARACTER_WIDTH));
  return text.split(/\r\n|\r|\n/).flatMap((paragraph) => {
    const lines: string[] = [];
    let remaining = paragraph;
    while (remaining.length > capacity) {
      const breakAt = remaining.lastIndexOf(" ", capacity);
      const cut = breakAt > 0 ? breakAt : capacity;
      lines.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    lines.push(remaining);
    return lines;
  });
}

export function noteSize(item: DrawingItem): { width: number; height: number } {
  const width = item.noteWidth ?? NOTE_DEFAULT_WIDTH;
  // Always fit all lines, including in older or imported undersized notes.
  const requiredHeight = NOTE_PADDING * 2 + wrapNoteText(item.label || "Note", width).length * NOTE_LINE_HEIGHT;
  const height = Math.max(item.noteHeight ?? NOTE_DEFAULT_HEIGHT, requiredHeight);
  return { width, height };
}

export function visibleNoteLines(item: DrawingItem): string[] {
  return wrapNoteText(item.label || "Note", noteSize(item).width);
}

export const MAX_DRAWING_ITEMS = 1_000;
export const MAX_FREEHAND_POINTS = 10_000;
export const MAX_TOTAL_FREEHAND_POINTS = 100_000;
export const MAX_DRAWING_FILE_BYTES = 10 * 1024 * 1024;

export interface SnapOptions {
  grid: boolean;
  objects: boolean;
  gridFeet: number;
  toleranceFeet: number;
}

export interface SnapResult {
  point: Point;
  snapped: boolean;
}

const layerLabels: Record<ItemKind, string> = { wall: "Line", dashed: "Dashed line", rectangle: "Rectangle", circle: "Circle", dimension: "Dimension", note: "Note", freehand: "Freehand", arrow: "Arrow" };
export function diagramShapeLabel(item: DrawingItem): string {
  if (item.kind === "rectangle") return ({ ellipse: "Start / end", parallelogram: "Input / output", subprocess: "Subprocess", diamond: "Decision" } as Partial<Record<PolygonTool, string>>)[item.diagramShape as PolygonTool] ?? (item.diagramShape || "Process");
  return layerLabels[item.kind];
}

// Older plans have no layer names. Assign readable names without changing IDs.
export function assignLayerNames(items: DrawingItem[]): DrawingItem[] {
  const used = new Set(items.map((item) => item.layerName?.trim()).filter(Boolean));
  const counts = new Map<ItemKind, number>();
  return items.map((item) => {
    if (item.layerName?.trim()) return item;
    const label = item.diagramShape ? diagramShapeLabel(item) : layerLabels[item.kind];
    let number = counts.get(item.kind) ?? 0;
    let name: string;
    do { name = `${label} ${++number}`; } while (used.has(name));
    counts.set(item.kind, number);
    used.add(name);
    return { ...item, layerName: name };
  });
}

export function updateSelection(current: string[], id: string | null, additive = false): string[] {
  if (!id) return [];
  if (!additive) return [id];
  return current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id];
}

export function itemIntersectsSelection(item: DrawingItem, a: Point, b: Point): boolean {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  const intersects = (start: Point, end: Point) => {
    let low = 0, high = 1;
    const dx = end.x - start.x, dy = end.y - start.y;
    for (const [p, q] of [[-dx, start.x - left], [dx, right - start.x], [-dy, start.y - top], [dy, bottom - start.y]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
      if (low > high) return false;
    }
    return true;
  };
  if (item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension" || item.kind === "arrow") return intersects({ x: item.x, y: item.y }, { x: item.x2, y: item.y2 });
  if (item.kind === "note") {
    const { width, height } = noteSize(item);
    return item.x <= right && item.x + width >= left && item.y <= bottom && item.y + height >= top;
  }
  if (item.kind === "freehand") {
    const points = item.points ?? [];
    return points.slice(1).some((point, index) => intersects({ x: item.x + points[index].x, y: item.y + points[index].y }, { x: item.x + point.x, y: item.y + point.y }));
  }
  if (item.kind === "rectangle") {
    const corners = [{ x: item.x, y: item.y }, { x: item.x2, y: item.y }, { x: item.x2, y: item.y2 }, { x: item.x, y: item.y2 }];
    return corners.some((point, index) => intersects(point, corners[(index + 1) % 4]));
  }
  if (item.kind === "circle") {
    const radius = Math.hypot(item.x2 - item.x, item.y2 - item.y);
    const nearX = Math.max(left, Math.min(item.x, right)), nearY = Math.max(top, Math.min(item.y, bottom));
    const minDistance = Math.hypot(nearX - item.x, nearY - item.y);
    const maxDistance = Math.max(...[{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }].map((point) => Math.hypot(point.x - item.x, point.y - item.y)));
    return minDistance <= radius && maxDistance >= radius;
  }
  return item.x >= left && item.x <= right && item.y >= top && item.y <= bottom;
}

const EIGHTH_INCHES = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

let nextItemId = 0;

function createItemId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // randomUUID is unavailable in non-secure contexts, such as a local HTTP
  // server opened by IP address on an iPad. IDs only need to distinguish items.
  nextItemId += 1;
  return `item-${Date.now().toString(36)}-${nextItemId.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function newItem(
  kind: ItemKind,
  start: Point,
  end: Point,
): DrawingItem {
  return {
    id: createItemId(),
    kind,
    x: start.x,
    y: start.y,
    x2: end.x,
    y2: end.y,
    color: kind === "dashed" ? "#718196" : "#30465c",
    showDimension: kind !== "arrow",
    ...(kind === "note" ? { noteWidth: NOTE_DEFAULT_WIDTH, noteHeight: NOTE_DEFAULT_HEIGHT } : {}),
  };
}

export function rectangleAsLines(rectangle: DrawingItem): DrawingItem[] {
  const left = Math.min(rectangle.x, rectangle.x2), right = Math.max(rectangle.x, rectangle.x2);
  const top = Math.min(rectangle.y, rectangle.y2), bottom = Math.max(rectangle.y, rectangle.y2);
  if (right - left <= 0.001 || bottom - top <= 0.001) return [];
  const corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  return corners.map((start, index) => ({ ...newItem("wall", start, corners[(index + 1) % corners.length]), color: rectangle.color, showDimension: rectangle.showDimension }));
}

// Only physical linework participates; dimension annotations can intentionally
// refer to the same endpoints as the line they measure.
function lineSegments(item: DrawingItem): Array<[Point, Point]> {
  if (item.kind === "wall" || item.kind === "dashed") {
    return [[{ x: item.x, y: item.y }, { x: item.x2, y: item.y2 }]];
  }
  if (item.kind !== "rectangle" || item.diagramShape) return [];
  const corners = [{ x: item.x, y: item.y }, { x: item.x2, y: item.y }, { x: item.x2, y: item.y2 }, { x: item.x, y: item.y2 }];
  return corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
}

function segmentsOverlap([a, b]: [Point, Point], [c, d]: [Point, Point]): boolean {
  const epsilon = 1e-6;
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length <= epsilon) return false;
  // Perpendicular distance from each endpoint to the first line, in feet.
  if (Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)) / length > epsilon ||
      Math.abs(dx * (d.y - a.y) - dy * (d.x - a.x)) / length > epsilon) return false;
  const projection = (p: Point) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
  const cAlong = projection(c), dAlong = projection(d);
  return Math.min(length, Math.max(cAlong, dAlong)) - Math.max(0, Math.min(cAlong, dAlong)) > epsilon;
}

function itemsOverlap(first: DrawingItem, second: DrawingItem): boolean {
  return lineSegments(first).some((a) => lineSegments(second).some((b) => segmentsOverlap(a, b)));
}

// Existing overlaps in imported or older plans remain editable and removable.
export function hasNewLineOverlap(previous: DrawingItem[], next: DrawingItem[]): boolean {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return next.some((item, index) => next.slice(index + 1).some((other) => {
    const before = previousById.get(item.id), otherBefore = previousById.get(other.id);
    if (before && otherBefore && before.kind === item.kind && otherBefore.kind === other.kind &&
        before.x === item.x && before.y === item.y && before.x2 === item.x2 && before.y2 === item.y2 &&
        otherBefore.x === other.x && otherBefore.y === other.y && otherBefore.x2 === other.x2 && otherBefore.y2 === other.y2) return false;
    return itemsOverlap(item, other) && !(before && otherBefore && itemsOverlap(before, otherBefore));
  }));
}

// Polygon tools become ordinary line segments, just like newly drawn rectangles.
export function polygonVertices(kind: PolygonTool, start: Point, end: Point): Point[] {
  const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  const width = right - left, height = bottom - top;
  if (width <= 0.001 || height <= 0.001) return [];
  if (kind === "ellipse") return Array.from({ length: 32 }, (_, index) => ({ x: left + width / 2 + Math.cos(index * Math.PI / 16) * width / 2, y: top + height / 2 + Math.sin(index * Math.PI / 16) * height / 2 }));
  if (kind === "parallelogram") return [{ x: left + width * 0.2, y: top }, { x: right, y: top }, { x: right - width * 0.2, y: bottom }, { x: left, y: bottom }];
  if (kind === "subprocess") return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  const sides = ({ triangle: 3, diamond: 4, pentagon: 5, hexagon: 6, octagon: 8, star: 10 } as const)[kind];
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
    const radius = kind === "star" && index % 2 ? .43 : 1;
    return { x: left + width / 2 + Math.cos(angle) * width / 2 * radius, y: top + height / 2 + Math.sin(angle) * height / 2 * radius };
  });
}

export function polygonAsLines(kind: PolygonTool, start: Point, end: Point): DrawingItem[] {
  const vertices = polygonVertices(kind, start, end);
  return vertices.map((point, index) => newItem("wall", point, vertices[(index + 1) % vertices.length]));
}

export function distance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function formatFeetInches(feetValue: number): string {
  const sign = feetValue < 0 ? "−" : "";
  const thirtySeconds = Math.round(Math.abs(feetValue) * 384);
  const feet = Math.floor(thirtySeconds / 384);
  const remaining = thirtySeconds % 384;
  const inches = Math.floor(remaining / 32);
  const numerator = remaining % 32;
  // Keep familiar eighth-inch glyphs; write finer fractions in a parseable form.
  const fraction = numerator % 4 === 0 ? EIGHTH_INCHES[numerator / 4]
    : numerator % 2 === 0 ? ` ${numerator / 2}/16` : ` ${numerator}/32`;
  return `${sign}${feet}′ ${inches}${fraction}″`;
}

export function parseFeetInches(value: string): number | null {
  const fractions: Record<string, number> = {
    "⅛": 0.125,
    "¼": 0.25,
    "⅜": 0.375,
    "½": 0.5,
    "⅝": 0.625,
    "¾": 0.75,
    "⅞": 0.875,
  };
  const text = value
    .trim()
    .toLowerCase()
    .replace(/[′’]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/(\d*)([⅛¼⅜½⅝¾⅞])/g, (_, whole: string, fraction: string) =>
      String(Number(whole || 0) + fractions[fraction]),
    );
  if (!text) return null;

  const decimalFeet = Number(text);
  if (Number.isFinite(decimalFeet)) return decimalFeet;

  const feetAndInches = text.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?\s*(?:"|in|inches)?)?$/,
  );
  if (feetAndInches) {
    const feet = Number(feetAndInches[1]);
    const inches = Number(feetAndInches[2] || 0);
    const denominator = Number(feetAndInches[4]);
    if (feetAndInches[3] && denominator === 0) return null;
    const fraction = feetAndInches[3] ? Number(feetAndInches[3]) / denominator : 0;
    return feet + (inches + fraction) / 12;
  }

  const fractionalInches = text.match(
    /^(\d+)\s*\/\s*(\d+)\s*(?:"|in|inches)$/,
  );
  if (fractionalInches) {
    const denominator = Number(fractionalInches[2]);
    if (denominator === 0) return null;
    return Number(fractionalInches[1]) / denominator / 12;
  }

  const inchesOnly = text.match(
    /^(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?\s*(?:"|in|inches)$/,
  );
  if (inchesOnly) {
    const inches = Number(inchesOnly[1]);
    const denominator = Number(inchesOnly[3]);
    if (inchesOnly[2] && denominator === 0) return null;
    const fraction = inchesOnly[2] ? Number(inchesOnly[2]) / denominator : 0;
    return (inches + fraction) / 12;
  }

  return null;
}

export function itemLength(item: DrawingItem): number {
  return distance({ x: item.x, y: item.y }, { x: item.x2, y: item.y2 });
}

export function itemBounds(item: DrawingItem) {
  if (item.kind === "note") {
    const { width, height } = noteSize(item);
    return { left: item.x, top: item.y, right: item.x + width, bottom: item.y + height };
  }
  if (item.kind === "circle") {
    const radius = itemLength(item);
    return { left: item.x - radius, top: item.y - radius, right: item.x + radius, bottom: item.y + radius };
  }
  const points = item.kind === "arrow" && item.curve
    ? [{ x: item.x, y: item.y }, { x: item.x + 2 * item.curve.x - (item.x2 - item.x) / 2, y: item.y + 2 * item.curve.y - (item.y2 - item.y) / 2 }, { x: item.x2, y: item.y2 }]
    : item.kind === "arrow" && item.bend
    ? [{ x: item.x, y: item.y }, { x: item.x + item.bend.x, y: item.y + item.bend.y }, { x: item.x2, y: item.y2 }]
    : item.kind === "freehand" && item.points?.length
    ? item.points.map((point) => ({ x: item.x + point.x, y: item.y + point.y }))
    : [{ x: item.x, y: item.y }, { x: item.x2, y: item.y2 }];
  return points.reduce((bounds, point) => ({ left: Math.min(bounds.left, point.x), top: Math.min(bounds.top, point.y), right: Math.max(bounds.right, point.x), bottom: Math.max(bounds.bottom, point.y) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

// Vertices and edge midpoints provide predictable attachment points.
export function shapeConnectionPoints(shape: DrawingItem): Point[] {
  if (shape.kind !== "rectangle" && shape.kind !== "circle") return [];
  const bounds = itemBounds(shape);
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return [];
  if (shape.kind === "circle") {
    const radius = itemLength(shape);
    return Array.from({ length: 8 }, (_, index) => {
      const angle = index * Math.PI / 4;
      return { x: shape.x + Math.cos(angle) * radius, y: shape.y + Math.sin(angle) * radius };
    });
  }
  if (shape.diagramShape === "ellipse") return Array.from({ length: 8 }, (_, index) => ({ x: (bounds.left + bounds.right) / 2 + Math.cos(index * Math.PI / 4) * (bounds.right - bounds.left) / 2, y: (bounds.top + bounds.bottom) / 2 + Math.sin(index * Math.PI / 4) * (bounds.bottom - bounds.top) / 2 }));
  const vertices = shape.diagramShape
    ? polygonVertices(shape.diagramShape, { x: shape.x, y: shape.y }, { x: shape.x2, y: shape.y2 })
    : [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top }, { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }];
  return vertices.flatMap((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return [vertex, { x: (vertex.x + next.x) / 2, y: (vertex.y + next.y) / 2 }];
  });
}

export function findConnectorAnchor(point: Point, items: DrawingItem[], tolerance: number): { anchor: ConnectorAnchor; point: Point } | undefined {
  let closest: { anchor: ConnectorAnchor; point: Point } | undefined;
  let best = tolerance;
  for (const shape of items) {
    if (shape.kind !== "rectangle" && shape.kind !== "circle") continue;
    const bounds = itemBounds(shape);
    const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    if (width <= 0 || height <= 0) continue;
    for (const candidate of shapeConnectionPoints(shape)) {
      const gap = distance(point, candidate);
      if (gap <= best) {
        best = gap;
        closest = { point: candidate, anchor: { shapeId: shape.id, u: Math.max(0, Math.min(1, (candidate.x - bounds.left) / width)), v: Math.max(0, Math.min(1, (candidate.y - bounds.top) / height)) } };
      }
    }
  }
  if (closest) return closest;
  // Between the marked points, allow a connector to attach anywhere on an edge.
  for (const shape of items) {
    if (shape.kind !== "rectangle" && shape.kind !== "circle") continue;
    const bounds = itemBounds(shape), width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    if (width <= 0 || height <= 0) continue;
    let candidate: Point;
    if (shape.kind === "circle") {
      const dx = point.x - shape.x, dy = point.y - shape.y, length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const radius = itemLength(shape);
      candidate = { x: shape.x + dx / length * radius, y: shape.y + dy / length * radius };
    } else if (shape.diagramShape === "ellipse") {
      const centerX = (bounds.left + bounds.right) / 2, centerY = (bounds.top + bounds.bottom) / 2;
      const angle = Math.atan2((point.y - centerY) / (height / 2), (point.x - centerX) / (width / 2));
      candidate = { x: centerX + Math.cos(angle) * width / 2, y: centerY + Math.sin(angle) * height / 2 };
    } else {
      const vertices = shape.diagramShape ? polygonVertices(shape.diagramShape, { x: shape.x, y: shape.y }, { x: shape.x2, y: shape.y2 }) : [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top }, { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }];
      if (!vertices.length) continue;
      candidate = vertices.map((vertex, index) => closestPointOnSegment(point, vertex, vertices[(index + 1) % vertices.length])).reduce((a, b) => distance(point, a) <= distance(point, b) ? a : b);
    }
    const gap = distance(point, candidate);
    if (gap <= best) {
      best = gap;
      closest = { point: candidate, anchor: { shapeId: shape.id, u: Math.max(0, Math.min(1, (candidate.x - bounds.left) / width)), v: Math.max(0, Math.min(1, (candidate.y - bounds.top) / height)) } };
    }
  }
  return closest;
}

export function bindConnectorEndpoint(item: DrawingItem, endpoint: "start" | "end", point: Point, shapes: DrawingItem[], tolerance: number): DrawingItem {
  const match = findConnectorAnchor(point, shapes, tolerance);
  const moved = moveLineEndpoint(item, endpoint, match?.point ?? point);
  return endpoint === "start" ? { ...moved, startAnchor: match?.anchor } : { ...moved, endAnchor: match?.anchor };
}

export function resolveConnectorAnchors(items: DrawingItem[]): DrawingItem[] {
  const shapes = new Map(items.filter((item) => item.kind === "rectangle" || item.kind === "circle").map((item) => [item.id, item]));
  return items.map((item) => {
    if (item.kind !== "arrow") return item;
    let result = item;
    for (const endpoint of ["start", "end"] as const) {
      const anchor = endpoint === "start" ? result.startAnchor : result.endAnchor;
      if (!anchor) continue;
      const shape = shapes.get(anchor.shapeId);
      if (!shape) {
        result = endpoint === "start" ? { ...result, startAnchor: undefined } : { ...result, endAnchor: undefined };
        continue;
      }
      const bounds = itemBounds(shape);
      result = moveLineEndpoint(result, endpoint, { x: bounds.left + (bounds.right - bounds.left) * anchor.u, y: bounds.top + (bounds.bottom - bounds.top) * anchor.v });
    }
    return result;
  });
}

// Construct a transient view of a shape move or resize without modifying the
// saved drawing or its undo history.
export function previewConnectedShape(items: DrawingItem[], shape: DrawingItem): DrawingItem[] {
  return resolveConnectorAnchors(items.map((item) => item.id === shape.id ? shape : item));
}

// A line remains one editable item. Connected endpoints and crossings divide
// its displayed measurements, and are recalculated when geometry changes.
export function lineSections(item: DrawingItem, items: DrawingItem[]): Array<{ start: number; end: number; length: number }> {
  const dx = item.x2 - item.x;
  const dy = item.y2 - item.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return [];
  const cuts = [0, 1];
  function addCut(t: number) {
    if (t * length <= 1e-6 || (1 - t) * length <= 1e-6) return;
    if (!cuts.some((cut) => Math.abs(cut - t) * length <= 1e-6)) cuts.push(t);
  }
  for (const other of items) {
    if (other.id === item.id || (other.kind !== "wall" && other.kind !== "dashed")) continue;
    const sx = other.x2 - other.x, sy = other.y2 - other.y;
    const otherLength = Math.hypot(sx, sy);
    const determinant = dx * sy - dy * sx;
    if (otherLength > 1e-9 && Math.abs(determinant) > 1e-12 * length * otherLength) {
      const qx = other.x - item.x, qy = other.y - item.y;
      const t = (qx * sy - qy * sx) / determinant;
      const u = (qx * dy - qy * dx) / determinant;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) addCut(t);
    }
    for (const point of [{ x: other.x, y: other.y }, { x: other.x2, y: other.y2 }]) {
      const t = ((point.x - item.x) * dx + (point.y - item.y) * dy) / (length * length);
      if (t <= 0 || t >= 1) continue;
      if (distance(point, { x: item.x + t * dx, y: item.y + t * dy }) <= 1e-6) addCut(t);
    }
  }
  cuts.sort((a, b) => a - b);
  return cuts.slice(1).map((end, index) => ({ start: cuts[index], end, length: (end - cuts[index]) * length }));
}

export function lineSectionsByItem(items: DrawingItem[]): Map<string, Array<{ start: number; end: number; length: number }>> {
  const sections = new Map<string, Array<{ start: number; end: number; length: number }>>();
  for (const item of items) {
    if (item.kind === "wall" || item.kind === "dashed") {
      sections.set(item.id, lineSections(item, items));
    }
  }
  return sections;
}

export function hasFullDimension(item: DrawingItem, items: DrawingItem[]): boolean {
  const a = { x: item.x, y: item.y };
  const b = { x: item.x2, y: item.y2 };
  return items.some((other) => other.kind === "dimension" && ((distance(a, { x: other.x, y: other.y }) < 1e-6 && distance(b, { x: other.x2, y: other.y2 }) < 1e-6) || (distance(b, { x: other.x, y: other.y }) < 1e-6 && distance(a, { x: other.x2, y: other.y2 }) < 1e-6)));
}

// Place line labels in plan coordinates so canvas and exports share the layout.
export function layoutLineLabels(
  items: DrawingItem[],
  showOverallDimensions = false,
  sectionsByItem = lineSectionsByItem(items),
): Map<string, Point[]> {
  const positions = new Map<string, Point[]>();
  const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
  const reserve = (point: Point, text: string) => occupied.push({ ...point, width: Math.max(0.8, text.length * 0.1 + 0.2), height: 0.26 });
  for (const item of items) {
    if (!item.showDimension) continue;
    const overall = (item.kind === "wall" || item.kind === "dashed") && showOverallDimensions && (sectionsByItem.get(item.id)?.length ?? 0) > 1 && !hasFullDimension(item, items);
    if (item.kind !== "dimension" && !overall) continue;
    const dx = item.x2 - item.x, dy = item.y2 - item.y, length = Math.hypot(dx, dy) || 1;
    reserve({ x: (item.x + item.x2) / 2 - dy / length * 0.38, y: (item.y + item.y2) / 2 + dx / length * 0.38 - 0.16 }, item.label?.trim() || formatFeetInches(length));
  }
  for (const item of items) {
    if (!item.showDimension || (item.kind !== "wall" && item.kind !== "dashed")) continue;
    const dx = item.x2 - item.x, dy = item.y2 - item.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    const sections = sectionsByItem.get(item.id) ?? [];
    const divided = sections.length > 1;
    const labels = (divided ? sections : [{ start: 0, end: 1, length }]).map((section) => {
      const midpoint = (section.start + section.end) / 2;
      const text = divided ? formatFeetInches(section.length) : item.label?.trim() || formatFeetInches(length);
      const width = Math.max(0.8, text.length * 0.1 + 0.2);
      const side = divided ? -1 : 1;
      let point = { x: item.x + dx * midpoint - dy / length * 0.34 * side, y: item.y + dy * midpoint + dx / length * 0.34 * side };
      for (let step = 0; step < 40; step++) {
        const offset = (0.34 + Math.floor(step / 2) * 0.3) * (step % 2 ? -side : side);
        const candidate = { x: item.x + dx * midpoint - dy / length * offset, y: item.y + dy * midpoint + dx / length * offset };
        if (occupied.every((box) => Math.abs(candidate.x - box.x) >= (width + box.width) / 2 + 0.04 || Math.abs(candidate.y - box.y) >= (0.26 + box.height) / 2 + 0.04)) {
          point = candidate;
          break;
        }
      }
      reserve(point, text);
      return point;
    });
    positions.set(item.id, labels);
  }
  return positions;
}

function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return start;

  // Clamp the projection so a snap lands on the segment, not its infinite line.
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        lengthSquared,
    ),
  );
  return { x: start.x + position * dx, y: start.y + position * dy };
}

function snapCandidates(item: DrawingItem, point: Point): Point[] {
  const start = { x: item.x, y: item.y };
  const end = { x: item.x2, y: item.y2 };

  if (item.kind === "circle") {
    const radius = distance(start, end);
    const angle = Math.atan2(point.y - start.y, point.x - start.x);
    return [
      start,
      {
        x: start.x + Math.cos(angle) * radius,
        y: start.y + Math.sin(angle) * radius,
      },
    ];
  }

  if (item.kind === "rectangle") {
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    const corners = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];
    const edges = corners.map((corner, index) =>
      closestPointOnSegment(point, corner, corners[(index + 1) % corners.length]),
    );

    return [
      ...corners,
      { x: (left + right) / 2, y: (top + bottom) / 2 },
      ...edges,
    ];
  }

  return [
    start,
    end,
    { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    closestPointOnSegment(point, start, end),
  ];
}

export function snapPoint(
  point: Point,
  items: DrawingItem[],
  options: SnapOptions,
  ignoreId?: string,
): SnapResult {
  // Geometry stays in real feet; grid spacing only controls where a new point lands.
  let result = { ...point };

  if (options.grid && options.gridFeet > 0) {
    result = {
      x: Math.round(result.x / options.gridFeet) * options.gridFeet,
      y: Math.round(result.y / options.gridFeet) * options.gridFeet,
    };
  }
  if (!options.objects) return { point: result, snapped: false };

  let closest: Point | undefined;
  let closestDistance = options.toleranceFeet;
  let closestCorner: Point | undefined;
  let cornerDistance = options.toleranceFeet;
  for (const item of items) {
    if (item.id === ignoreId || item.kind === "note" || item.kind === "freehand") continue;
    const candidates = snapCandidates(item, point);
    // Prefer true endpoints and corners to a projection just short of them.
    const cornerCount = item.kind === "rectangle" ? 4 : item.kind === "circle" ? 1 : 2;
    for (const candidate of candidates.slice(0, cornerCount)) {
      const gap = distance(candidate, point);
      if (gap < cornerDistance) {
        closestCorner = candidate;
        cornerDistance = gap;
      }
    }
    for (const candidate of candidates) {
      const gap = distance(candidate, point);
      if (gap < closestDistance) {
        closest = candidate;
        closestDistance = gap;
      }
    }
  }

  return closestCorner
    ? { point: closestCorner, snapped: true }
    : closest
    ? { point: closest, snapped: true }
    : { point: result, snapped: false };
}

export function resizeLine(item: DrawingItem, lengthFeet: number): DrawingItem {
  const currentLength = itemLength(item);
  const direction = currentLength === 0 ? { x: 1, y: 0 } : {
    x: (item.x2 - item.x) / currentLength,
    y: (item.y2 - item.y) / currentLength,
  };

  return {
    ...item,
    x2: item.x + direction.x * lengthFeet,
    y2: item.y + direction.y * lengthFeet,
  };
}

export function moveLineEndpoint(item: DrawingItem, endpoint: "start" | "end", point: Point): DrawingItem {
  return endpoint === "start"
    ? { ...item, x: point.x, y: point.y, ...(item.bend ? { bend: { x: item.bend.x + item.x - point.x, y: item.bend.y + item.y - point.y } } : {}), ...(item.curve ? { curve: { x: item.curve.x + item.x - point.x, y: item.curve.y + item.y - point.y } } : {}) }
    : { ...item, x2: point.x, y2: point.y };
}

const JOINT_EPSILON = 1e-6;

// Split a line that passes through a T-junction so each side can follow the joint.
export function prepareJoint(items: DrawingItem[], joint: Point): DrawingItem[] {
  return items.flatMap((item) => {
    if (item.kind !== "wall" && item.kind !== "dashed") return [item];
    const start = { x: item.x, y: item.y }, end = { x: item.x2, y: item.y2 };
    if (distance(start, joint) <= JOINT_EPSILON || distance(end, joint) <= JOINT_EPSILON) return [item];
    if (distance(closestPointOnSegment(joint, start, end), joint) > JOINT_EPSILON) return [item];
    const newId = newItem(item.kind, joint, end).id;
    return [
      { ...item, x2: joint.x, y2: joint.y },
      { ...item, id: newId, x: joint.x, y: joint.y, label: undefined, layerName: undefined },
    ];
  });
}

export function moveJoint(items: DrawingItem[], joint: Point, destination: Point): DrawingItem[] {
  return items.map((item) => {
    if (item.kind !== "wall" && item.kind !== "dashed" && item.kind !== "dimension") return item;
    let result = item;
    if (distance({ x: item.x, y: item.y }, joint) <= JOINT_EPSILON) result = moveLineEndpoint(result, "start", destination);
    if (distance({ x: item.x2, y: item.y2 }, joint) <= JOINT_EPSILON) result = moveLineEndpoint(result, "end", destination);
    return result;
  });
}

export function moveItem(item: DrawingItem, dx: number, dy: number): DrawingItem {
  return {
    ...item,
    x: item.x + dx,
    y: item.y + dy,
    x2: item.x2 + dx,
    y2: item.y2 + dy,
  };
}

export function isDrawingFile(value: unknown): value is DrawingFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<DrawingFile>;
  if (
    file.version !== 1 ||
    typeof file.name !== "string" ||
    file.name.length > 80 ||
    typeof file.gridFeet !== "number" ||
    !Number.isFinite(file.gridFeet) ||
    file.gridFeet < 0.125 ||
    file.gridFeet > 1000 ||
    !Array.isArray(file.items) ||
    file.items.length > MAX_DRAWING_ITEMS
  ) return false;

  let totalFreehandPoints = 0;
  const itemIds = new Set<string>();
  for (const item of file.items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      item.id.length === 0 ||
      item.id.length > 128 ||
      itemIds.has(item.id) ||
      !["wall", "dashed", "rectangle", "circle", "dimension", "note", "freehand", "arrow"].includes(item.kind) ||
      ![item.x, item.y, item.x2, item.y2].every(
        (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= 1_000_000,
      ) ||
      typeof item.color !== "string" ||
      !/^#[\da-f]{6}$/i.test(item.color) ||
      typeof item.showDimension !== "boolean" ||
      (item.connectorRoute !== undefined && (item.kind !== "arrow" || item.connectorRoute !== "elbow")) ||
      (item.arrowHead !== undefined && (item.kind !== "arrow" || typeof item.arrowHead !== "boolean")) ||
      [item.startAnchor, item.endAnchor].some((anchor) => anchor !== undefined && (
        item.kind !== "arrow" || !anchor || typeof anchor.shapeId !== "string" || !anchor.shapeId || anchor.shapeId.length > 128 ||
        ![anchor.u, anchor.v].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
      )) ||
      (item.textSize !== undefined && (!Number.isFinite(item.textSize) || item.textSize < 8 || item.textSize > 72)) ||
      (item.textColor !== undefined && !/^#[\da-f]{6}$/i.test(item.textColor)) ||
      (item.fillColor !== undefined && !/^#[\da-f]{6}$/i.test(item.fillColor)) ||
      (item.textFont !== undefined && !["Arial", "Georgia", "monospace"].includes(item.textFont)) ||
      (item.textAlign !== undefined && !["left", "center", "right"].includes(item.textAlign)) ||
      (item.textBold !== undefined && typeof item.textBold !== "boolean") ||
      (item.textItalic !== undefined && typeof item.textItalic !== "boolean") ||
      (item.diagramShape !== undefined && (item.kind !== "rectangle" || !["triangle", "diamond", "pentagon", "hexagon", "octagon", "star", "ellipse", "parallelogram", "subprocess"].includes(item.diagramShape))) ||
      (item.bend !== undefined && (!item.bend || ![item.bend.x, item.bend.y].every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 2000000))) ||
      (item.curve !== undefined && (item.kind !== "arrow" || !item.curve || ![item.curve.x, item.curve.y].every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 2000000))) ||
      (item.noteWidth !== undefined && (typeof item.noteWidth !== "number" || !Number.isFinite(item.noteWidth) || item.noteWidth < NOTE_MIN_SIZE || item.noteWidth > NOTE_MAX_SIZE)) ||
      (item.noteHeight !== undefined && (typeof item.noteHeight !== "number" || !Number.isFinite(item.noteHeight) || item.noteHeight < NOTE_MIN_SIZE || item.noteHeight > NOTE_MAX_SIZE)) ||
      (item.layerName !== undefined && (typeof item.layerName !== "string" || item.layerName.length > 80)) ||
      (item.label !== undefined && (typeof item.label !== "string" || item.label.length > 1_000)) ||
      (item.widthLabel !== undefined && (typeof item.widthLabel !== "string" || item.widthLabel.length > 1_000)) ||
      (item.heightLabel !== undefined && (typeof item.heightLabel !== "string" || item.heightLabel.length > 1_000))
    ) return false;
    itemIds.add(item.id);

    if (item.kind === "freehand") {
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > MAX_FREEHAND_POINTS) return false;
      totalFreehandPoints += item.points.length;
      if (totalFreehandPoints > MAX_TOTAL_FREEHAND_POINTS) return false;
      if (!item.points.every((point) =>
        point &&
        typeof point === "object" &&
        [point.x, point.y].every(
          (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= 2_000_000,
        ),
      )) return false;
    }
  }
  return true;
}
