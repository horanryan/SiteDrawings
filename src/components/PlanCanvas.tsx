import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Ellipse, Group, Layer, Line, Path, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  distance,
  formatFeetInches,
  itemLength,
  itemIntersectsSelection,
  isPolygonTool,
  polygonVertices,
  noteSize,
  visibleNoteLines,
  wrapNoteText,
  NOTE_LINE_HEIGHT,
  NOTE_CHARACTER_WIDTH,
  NOTE_FONT_SIZE,
  NOTE_PADDING,
  NOTE_MIN_SIZE,
  NOTE_MAX_SIZE,
  lineSections,
  lineSectionsByItem,
  layoutLineLabels,
  hasFullDimension,
  moveItem,
  moveLineEndpoint,
  moveJoint,
  prepareJoint,
  newItem,
  snapPoint,
  MAX_FREEHAND_POINTS,
  bindConnectorEndpoint,
  findConnectorAnchor,
  shapeConnectionPoints,
  connectorCurvePoints,
  roundedElbowPath,
  elbowArrowhead,
  previewConnectedShape,
} from "../model";
import type { DrawingItem, DrawingTool, Point, ShapeTool, PolygonTool } from "../model";

const PIXELS_PER_FOOT = 40;
const DEFAULT_CAMERA = { x: 120, y: 80, zoom: 1 };

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface PlanCanvasProps {
  theme: "light" | "dark";
  items: DrawingItem[];
  selectedIds: string[];
  activeTool: DrawingTool;
  multiSelect: boolean;
  gridFeet: number;
  gridSnap: boolean;
  objectSnap: boolean;
  showDimensions: boolean;
  workflowMode: boolean;
  textEditRequest: { id: string; text: string; sequence: number } | null;
  showOverallDimensions: boolean;
  spaceDown: boolean;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  onCreate: (item: DrawingItem) => boolean;
  onCreatePolygon: (kind: PolygonTool, start: Point, end: Point) => DrawingItem | undefined;
  onSelect: (id: string | null, additive?: boolean) => void;
  onBoxSelect: (ids: string[], additive: boolean) => void;
  onUpdate: (item: DrawingItem) => void;
  onUpdateItems: (items: DrawingItem[]) => void;
  onCursorMove: (point: Point) => void;
}

interface Gesture {
  kind: ShapeTool;
  start: Point;
  current: Point;
  pointerId: number;
  points?: Point[];
}

interface PanGesture {
  pointerId: number;
  startPointer: Point;
  camera: Camera;
}

interface SelectionBox {
  pointerId: number;
  start: Point;
  current: Point;
  additive: boolean;
}

interface PinchGesture {
  startDistance: number;
  startZoom: number;
  worldAnchor: Point;
}

function normalizedRect(item: DrawingItem) {
  const left = Math.min(0, item.x2 - item.x);
  const top = Math.min(0, item.y2 - item.y);
  return {
    x: left,
    y: top,
    width: Math.abs(item.x2 - item.x),
    height: Math.abs(item.y2 - item.y),
  };
}

function dimensionText(item: DrawingItem, fallback: string) {
  return item.label?.trim() || fallback;
}

function Label({
  x,
  y,
  text,
  rotation = 0,
}: {
  x: number;
  y: number;
  text: string;
  rotation?: number;
}) {
  const width = Math.max(0.8, text.length * 0.1 + 0.2);
  return (
    <Group x={x} y={y} rotation={rotation} listening={false}>
      <Rect
        x={-width / 2}
        y={-0.13}
        width={width}
        height={0.26}
        cornerRadius={0.05}
        fill="white"
        stroke="#e1e7ec"
        strokeWidth={0.015}
      />
      <Text
        x={-width / 2}
        y={-0.09}
        width={width}
        text={text}
        align="center"
        fontFamily="DM Sans, sans-serif"
        fontSize={0.17}
        fontStyle="600"
        fill="#31465a"
      />
    </Group>
  );
}

function LineDrawing({ item, items = [], sections, showOverallDimensions = false, labelPositions, hitWidth = 0.38 }: { item: DrawingItem; items?: DrawingItem[]; sections?: Array<{ start: number; end: number; length: number }>; showOverallDimensions?: boolean; labelPositions?: Point[]; hitWidth?: number }) {
  const dx = item.x2 - item.x;
  const dy = item.y2 - item.y;
  const length = itemLength(item) || 1;
  const offset = 0.34;
  const labelX = dx / 2 - (dy / length) * offset;
  const labelY = dy / 2 + (dx / length) * offset;
  const points = [0, 0, dx, dy];
  const dashed = item.kind === "dashed";
  const lineParts = sections ?? lineSections(item, items);
  const divided = lineParts.length > 1;

  return (
    <>
      <Line
        points={points}
        stroke={item.color}
        strokeWidth={dashed ? 0.045 : 0.06}
        dash={dashed ? [0.2, 0.14] : undefined}
        lineCap="round"
        listening={false}
      />
      <Line
        points={points}
        stroke="transparent"
        strokeWidth={hitWidth}
        hitStrokeWidth={hitWidth}
      />
      {item.showDimension && !divided && (
        <Label
          x={labelPositions?.[0] ? labelPositions[0].x - item.x : labelX}
          y={labelPositions?.[0] ? labelPositions[0].y - item.y : labelY}
          text={dimensionText(item, formatFeetInches(length))}
        />
      )}
      {item.showDimension && divided && lineParts.map((section, index) => {
        const midpoint = (section.start + section.end) / 2;
        return <Label key={index} x={labelPositions?.[index] ? labelPositions[index].x - item.x : dx * midpoint + dy / length * offset} y={labelPositions?.[index] ? labelPositions[index].y - item.y : dy * midpoint - dx / length * offset} text={formatFeetInches(section.length)} />;
      })}
      {item.showDimension && divided && showOverallDimensions && !hasFullDimension(item, items) && (
        <DimensionDrawing item={{ ...item, kind: "dimension" }} />
      )}
    </>
  );
}

function AnnotationArrow({ item, items = [], hitWidth = 0.38 }: { item: DrawingItem; items?: DrawingItem[]; hitWidth?: number }) {
  const dx = item.x2 - item.x, dy = item.y2 - item.y;
  if (item.connectorRoute === "elbow") {
    const path = roundedElbowPath(item, 1, items);
    const head = elbowArrowhead(item, items);
    return <><Path data={path} stroke={item.color} strokeWidth={0.06} lineCap="round" lineJoin="round" hitStrokeWidth={hitWidth} />{item.arrowHead !== false && head.length > 0 && <Line points={head} closed fill={item.color} listening={false} />}</>;
  }
  const curve = connectorCurvePoints(item);
  const points = curve ? curve.flatMap((point) => [point.x, point.y]) : item.bend ? [0, 0, item.bend.x, item.bend.y, dx, dy] : [0, 0, dx, dy];
  return <>{item.arrowHead === false ? <Line points={points} bezier={!!curve} stroke={item.color} strokeWidth={0.06} lineCap="round" lineJoin="round" listening={false} /> : <Arrow points={points} bezier={!!curve} stroke={item.color} fill={item.color} strokeWidth={0.06} pointerLength={0.3} pointerWidth={0.22} lineCap="round" lineJoin="round" listening={false} />}<Line points={points} bezier={!!curve} stroke="transparent" strokeWidth={hitWidth} hitStrokeWidth={hitWidth} /></>;
}

function FreehandDrawing({ item, hitWidth = 0.38 }: { item: DrawingItem; hitWidth?: number }) {
  const points = (item.points ?? []).flatMap((point) => [point.x, point.y]);
  return <Line points={points} stroke={item.color} strokeWidth={0.06} lineCap="round" lineJoin="round" hitStrokeWidth={hitWidth} />;
}

function RectangleDrawing({ item }: { item: DrawingItem }) {
  const rect = normalizedRect(item);
  return (
    <>
      {item.diagramShape === "ellipse" ? <Ellipse x={rect.x + rect.width / 2} y={rect.y + rect.height / 2} radiusX={rect.width / 2} radiusY={rect.height / 2} fill={item.fillColor ?? "rgba(64, 124, 177, 0.04)"} stroke={item.color} strokeWidth={0.06} listening={false} /> : item.diagramShape ? <Line points={polygonVertices(item.diagramShape, { x: 0, y: 0 }, { x: item.x2 - item.x, y: item.y2 - item.y }).flatMap((point) => [point.x, point.y])} closed fill={item.fillColor ?? "rgba(64, 124, 177, 0.04)"} stroke={item.color} strokeWidth={0.06} listening={false} /> : <Rect
        {...rect}
        fill={item.fillColor ?? "rgba(64, 124, 177, 0.04)"}
        stroke={item.color}
        strokeWidth={0.06}
        listening={false}
      />}
      {item.diagramShape === "subprocess" && [0.12, 0.88].map((fraction) => <Line key={fraction} points={[rect.x + rect.width * fraction, rect.y, rect.x + rect.width * fraction, rect.y + rect.height]} stroke={item.color} strokeWidth={0.05} listening={false} />)}
      <Rect
        {...rect}
        fill="transparent"
        stroke="transparent"
        strokeWidth={0.38}
      />
      {item.label && <Text x={rect.x + 0.15} y={rect.y + 0.15} width={Math.max(0, rect.width - 0.3)} height={Math.max(0, rect.height - 0.3)} text={item.label} fontFamily={item.textFont ?? "Arial"} fontSize={(item.textSize ?? 14) / 40} fontStyle={`${item.textBold ? "bold " : ""}${item.textItalic ? "italic" : ""}`.trim() || "normal"} align={item.textAlign ?? "center"} verticalAlign="middle" fill={item.textColor ?? item.color} listening={false} />}
      {item.showDimension && rect.width > 0 && rect.height > 0 && (
        <>
          <Label
            x={rect.x + rect.width / 2}
            y={rect.y - 0.3}
            text={item.widthLabel?.trim() || formatFeetInches(rect.width)}
          />
          <Label
            x={rect.x + rect.width + 0.3}
            y={rect.y + rect.height / 2}
            text={item.heightLabel?.trim() || formatFeetInches(rect.height)}
            rotation={-90}
          />
        </>
      )}
    </>
  );
}

function CircleDrawing({ item }: { item: DrawingItem }) {
  const radius = distance({ x: item.x, y: item.y }, { x: item.x2, y: item.y2 });
  return (
    <>
      <Circle
        radius={radius}
        fill={item.fillColor ?? "rgba(64, 124, 177, 0.04)"}
        stroke={item.color}
        strokeWidth={0.06}
        listening={false}
      />
      <Circle radius={radius} fill="transparent" stroke="transparent" strokeWidth={0.38} />
      {item.label && !item.showDimension && <Text x={-radius * 0.7} y={-radius * 0.7} width={radius * 1.4} height={radius * 1.4} text={item.label} fontFamily={item.textFont ?? "Arial"} fontSize={(item.textSize ?? 14) / 40} fontStyle={`${item.textBold ? "bold " : ""}${item.textItalic ? "italic" : ""}`.trim() || "normal"} align={item.textAlign ?? "center"} verticalAlign="middle" fill={item.textColor ?? item.color} listening={false} />}
      {item.showDimension && radius > 0 && (
        <Label
          x={0}
          y={-radius - 0.28}
          text={dimensionText(item, `Ø ${formatFeetInches(radius * 2)}`)}
        />
      )}
    </>
  );
}

function DimensionDrawing({ item, hitWidth = 0.38 }: { item: DrawingItem; hitWidth?: number }) {
  const dx = item.x2 - item.x;
  const dy = item.y2 - item.y;
  const length = itemLength(item) || 1;
  const offset = 0.38;
  const nx = (-dy / length) * offset;
  const ny = (dx / length) * offset;
  const start = { x: nx, y: ny };
  const end = { x: dx + nx, y: dy + ny };
  const labelX = (start.x + end.x) / 2;
  const labelY = (start.y + end.y) / 2 - 0.16;

  return (
    <>
      <Line
        points={[0, 0, start.x, start.y]}
        stroke="#96a5b3"
        strokeWidth={0.025}
        listening={false}
      />
      <Line
        points={[dx, dy, end.x, end.y]}
        stroke="#96a5b3"
        strokeWidth={0.025}
        listening={false}
      />
      <Arrow
        points={[start.x, start.y, end.x, end.y]}
        stroke="#6f8295"
        fill="#6f8295"
        strokeWidth={0.035}
        pointerLength={0.13}
        pointerWidth={0.12}
        pointerAtBeginning
        pointerAtEnding
        listening={false}
      />
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke="transparent"
        strokeWidth={hitWidth}
        hitStrokeWidth={hitWidth}
      />
      {item.showDimension && (
        <Label
          x={labelX}
          y={labelY}
          text={dimensionText(item, formatFeetInches(length))}
        />
      )}
    </>
  );
}

// Adjust only the on-screen contrast; the stored and exported color is unchanged.
function displayColor(color: string, theme: "light" | "dark"): string {
  if (theme === "light") return color;
  const components = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const luminance = components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
  if (luminance >= 165) return color;
  const amount = (165 - luminance) / (255 - luminance);
  return `#${components.map((component) => Math.round(component + (255 - component) * amount).toString(16).padStart(2, "0")).join("")}`;
}

const DrawingShape = memo(function DrawingShape({
  item,
  theme,
  selected,
  draggable,
  gridFeet,
  gridSnap,
  objectSnap,
  showDimensions,
  workflowMode,
  showOverallDimensions,
  labelPositions,
  sectionsByItem,
  items,
  camera,
  selectItem,
  editNote,
  noteToolActive,
  canEditNote,
  multiSelect,
  onUpdate,
  onDragPreview,
}: {
  item: DrawingItem;
  theme: "light" | "dark";
  selected: boolean;
  draggable: boolean;
  gridFeet: number;
  gridSnap: boolean;
  objectSnap: boolean;
  showDimensions: boolean;
  workflowMode: boolean;
  showOverallDimensions: boolean;
  labelPositions?: Point[];
  sectionsByItem: Map<string, Array<{ start: number; end: number; length: number }>>;
  items: DrawingItem[];
  camera: Camera;
  selectItem: (id: string, additive?: boolean) => void;
  editNote: (item: DrawingItem) => void;
  noteToolActive: boolean;
  canEditNote: () => boolean;
  multiSelect: boolean;
  onUpdate: (item: DrawingItem) => void;
  onDragPreview: (item: DrawingItem | null) => void;
}) {
  const visualItem = { ...item, color: displayColor(item.color, theme), textColor: item.textColor ?? (item.fillColor ? item.color : undefined) };
  // Use a larger invisible hit area for touch without changing drawn geometry.
  const hitWidth = window.matchMedia("(any-pointer: coarse)").matches ? Math.max(0.38, 44 / (PIXELS_PER_FOOT * camera.zoom)) : 0.38;
  const noteBox = item.kind === "note" ? noteSize(item) : null;
  const notePressRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const multiPressRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  function snapDrag(event: KonvaEventObject<DragEvent>) {
    const position = event.target.position();
    const result = snapPoint(
      { x: position.x, y: position.y },
      workflowMode ? items.filter((candidate) => candidate.kind !== "arrow" || (candidate.startAnchor?.shapeId !== item.id && candidate.endAnchor?.shapeId !== item.id)) : items,
      {
        grid: gridSnap,
        objects: objectSnap,
        gridFeet,
        toleranceFeet: 10 / (PIXELS_PER_FOOT * camera.zoom),
      },
      item.id,
    );
    event.target.position(result.point);
    if (workflowMode && (item.kind === "rectangle" || item.kind === "circle")) {
      onDragPreview(moveItem(item, result.point.x - item.x, result.point.y - item.y));
    }
  }

  function finishDrag(event: KonvaEventObject<DragEvent>) {
    const moved = moveItem(item, event.target.x() - item.x, event.target.y() - item.y);
    // Reset the imperatively dragged node; React will render the committed position.
    // This also restores its old position when a move is rejected.
    event.target.position({ x: item.x, y: item.y });
    if (canEditNote()) onUpdate(moved);
    onDragPreview(null);
  }

  return (
    <Group
      x={item.x}
      y={item.y}
      draggable={draggable}
      id={item.id}
      name="drawing-item"
      onPointerDown={(event) => {
        const additive = event.evt.ctrlKey || event.evt.metaKey || multiSelect;
        if (item.kind === "note" && noteToolActive) {
          event.cancelBubble = event.evt.pointerType !== "touch";
          notePressRef.current = { x: event.evt.clientX, y: event.evt.clientY, pointerId: event.evt.pointerId };
          selectItem(item.id);
          return;
        }
        if (multiSelect && event.evt.pointerType === "touch") {
          // Select on release so a second finger can turn the gesture into a pinch.
          multiPressRef.current = { x: event.evt.clientX, y: event.evt.clientY, pointerId: event.evt.pointerId };
          return;
        }
        if (draggable || additive) {
          if (draggable && item.kind === "note" && !additive) notePressRef.current = { x: event.evt.clientX, y: event.evt.clientY, pointerId: event.evt.pointerId };
          // Touch events also reach the stage so pinch gestures can start over objects.
          event.cancelBubble = event.evt.pointerType !== "touch";
          // Do not prevent the pointer event: Konva needs it to start a drag.
          selectItem(item.id, additive);
        }
      }}
      onPointerUp={(event) => {
        const multiStart = multiPressRef.current;
        multiPressRef.current = null;
        if (multiStart && multiStart.pointerId === event.evt.pointerId && canEditNote() && Math.hypot(event.evt.clientX - multiStart.x, event.evt.clientY - multiStart.y) < 4) selectItem(item.id, true);
        const start = notePressRef.current;
        notePressRef.current = null;
        if (start && start.pointerId === event.evt.pointerId && canEditNote() && Math.hypot(event.evt.clientX - start.x, event.evt.clientY - start.y) < 4) {
          event.cancelBubble = event.evt.pointerType !== "touch";
          editNote(item);
        }
      }}
      onDragStart={() => { notePressRef.current = null; }}
      onDblClick={() => { if (workflowMode && (item.kind === "rectangle" || item.kind === "circle")) editNote(item); }}
      onDblTap={() => { if (workflowMode && (item.kind === "rectangle" || item.kind === "circle")) editNote(item); }}
      onDragMove={snapDrag}
      onDragEnd={finishDrag}
    >
      {item.kind === "freehand" ? (
        <FreehandDrawing item={visualItem} hitWidth={hitWidth} />
      ) : item.kind === "wall" || item.kind === "dashed" ? (
        <LineDrawing item={{ ...visualItem, showDimension: showDimensions && item.showDimension }} items={items} sections={sectionsByItem.get(item.id)} showOverallDimensions={showOverallDimensions} labelPositions={labelPositions} hitWidth={hitWidth} />
      ) : item.kind === "rectangle" ? (
        <RectangleDrawing item={{ ...visualItem, showDimension: showDimensions && item.showDimension }} />
      ) : item.kind === "circle" ? (
        <CircleDrawing item={{ ...visualItem, showDimension: showDimensions && item.showDimension }} />
      ) : item.kind === "dimension" ? (
        <DimensionDrawing item={{ ...visualItem, showDimension: showDimensions && item.showDimension }} hitWidth={hitWidth} />
      ) : item.kind === "arrow" ? (
        <AnnotationArrow item={visualItem} items={items} hitWidth={hitWidth} />
      ) : (
        <>
          <Rect width={noteBox?.width} height={noteBox?.height} fill={theme === "dark" ? "rgba(120,200,210,0.04)" : "rgba(30,100,110,0.03)"} stroke={theme === "dark" ? "#46626b" : "#b9cdd0"} strokeWidth={0.02} />
          <Text text={visibleNoteLines(item).join("\n")} fontFamily="monospace" fontSize={NOTE_FONT_SIZE} lineHeight={1.2} wrap="none" fill={visualItem.color} padding={NOTE_PADDING} listening={false} />
        </>
      )}
      {selected && (item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension" || item.kind === "arrow" || item.kind === "freehand") && (
        item.kind === "arrow" && item.connectorRoute === "elbow" ? <Path data={roundedElbowPath(item, 1, items)} stroke="#3b91ce" strokeWidth={0.14} opacity={0.55} lineCap="round" lineJoin="round" listening={false} /> : <Line points={item.kind === "freehand" ? (item.points ?? []).flatMap((point) => [point.x, point.y]) : item.kind === "arrow" && item.curve ? connectorCurvePoints(item)!.flatMap((point) => [point.x, point.y]) : item.kind === "arrow" && item.bend ? [0, 0, item.bend.x, item.bend.y, item.x2 - item.x, item.y2 - item.y] : [0, 0, item.x2 - item.x, item.y2 - item.y]} bezier={item.kind === "arrow" && !!item.curve} stroke="#3b91ce" strokeWidth={0.14} opacity={0.55} lineCap="round" lineJoin="round" listening={false} />
      )}
      {selected && item.kind !== "wall" && item.kind !== "dashed" && item.kind !== "dimension" && item.kind !== "arrow" && item.kind !== "freehand" && (
        item.kind === "circle" ? (
          <Circle
            radius={distance({ x: item.x, y: item.y }, { x: item.x2, y: item.y2 }) + 0.08}
            fill="transparent"
            stroke="#3b91ce"
            strokeWidth={0.025}
            dash={[0.08, 0.06]}
            listening={false}
          />
        ) : (
          <Rect
            x={item.kind === "rectangle" ? normalizedRect(item).x - 0.08 : Math.min(0, item.x2 - item.x) - 0.08}
            y={item.kind === "rectangle" ? normalizedRect(item).y - 0.08 : Math.min(0, item.y2 - item.y) - 0.08}
            width={item.kind === "rectangle"
              ? normalizedRect(item).width + 0.16
              : item.kind === "note"
                ? (noteBox?.width ?? 0)
                : Math.abs(item.x2 - item.x) + 0.16}
            height={item.kind === "rectangle"
              ? normalizedRect(item).height + 0.16
              : item.kind === "note"
                ? (noteBox?.height ?? 0)
                : Math.abs(item.y2 - item.y) + 0.16}
            stroke="#3b91ce"
            strokeWidth={0.025}
            dash={[0.08, 0.06]}
            listening={false}
          />
        )
      )}
    </Group>
  );
});

const Grid = memo(function Grid({
  width,
  height,
  camera,
  gridFeet,
  theme,
}: {
  width: number;
  height: number;
  camera: Camera;
  gridFeet: number;
  theme: "light" | "dark";
}) {
  const lines = useMemo(() => {
    if (width <= 0 || height <= 0 || gridFeet <= 0) return [];

    const pixelsPerFoot = PIXELS_PER_FOOT * camera.zoom;
    let step = gridFeet;

    // At a distant zoom, skip minor lines rather than drawing a dense grid.
    while (step * pixelsPerFoot < 9) step *= 5;

    const left = -camera.x / pixelsPerFoot;
    const top = -camera.y / pixelsPerFoot;
    const right = left + width / pixelsPerFoot;
    const bottom = top + height / pixelsPerFoot;
    const result: Array<{ points: number[]; major: boolean }> = [];
    const firstX = Math.floor(left / step) * step;
    const firstY = Math.floor(top / step) * step;
    const columns = Math.min(500, Math.ceil((right - firstX) / step));
    const rows = Math.min(500, Math.ceil((bottom - firstY) / step));

    for (let column = 0; column <= columns; column += 1) {
      const x = firstX + column * step;
      const major = Math.abs(x / (step * 5) - Math.round(x / (step * 5))) < 0.00001;
      result.push({ points: [x, top, x, bottom], major });
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = firstY + row * step;
      const major = Math.abs(y / (step * 5) - Math.round(y / (step * 5))) < 0.00001;
      result.push({ points: [left, y, right, y], major });
    }
    return result;
  }, [camera, gridFeet, height, width]);

  return (
    <Layer listening={false}>
      <Rect
        x={-camera.x / (PIXELS_PER_FOOT * camera.zoom)}
        y={-camera.y / (PIXELS_PER_FOOT * camera.zoom)}
        width={width / (PIXELS_PER_FOOT * camera.zoom)}
        height={height / (PIXELS_PER_FOOT * camera.zoom)}
        fill={theme === "dark" ? "#111f26" : "#fff"}
      />
      {lines.map((line, index) => (
        <Line
          key={index}
          points={line.points}
          stroke={theme === "dark" ? (line.major ? "#304750" : "#1d3038") : (line.major ? "#d9e2eb" : "#edf1f5")}
          strokeWidth={line.major ? 0.028 : 0.018}
          listening={false}
        />
      ))}
    </Layer>
  );
});

export default function PlanCanvas({
  items,
  theme,
  selectedIds,
  activeTool,
  multiSelect,
  gridFeet,
  gridSnap,
  objectSnap,
  showDimensions,
  workflowMode,
  textEditRequest,
  showOverallDimensions,
  spaceDown,
  camera,
  onCameraChange,
  onCreate,
  onCreatePolygon,
  onSelect,
  onBoxSelect,
  onUpdate,
  onUpdateItems,
  onCursorMove,
}: PlanCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showWelcome, setShowWelcome] = useState(true);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [endpointPreview, setEndpointPreview] = useState<DrawingItem[] | null>(null);
  const [dragPreview, setDragPreview] = useState<DrawingItem | null>(null);
  const dragPreviewFrame = useRef<number | null>(null);
  const pendingDragPreview = useRef<DrawingItem | null>(null);
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [noteInputHeight, setNoteInputHeight] = useState(0);
  const [noteResizePreview, setNoteResizePreview] = useState<{ id: string; width: number; height: number } | null>(null);
  const cancelNoteRef = useRef(false);
  const jointRef = useRef<{ point: Point; prepared: DrawingItem[] } | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const gestureFrameRef = useRef<number | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const panRef = useRef<PanGesture | null>(null);
  const pinchRef = useRef<PinchGesture | null>(null);
  const touchPointsRef = useRef(new Map<number, Point>());
  const pinchOccurredRef = useRef(false);
  const penPointersRef = useRef(new Set<number>());
  const pixelsPerFoot = PIXELS_PER_FOOT * camera.zoom;
  const selectedLine = selectedIds.length === 1 ? items.find((item) => item.id === selectedIds[0] && (item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension" || item.kind === "arrow")) : undefined;
  const displayedItems = useMemo(() => {
    const base = endpointPreview ?? (dragPreview ? previewConnectedShape(items, dragPreview) : items);
    return base.map((item) => noteResizePreview?.id === item.id ? { ...item, noteWidth: noteResizePreview.width, noteHeight: noteResizePreview.height } : item);
  }, [endpointPreview, items, noteResizePreview, dragPreview]);
  const selectedWorkflowShape = workflowMode && selectedIds.length === 1 ? displayedItems.find((item) => item.id === selectedIds[0] && (item.kind === "rectangle" || item.kind === "circle")) : undefined;
  const selectedNote = selectedIds.length === 1 ? displayedItems.find((item) => item.id === selectedIds[0] && item.kind === "note") : undefined;
  const sectionsByItem = useMemo(() => lineSectionsByItem(displayedItems), [displayedItems]);
  const lineLabelPositions = useMemo(() => layoutLineLabels(displayedItems, showOverallDimensions, sectionsByItem), [displayedItems, sectionsByItem, showOverallDimensions]);

  useEffect(() => {
    setEndpointPreview(null);
    setNoteResizePreview(null);
  }, [selectedIds]);

  function previewDraggedShape(item: DrawingItem | null) {
    pendingDragPreview.current = item;
    if (!item) {
      if (dragPreviewFrame.current !== null) window.cancelAnimationFrame(dragPreviewFrame.current);
      dragPreviewFrame.current = null;
      setDragPreview(null);
      return;
    }
    if (dragPreviewFrame.current === null) {
      dragPreviewFrame.current = window.requestAnimationFrame(() => {
        dragPreviewFrame.current = null;
        setDragPreview(pendingDragPreview.current);
      });
    }
  }

  useEffect(() => {
    if (editingNote) noteInputRef.current?.focus();
  }, [editingNote?.id]);

  useEffect(() => {
    if (!textEditRequest) return;
    setNoteInputHeight(0);
    cancelNoteRef.current = false;
    setEditingNote({ id: textEditRequest.id, text: textEditRequest.text });
  }, [textEditRequest]);

  useLayoutEffect(() => {
    const input = noteInputRef.current;
    if (editingNote && input && input.scrollHeight > input.clientHeight) {
      setNoteInputHeight(input.scrollHeight + 2);
    }
  }, [editingNote?.text, editingNote?.id, size.width, size.height, camera.zoom]);

  function beginNoteEdit(item: DrawingItem) {
    setNoteInputHeight(0);
    cancelNoteRef.current = false;
    setEditingNote({ id: item.id, text: item.label ?? "" });
  }

  function finishNoteEdit() {
    if (!editingNote) return;
    const item = items.find((entry) => entry.id === editingNote.id);
    if (!cancelNoteRef.current && item && (item.label ?? "") !== editingNote.text) {
      // Grow a note after editing so newly entered lines are not silently hidden.
      if (item.kind !== "note") { onUpdate({ ...item, label: editingNote.text }); cancelNoteRef.current = false; setEditingNote(null); return; }
      const size = noteSize(item);
      const requiredHeight = NOTE_PADDING * 2 + wrapNoteText(editingNote.text || "Note", size.width).length * NOTE_LINE_HEIGHT;
      onUpdate({ ...item, label: editingNote.text, noteHeight: Math.min(NOTE_MAX_SIZE, Math.max(size.height, requiredHeight)) });
    }
    cancelNoteRef.current = false;
    setEditingNote(null);
  }

  function scheduleGesturePreview() {
    if (gestureFrameRef.current !== null) return;
    gestureFrameRef.current = window.requestAnimationFrame(() => {
      gestureFrameRef.current = null;
      if (gestureRef.current) setGesture(gestureRef.current);
    });
  }

  function cancelGesturePreview() {
    if (gestureFrameRef.current === null) return;
    window.cancelAnimationFrame(gestureFrameRef.current);
    gestureFrameRef.current = null;
  }

  function appendFreehandPoint(gesture: Gesture, point: Point) {
    if (!gesture.points) return;
    const relative = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
    const last = gesture.points[gesture.points.length - 1];
    if (distance(last, relative) < 2 / pixelsPerFoot) return;
    if (gesture.points.length < MAX_FREEHAND_POINTS) gesture.points.push(relative);
    else gesture.points[gesture.points.length - 1] = relative;
  }

  function endpointAt(event: KonvaEventObject<DragEvent>, joint: { point: Point; prepared: DrawingItem[] }) {
    const position = event.target.position();
    // An annotation arrow can point to a joint without moving the connected linework.
    if (selectedLine?.kind === "arrow") {
      const endpoint = distance(joint.point, { x: selectedLine.x, y: selectedLine.y }) <= 1e-6 ? "start" : "end";
      const match = workflowMode ? findConnectorAnchor(position, items, 18 / pixelsPerFoot) : undefined;
      const point = match?.point ?? snapPoint(position, items.filter((item) => item.id !== selectedLine.id), { grid: gridSnap, objects: objectSnap, gridFeet, toleranceFeet: 10 / pixelsPerFoot }).point;
      event.target.position(point);
      return items.map((item) => item.id === selectedLine.id ? workflowMode ? bindConnectorEndpoint(item, endpoint, point, items, 18 / pixelsPerFoot) : moveLineEndpoint(item, endpoint, point) : item);
    }
    const stationary = joint.prepared.filter((item) => !((item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension") && (distance({ x: item.x, y: item.y }, joint.point) <= 1e-6 || distance({ x: item.x2, y: item.y2 }, joint.point) <= 1e-6)));
    const point = snapPoint(position, stationary, { grid: gridSnap, objects: objectSnap, gridFeet, toleranceFeet: 10 / pixelsPerFoot }).point;
    event.target.position(point);
    return distance(joint.point, point) <= 1e-6 ? items : moveJoint(joint.prepared, joint.point, point);
  }

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
      if (gestureFrameRef.current !== null) {
        window.cancelAnimationFrame(gestureFrameRef.current);
      }
      if (dragPreviewFrame.current !== null) window.cancelAnimationFrame(dragPreviewFrame.current);
    };
  }, []);

  function pointerPosition(event: PointerEvent): Point | null {
    const bounds = hostRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    // Convert from screen pixels back to plan feet after applying zoom and pan.
    return {
      x: (event.clientX - bounds.left - camera.x) / pixelsPerFoot,
      y: (event.clientY - bounds.top - camera.y) / pixelsPerFoot,
    };
  }

  function localPointer(point: Point): Point | null {
    const bounds = hostRef.current?.getBoundingClientRect();
    return bounds ? { x: point.x - bounds.left, y: point.y - bounds.top } : null;
  }

  function startPinch() {
    const points = [...touchPointsRef.current.values()];
    if (points.length < 2) return;
    pinchOccurredRef.current = true;
    const midpoint = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
    const localMidpoint = localPointer(midpoint);
    if (!localMidpoint) return;

    // Keep the plan point between the fingers anchored while their distance changes.
    pinchRef.current = {
      startDistance: Math.max(distance(points[0], points[1]), 1),
      startZoom: camera.zoom,
      worldAnchor: {
        x: (localMidpoint.x - camera.x) / pixelsPerFoot,
        y: (localMidpoint.y - camera.y) / pixelsPerFoot,
      },
    };
    panRef.current = null;
    gestureRef.current = null;
    cancelGesturePreview();
    setGesture(null);

    // A second finger turns an in-progress item drag into a view gesture.
    stageRef.current?.find(".drawing-item").forEach((node) => {
      if (!node.isDragging()) return;
      const item = items.find((drawing) => drawing.id === node.id());
      if (item) node.position({ x: item.x, y: item.y });
      node.stopDrag();
    });
  }

  function snap(point: Point, ignoreId?: string) {
    return snapPoint(
      point,
      items,
      {
        grid: gridSnap,
        objects: objectSnap,
        gridFeet,
        toleranceFeet: 10 / pixelsPerFoot,
      },
      ignoreId,
    );
  }

  function handlePointerDown(event: PointerEvent, target: Konva.Node) {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    // CSS touch-action blocks browser panning; preserving the event over an
    // item lets Konva's touch dragging coexist with stage pinch tracking.
    if (event.pointerType !== "touch") event.preventDefault();
    const pointerTarget = event.target;
    if (pointerTarget instanceof HTMLElement) {
      pointerTarget.setPointerCapture(event.pointerId);
    }
    const point = pointerPosition(event);
    if (!point) return;
    onCursorMove(point);

    if (event.pointerType === "pen") {
      penPointersRef.current.add(event.pointerId);
      // Ignore palm contacts while the Pencil is actively drawing.
      touchPointsRef.current.clear();
      panRef.current = null;
      pinchRef.current = null;
    }

    if (event.pointerType === "touch") {
      if (penPointersRef.current.size > 0) return;
      if (touchPointsRef.current.size === 0) pinchOccurredRef.current = false;
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointsRef.current.size >= 2) {
        startPinch();
        return;
      }

      if (activeTool === "select" && target === target.getStage()) {
        panRef.current = {
          pointerId: event.pointerId,
          startPointer: { x: event.clientX, y: event.clientY },
          camera,
        };
        onSelect(null);
      }
      if (activeTool === "select") return;
    }

    if (spaceDown || (event.pointerType === "mouse" && event.button === 1)) {
      panRef.current = {
        pointerId: event.pointerId,
        startPointer: { x: event.clientX, y: event.clientY },
        camera,
      };
      return;
    }

    if (target !== target.getStage() && activeTool === "select") return;
    if (activeTool === "note") {
      const hitItem = target.findAncestor(".drawing-item", true);
      if (hitItem && items.some((item) => item.id === hitItem.id() && item.kind === "note")) return;
      const snapped = snap(point).point;
      const note = newItem("note", snapped, snapped);
      if (onCreate(note)) beginNoteEdit(note);
      return;
    }
    if (activeTool !== "select") {
      const start = activeTool === "freehand" ? point : workflowMode && activeTool === "arrow" ? (findConnectorAnchor(point, items, 18 / pixelsPerFoot)?.point ?? snap(point).point) : snap(point).point;
      const nextGesture = { kind: activeTool, start, current: start, pointerId: event.pointerId, points: activeTool === "freehand" ? [{ x: 0, y: 0 }] : undefined };
      gestureRef.current = nextGesture;
      setGesture(nextGesture);
    } else if (target === target.getStage()) {
      if (event.pointerType === "mouse" && event.button === 0) {
        const box = { pointerId: event.pointerId, start: point, current: point, additive: event.ctrlKey || event.metaKey };
        selectionBoxRef.current = box;
        setSelectionBox(box);
      } else {
        onSelect(null);
      }
    }
  }

  function handlePointerMove(event: PointerEvent) {
    const point = pointerPosition(event);
    if (!point) return;
    onCursorMove(point);

    if (event.pointerType === "touch" && touchPointsRef.current.has(event.pointerId)) {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current && touchPointsRef.current.size >= 2) {
        const points = [...touchPointsRef.current.values()];
        const midpoint = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        const localMidpoint = localPointer(midpoint);
        if (!localMidpoint) return;

        const nextDistance = Math.max(distance(points[0], points[1]), 1);
        const zoom = Math.max(
          0.12,
          Math.min(4, pinchRef.current.startZoom * nextDistance / pinchRef.current.startDistance),
        );
        const nextPixelsPerFoot = PIXELS_PER_FOOT * zoom;
        onCameraChange({
          zoom,
          x: localMidpoint.x - pinchRef.current.worldAnchor.x * nextPixelsPerFoot,
          y: localMidpoint.y - pinchRef.current.worldAnchor.y * nextPixelsPerFoot,
        });
        return;
      }
    }

    if (panRef.current?.pointerId === event.pointerId) {
      onCameraChange({
        ...panRef.current.camera,
        x: panRef.current.camera.x + event.clientX - panRef.current.startPointer.x,
        y: panRef.current.camera.y + event.clientY - panRef.current.startPointer.y,
      });
      return;
    }

    if (selectionBoxRef.current?.pointerId === event.pointerId) {
      const box = { ...selectionBoxRef.current, current: point };
      selectionBoxRef.current = box;
      setSelectionBox(box);
      return;
    }

    const currentGesture = gestureRef.current;
    if (currentGesture?.pointerId === event.pointerId) {
      const current = currentGesture.kind === "freehand" ? point : workflowMode && currentGesture.kind === "arrow" ? (findConnectorAnchor(point, items, 18 / pixelsPerFoot)?.point ?? snap(point).point) : snap(point).point;
      if (currentGesture.points) appendFreehandPoint(currentGesture, current);
      const nextGesture = { ...currentGesture, current };
      gestureRef.current = nextGesture;
      scheduleGesturePreview();
    }
  }

  function handlePointerUp(event: PointerEvent, cancelled = false) {
    if (event.pointerType === "pen") penPointersRef.current.delete(event.pointerId);
    if (event.pointerType === "touch") {
      const wasPinching = pinchRef.current !== null;
      touchPointsRef.current.delete(event.pointerId);
      if (touchPointsRef.current.size === 0) pinchOccurredRef.current = false;
      if (touchPointsRef.current.size < 2) pinchRef.current = null;
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null;

      // Continue panning with one finger after the other finger leaves a pinch.
      if (wasPinching && touchPointsRef.current.size === 1) {
        const [pointerId, point] = [...touchPointsRef.current.entries()][0];
        panRef.current = { pointerId, startPointer: point, camera };
      }
      if (wasPinching || touchPointsRef.current.size > 0) return;
    }

    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    const box = selectionBoxRef.current;
    if (box?.pointerId === event.pointerId) {
      const end = pointerPosition(event) ?? box.current;
      if (!cancelled) {
        if (distance(box.start, end) * pixelsPerFoot >= 4) {
          onBoxSelect(items.filter((item) => itemIntersectsSelection(item, box.start, end)).map((item) => item.id), box.additive);
        } else if (!box.additive) onSelect(null);
      }
      selectionBoxRef.current = null;
      setSelectionBox(null);
      return;
    }
    const currentGesture = gestureRef.current;
    if (!currentGesture || currentGesture.pointerId !== event.pointerId) return;
    const releasePoint = pointerPosition(event);
    const end = currentGesture.kind === "freehand"
      ? releasePoint ?? currentGesture.current
      : releasePoint ? (workflowMode && currentGesture.kind === "arrow" ? findConnectorAnchor(releasePoint, items, 18 / pixelsPerFoot)?.point : undefined) ?? snap(releasePoint).point : currentGesture.current;
    if (currentGesture.points) appendFreehandPoint(currentGesture, end);
    if (!cancelled && (currentGesture.kind === "freehand" ? (currentGesture.points?.length ?? 0) >= 2 : distance(currentGesture.start, end) > 0.04)) {
      if (isPolygonTool(currentGesture.kind)) {
        const created = onCreatePolygon(currentGesture.kind, currentGesture.start, end);
        if (workflowMode && created) beginNoteEdit(created);
      } else {
        const item = newItem(currentGesture.kind, currentGesture.start, end);
        if (currentGesture.points) item.points = currentGesture.points;
        if (onCreate(item) && workflowMode && (item.kind === "rectangle" || item.kind === "circle")) beginNoteEdit(item);
      }
    }
    gestureRef.current = null;
    cancelGesturePreview();
    setGesture(null);
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    const zoomFactor = event.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const zoom = Math.max(0.12, Math.min(4, camera.zoom * zoomFactor));
    const nextPixelsPerFoot = PIXELS_PER_FOOT * zoom;
    // Keep the plan point under the cursor fixed while the view zooms.
    const worldPoint = {
      x: (pointer.x - camera.x) / pixelsPerFoot,
      y: (pointer.y - camera.y) / pixelsPerFoot,
    };
    onCameraChange({
      zoom,
      x: pointer.x - worldPoint.x * nextPixelsPerFoot,
      y: pointer.y - worldPoint.y * nextPixelsPerFoot,
    });
  }

  const preview = gesture && !isPolygonTool(gesture.kind) ? newItem(gesture.kind, gesture.start, gesture.current) : null;
  const polygonPreview = gesture && isPolygonTool(gesture.kind) ? polygonVertices(gesture.kind, gesture.start, gesture.current) : [];
  if (preview && gesture) {
    preview.color = displayColor(preview.color, theme);
    preview.points = gesture.points;
    if (workflowMode && preview.kind === "arrow") {
      preview.connectorRoute = "elbow";
      preview.startAnchor = findConnectorAnchor(gesture.start, items, 18 / pixelsPerFoot)?.anchor;
      preview.endAnchor = findConnectorAnchor(gesture.current, items, 18 / pixelsPerFoot)?.anchor;
    }
  }

  return (
    <div
      className={`plan-canvas ${activeTool === "select" ? "cursor-select" : ""} ${spaceDown ? "cursor-pan" : ""}`}
      ref={hostRef}
      onPointerCancel={(event) => handlePointerUp(event.nativeEvent, true)}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={camera.x}
        y={camera.y}
        scaleX={pixelsPerFoot}
        scaleY={pixelsPerFoot}
        onPointerDown={(event) => handlePointerDown(event.evt, event.target)}
        onPointerMove={(event) => handlePointerMove(event.evt)}
        onPointerUp={(event) => handlePointerUp(event.evt, event.evt.type === "pointercancel")}
        onPointerCancel={(event) => handlePointerUp(event.evt, true)}
        onWheel={handleWheel}
      >
        <Grid width={size.width} height={size.height} camera={camera} gridFeet={gridFeet} theme={theme} />
        <Layer>
          {displayedItems.map((item) => (
            <DrawingShape
              key={item.id}
              item={dragPreview?.id === item.id ? items.find((original) => original.id === item.id) ?? item : item}
              theme={theme}
              selected={selectedIds.includes(item.id)}
              draggable={activeTool === "select" && !spaceDown && !multiSelect}
              gridFeet={gridFeet}
              gridSnap={gridSnap}
              objectSnap={objectSnap}
              showDimensions={showDimensions}
              workflowMode={workflowMode}
              showOverallDimensions={showOverallDimensions}
              labelPositions={lineLabelPositions.get(item.id)}
              sectionsByItem={sectionsByItem}
              items={displayedItems}
              camera={camera}
              selectItem={onSelect}
              editNote={beginNoteEdit}
              noteToolActive={activeTool === "note" && !spaceDown}
              canEditNote={() => !pinchOccurredRef.current}
              multiSelect={multiSelect}
              onUpdate={onUpdate}
              onDragPreview={previewDraggedShape}
            />
          ))}
          {polygonPreview.length > 0 && <Line points={polygonPreview.flatMap((point) => [point.x, point.y])} closed stroke={theme === "dark" ? "#b6d9dc" : "#30465c"} strokeWidth={0.06} opacity={0.6} listening={false} />}
          {workflowMode && (activeTool === "arrow" || (activeTool === "select" && selectedLine?.kind === "arrow")) && displayedItems.flatMap((item) => shapeConnectionPoints(item).map((point, index) => <Circle key={`${item.id}-port-${index}`} x={point.x} y={point.y} radius={5 / pixelsPerFoot} fill={theme === "dark" ? "#18363e" : "#ffffff"} stroke="#168c9a" strokeWidth={2 / pixelsPerFoot} listening={false} />))}
          {preview && (
            <Group x={preview.x} y={preview.y} opacity={0.6} listening={false}>
              {preview.kind === "freehand" ? (
                <FreehandDrawing item={preview} />
              ) : preview.kind === "wall" || preview.kind === "dashed" ? (
                <LineDrawing item={{ ...preview, showDimension: showDimensions && preview.showDimension }} />
              ) : preview.kind === "rectangle" ? (
                <RectangleDrawing item={{ ...preview, showDimension: showDimensions && preview.showDimension }} />
              ) : preview.kind === "circle" ? (
                <CircleDrawing item={{ ...preview, showDimension: showDimensions && preview.showDimension }} />
              ) : preview.kind === "arrow" ? (
                <AnnotationArrow item={preview} items={displayedItems} />
              ) : (
                <DimensionDrawing item={preview} />
              )}
            </Group>
          )}
          {selectionBox && <Rect x={Math.min(selectionBox.start.x, selectionBox.current.x)} y={Math.min(selectionBox.start.y, selectionBox.current.y)} width={Math.abs(selectionBox.current.x - selectionBox.start.x)} height={Math.abs(selectionBox.current.y - selectionBox.start.y)} fill="rgba(59, 145, 206, 0.12)" stroke="#3b91ce" strokeWidth={1 / pixelsPerFoot} dash={[5 / pixelsPerFoot, 4 / pixelsPerFoot]} listening={false} />}
          {selectedNote && !multiSelect && !editingNote && (() => {
            const { width, height } = noteSize(selectedNote);
            const clamp = (value: number) => Math.max(NOTE_MIN_SIZE, Math.min(NOTE_MAX_SIZE, value));
            return <Rect x={selectedNote.x + width} y={selectedNote.y + height} width={12 / pixelsPerFoot} height={12 / pixelsPerFoot} offsetX={6 / pixelsPerFoot} offsetY={6 / pixelsPerFoot} fill="white" stroke="#168c9a" strokeWidth={2 / pixelsPerFoot} hitStrokeWidth={44 / pixelsPerFoot} cornerRadius={2 / pixelsPerFoot} draggable
              onPointerDown={(event) => { event.cancelBubble = true; }}
              onMouseDown={(event) => { event.cancelBubble = true; }}
              onTouchStart={(event) => { event.cancelBubble = true; }}
              onDragMove={(event) => { event.cancelBubble = true; const width = clamp(event.target.x() - selectedNote.x); const height = noteSize({ ...selectedNote, noteWidth: width, noteHeight: clamp(event.target.y() - selectedNote.y) }).height; event.target.position({ x: selectedNote.x + width, y: selectedNote.y + height }); setNoteResizePreview({ id: selectedNote.id, width, height }); }}
              onDragEnd={(event) => { event.cancelBubble = true; const width = clamp(event.target.x() - selectedNote.x); const height = noteSize({ ...selectedNote, noteWidth: width, noteHeight: clamp(event.target.y() - selectedNote.y) }).height; if (!event.evt.type.includes("cancel")) onUpdate({ ...selectedNote, noteWidth: width, noteHeight: height }); setNoteResizePreview(null); }} />;
          })()}
          {activeTool === "select" && !multiSelect && !editingNote && selectedWorkflowShape && (() => {
            const shape = selectedWorkflowShape;
            const radius = itemLength(shape);
            const corner = shape.kind === "circle" ? { x: shape.x + radius, y: shape.y } : { x: shape.x2, y: shape.y2 };
            return <Rect x={corner.x} y={corner.y} width={12 / pixelsPerFoot} height={12 / pixelsPerFoot} offsetX={6 / pixelsPerFoot} offsetY={6 / pixelsPerFoot} fill="white" stroke="#168c9a" strokeWidth={2 / pixelsPerFoot} hitStrokeWidth={44 / pixelsPerFoot} draggable
              onPointerDown={(event) => { event.cancelBubble = true; }}
              onMouseDown={(event) => { event.cancelBubble = true; }}
              onTouchStart={(event) => { event.cancelBubble = true; }}
              onDragMove={(event) => { event.cancelBubble = true; const point = snap({ x: event.target.x(), y: event.target.y() }, shape.id).point; const updated = shape.kind === "circle" ? { ...shape, x2: shape.x + distance({ x: shape.x, y: shape.y }, point), y2: shape.y } : { ...shape, x2: point.x, y2: point.y }; setEndpointPreview(previewConnectedShape(items, updated)); }}
              onDragEnd={(event) => { event.cancelBubble = true; const point = snap({ x: event.target.x(), y: event.target.y() }, shape.id).point; const updated = shape.kind === "circle" ? { ...shape, x2: shape.x + distance({ x: shape.x, y: shape.y }, point), y2: shape.y } : { ...shape, x2: point.x, y2: point.y }; if (!event.evt.type.includes("cancel") && (shape.kind === "circle" ? itemLength(updated) > 0.05 : Math.abs(updated.x2 - updated.x) > 0.05 && Math.abs(updated.y2 - updated.y) > 0.05)) onUpdate(updated); setEndpointPreview(null); }} />;
          })()}
          {workflowMode && activeTool === "select" && !multiSelect && selectedLine?.kind === "arrow" && selectedLine.connectorRoute !== "elbow" && (() => {
            const bend = selectedLine.curve ?? selectedLine.bend ?? { x: (selectedLine.x2 - selectedLine.x) / 2, y: (selectedLine.y2 - selectedLine.y) / 2 };
            return <Rect x={selectedLine.x + bend.x} y={selectedLine.y + bend.y} width={12 / pixelsPerFoot} height={12 / pixelsPerFoot} offsetX={6 / pixelsPerFoot} offsetY={6 / pixelsPerFoot} fill="#fff" stroke="#168c9a" strokeWidth={2 / pixelsPerFoot} hitStrokeWidth={44 / pixelsPerFoot} draggable
              onPointerDown={(event) => { event.cancelBubble = true; }}
              onDragMove={(event) => { event.cancelBubble = true; setEndpointPreview(items.map((item) => item.id === selectedLine.id ? { ...item, bend: undefined, curve: { x: event.target.x() - item.x, y: event.target.y() - item.y } } : item)); }}
              onDragEnd={(event) => { event.cancelBubble = true; if (!event.evt.type.includes("cancel")) onUpdate({ ...selectedLine, bend: undefined, curve: { x: event.target.x() - selectedLine.x, y: event.target.y() - selectedLine.y } }); setEndpointPreview(null); }} />;
          })()}
          {activeTool === "select" && !multiSelect && selectedLine && (["start", "end"] as const).map((endpoint) => {
            const shown = displayedItems.find((item) => item.id === selectedLine.id) ?? selectedLine;
            return <Circle key={`${selectedLine.id}-${endpoint}`} x={endpoint === "start" ? shown.x : shown.x2} y={endpoint === "start" ? shown.y : shown.y2} radius={6 / pixelsPerFoot} hitStrokeWidth={44 / pixelsPerFoot} fill="white" stroke="#287bc0" strokeWidth={2 / pixelsPerFoot} draggable
              onPointerDown={(event) => { event.cancelBubble = true; }}
              onMouseDown={(event) => { event.cancelBubble = true; }}
              onTouchStart={(event) => { event.cancelBubble = true; }}
              onDragStart={(event) => {
                event.cancelBubble = true;
                const point = endpoint === "start" ? { x: selectedLine.x, y: selectedLine.y } : { x: selectedLine.x2, y: selectedLine.y2 };
                jointRef.current = { point, prepared: selectedLine.kind === "arrow" ? items : prepareJoint(items, point) };
              }}
              onDragMove={(event) => { event.cancelBubble = true; if (jointRef.current) setEndpointPreview(endpointAt(event, jointRef.current)); }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                if (!event.evt.type.includes("cancel") && jointRef.current) {
                  const updated = endpointAt(event, jointRef.current);
                  if (updated.every((item) => !["wall", "dashed", "dimension", "arrow"].includes(item.kind) || distance({ x: item.x, y: item.y }, { x: item.x2, y: item.y2 }) > 0.001)) onUpdateItems(updated);
                }
                jointRef.current = null;
                setEndpointPreview(null);
              }} />;
          })}
        </Layer>
      </Stage>
      {editingNote && (() => {
        const note = items.find((item) => item.id === editingNote.id);
        if (!note) return null;
        const bounds = note.kind === "rectangle" ? { x: Math.min(note.x, note.x2), y: Math.min(note.y, note.y2), width: Math.abs(note.x2 - note.x), height: Math.abs(note.y2 - note.y) } : note.kind === "circle" ? { x: note.x - itemLength(note), y: note.y - itemLength(note), width: itemLength(note) * 2, height: itemLength(note) * 2 } : { x: note.x, y: note.y, ...noteSize({ ...note, label: editingNote.text }) };
        const box = bounds;
        const width = Math.min(size.width, Math.max(120, box.width * pixelsPerFoot));
        const minFontSize = window.matchMedia("(any-pointer: coarse)").matches ? 16 : 12;
        const fontSize = Math.max(minFontSize, Math.min(72, (note.kind === "note" ? NOTE_FONT_SIZE : (note.textSize ?? 14) / 40) * pixelsPerFoot));
        const editWidth = Math.max(NOTE_MIN_SIZE, ((width - 8) / (fontSize * 0.6)) * NOTE_CHARACTER_WIDTH + NOTE_PADDING * 2);
        const editLines = wrapNoteText(editingNote.text || "Note", editWidth).length;
        const height = Math.max(64, box.height * pixelsPerFoot, editLines * fontSize * 1.2 + 8, noteInputHeight);
        const left = Math.max(0, Math.min(size.width - width, camera.x + bounds.x * pixelsPerFoot));
        // Keep the end of a very tall note in view without giving it an internal scrollbar.
        const top = Math.min(Math.max(0, camera.y + bounds.y * pixelsPerFoot), size.height - height - 44);
        return <div className="canvas-note-editor" style={{ left, top, width }} onPointerDown={(event) => event.stopPropagation()}>
          <textarea ref={noteInputRef} className="canvas-note-input" aria-label={note.kind === "note" ? "Note text" : "Shape text"} placeholder={note.kind === "note" ? "Type a note…" : "Add a label…"} maxLength={1000} value={editingNote.text} style={{ height, fontSize, paddingTop: note.kind === "note" ? undefined : Math.max(8, (height - editLines * fontSize * 1.2) / 2), fontFamily: note.kind === "note" ? undefined : note.textFont ?? "Arial", fontWeight: note.textBold ? "bold" : "normal", fontStyle: note.textItalic ? "italic" : "normal", textAlign: note.kind === "note" ? "left" : note.textAlign ?? "center", color: note.textColor }} onChange={(event) => setEditingNote({ ...editingNote, text: event.target.value })} onBlur={finishNoteEdit} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelNoteRef.current = true; event.currentTarget.blur(); } }} />
          <div className="canvas-note-actions"><button type="button" onClick={finishNoteEdit}>Done</button></div>
        </div>;
      })()}
      {showWelcome && items.length === 0 && !gesture && activeTool === "select" && (
        <div className="canvas-empty">
          <div className="empty-grid-icon" aria-hidden="true"><span>⌗</span></div>
          <span className="empty-eyebrow">{workflowMode ? "YOUR WORKFLOW WORKSPACE" : "YOUR DRAWING WORKSPACE"}</span>
          <strong>{workflowMode ? "Start your workflow." : "Start your plan."}</strong>
          <span>Choose a tool whenever you’re ready.{!workflowMode && <><br />Each grid square represents {formatFeetInches(gridFeet)}.</>}</span>
          <button className="button button-outline" onClick={() => setShowWelcome(false)}>
            Open canvas
          </button>
        </div>
      )}
      {gesture && !workflowMode && (
        <div className="drawing-hint" aria-live="polite">
          {formatFeetInches(distance(gesture.start, gesture.current))}
        </div>
      )}
    </div>
  );
}

export { DEFAULT_CAMERA, PIXELS_PER_FOOT };
