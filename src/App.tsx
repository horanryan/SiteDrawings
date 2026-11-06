import { useEffect, useRef, useState } from "react";
import {
  CircleHelp,
  Shapes,
  Triangle,
  Diamond,
  Pentagon,
  Hexagon,
  Octagon,
  Star,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Layers,
  Moon,
  Sun,
  Trash2,
  RotateCcw,
  PanelRight,
  CheckSquare2,
  ListChecks,
  Circle,
  Download,
  FileImage,
  FileJson,
  FileText,
  Grid2X2,
  Minus,
  MousePointer2,
  MoveUpRight,
  Plus,
  Pencil,
  Redo2,
  Ruler,
  Save,
  Square,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import Inspector from "./components/Inspector";
import { TOOL_SHORTCUTS, ACTION_SHORTCUTS, toolForKey } from "./shortcuts";
import { clearSavedDrawing } from "./reset";
import logo from "./assets/rh-trace.svg";
import PlanCanvas, { DEFAULT_CAMERA } from "./components/PlanCanvas";
import {
  isDrawingFile,
  assignLayerNames,
  hasNewLineOverlap,
  itemBounds,
  itemLength,
  formatFeetInches,
  newItem,
  moveItem,
  MAX_DRAWING_FILE_BYTES,
  MAX_DRAWING_ITEMS,
  MAX_TOTAL_FREEHAND_POINTS,
  rectangleAsLines,
  polygonAsLines,
  updateSelection,
  bindConnectorEndpoint,
  resolveConnectorAnchors,
} from "./model";
import { drawingAsPdf } from "./io/drawingPdf";
import type { DrawingFile, DrawingItem, DrawingTool, Point, PolygonTool } from "./model";
import {
  downloadFile,
  drawingAsSvg,
  safeFileName,
} from "./io/drawingFiles";

// Keep the original key so plans saved before the TRACE rename remain available.
const STORAGE_PREFIX = "sitesketch.drawing.v2";

const tools: Array<{
  id: DrawingTool;
  label: string;
  shortcut: string;
  icon: typeof MousePointer2;
}> = [
  { id: "select", label: "Select", shortcut: TOOL_SHORTCUTS.select, icon: MousePointer2 },
  { id: "wall", label: "Line", shortcut: TOOL_SHORTCUTS.wall, icon: MoveUpRight },
  { id: "dashed", label: "Dashed", shortcut: TOOL_SHORTCUTS.dashed, icon: MoveUpRight },
  { id: "dimension", label: "Dimension", shortcut: TOOL_SHORTCUTS.dimension, icon: Ruler },
  { id: "arrow", label: "Arrow", shortcut: TOOL_SHORTCUTS.arrow, icon: ArrowRight },
  { id: "note", label: "Note", shortcut: TOOL_SHORTCUTS.note, icon: Type },
  { id: "freehand", label: "Freehand", shortcut: TOOL_SHORTCUTS.freehand, icon: Pencil },
 ];

const shapeTools: Array<{ id: DrawingTool; label: string; shortcut: string; icon: typeof MousePointer2 }> = [
  { id: "rectangle", label: "Rectangle", shortcut: TOOL_SHORTCUTS.rectangle, icon: Square },
  { id: "circle", label: "Circle", shortcut: TOOL_SHORTCUTS.circle, icon: Circle },
  { id: "triangle", label: "Triangle", shortcut: TOOL_SHORTCUTS.triangle, icon: Triangle },
  { id: "diamond", label: "Diamond", shortcut: TOOL_SHORTCUTS.diamond, icon: Diamond },
  { id: "pentagon", label: "Pentagon", shortcut: TOOL_SHORTCUTS.pentagon, icon: Pentagon },
  { id: "hexagon", label: "Hexagon", shortcut: TOOL_SHORTCUTS.hexagon, icon: Hexagon },
  { id: "octagon", label: "Octagon", shortcut: TOOL_SHORTCUTS.octagon, icon: Octagon },
  { id: "star", label: "Star", shortcut: TOOL_SHORTCUTS.star, icon: Star },
];

type DrawingMode = "site" | "workflow";

function storageKey(mode: DrawingMode = "site") {
  const params = new URLSearchParams(location.search);
  const jobId = params.get("job_id") || params.get("jobId") || params.get("job.id");
  const base = mode === "workflow" ? `${STORAGE_PREFIX}.workflow` : STORAGE_PREFIX;
  return jobId ? `${base}.job-${encodeURIComponent(jobId)}` : base;
}

function readDrawing(mode: DrawingMode = "site"): DrawingFile {
  const raw = localStorage.getItem(storageKey(mode));
  if (!raw) {
    return { version: 1, name: mode === "workflow" ? "Untitled workflow" : "New construction plan", gridFeet: 1, items: [] };
  }

  if (raw.length > MAX_DRAWING_FILE_BYTES) {
    throw new Error("The saved plan is larger than the supported size.");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isDrawingFile(parsed)) {
    throw new Error("The saved plan has an unsupported or invalid format.");
  }
  return parsed;
}

function downloadSvg(file: DrawingFile, showOverallDimensions: boolean) {
  downloadFile(
    `${safeFileName(file.name)}.svg`,
    drawingAsSvg(file, showOverallDimensions),
    "image/svg+xml;charset=utf-8",
  );
}

function downloadPng(file: DrawingFile, showOverallDimensions: boolean, onError: (message: string) => void) {
  const svgUrl = URL.createObjectURL(
    new Blob([drawingAsSvg(file, showOverallDimensions)], { type: "image/svg+xml;charset=utf-8" }),
  );
  const image = new Image();

  image.onload = () => {
    if (!image.naturalWidth || !image.naturalHeight) {
      URL.revokeObjectURL(svgUrl);
      onError("The plan has invalid dimensions and could not be converted to PNG.");
      return;
    }

    const scale = Math.min(
      2,
      4096 / image.naturalWidth,
      4096 / image.naturalHeight,
      Math.sqrt(16_777_216 / (image.naturalWidth * image.naturalHeight)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      onError("This browser could not create the PNG export.");
      return;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(svgUrl);
      if (!blob) {
        console.error("The browser returned an empty PNG export.");
        onError("The browser could not finish the PNG export.");
        return;
      }
      downloadFile(`${safeFileName(file.name)}.png`, blob, "image/png");
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    console.error("The SVG drawing could not be rasterized for PNG export.");
    onError("The plan could not be converted to PNG.");
  };
  image.src = svgUrl;
}

function ToolButton({
  id,
  label,
  shortcut,
  icon: Icon,
  active,
  onClick,
}: {
  id: DrawingTool;
  label: string;
  shortcut: string;
  icon: typeof MousePointer2;
  active: boolean;
  onClick: (tool: DrawingTool) => void;
}) {
  return (
    <button
      className={`tool-button ${active ? "active" : ""}`}
      title={`${label} (${shortcut})`}
      aria-label={label}
      aria-pressed={active}
      onClick={() => onClick(id)}
    >
      <Icon size={19} strokeWidth={1.7} />
      <span>{label}</span>
    </button>
  );
}

function App() {
  const [initialMode] = useState<DrawingMode>(() => {
    try { return localStorage.getItem("trace.workspace") === "workflow" ? "workflow" : "site"; }
    catch { return "site"; }
  });
  const [initialDrawing] = useState(() => {
    try {
      return { file: readDrawing(initialMode), error: "" };
    } catch (error) {
      console.error("Could not read the saved plan.", error);
      return {
        file: { version: 1 as const, name: initialMode === "workflow" ? "Untitled workflow" : "New construction plan", gridFeet: 1, items: [] },
        error: "Could not read the saved plan. A new drawing is open.",
      };
    }
  });
  const [items, setItems] = useState(() => assignLayerNames(initialDrawing.file.items));
  const itemsRef = useRef(items);
  const autosaveAllowed = useRef(!initialDrawing.error);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const [projectName, setProjectName] = useState(initialDrawing.file.name);
  const [gridFeet, setGridFeet] = useState(initialDrawing.file.gridFeet);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [textEditRequest, setTextEditRequest] = useState<{ id: string; text: string; sequence: number } | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(initialMode);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("trace.theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 850);
  const [multiSelect, setMultiSelect] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [shapeMenu, setShapeMenu] = useState<{ left: number; top: number } | null>(null);
  const [gridSnap, setGridSnap] = useState(true);
  const [objectSnap, setObjectSnap] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showOverallDimensions, setShowOverallDimensions] = useState(false);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [spaceDown, setSpaceDown] = useState(false);
  const [saveMessage, setSaveMessage] = useState(
    initialDrawing.error || "All changes saved",
  );
  const [toast, setToast] = useState("");
  const [toastWarning, setToastWarning] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const undoStack = useRef<DrawingItem[][]>([]);
  const redoStack = useRef<DrawingItem[][]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const shapeButtonRef = useRef<HTMLButtonElement>(null);
  const coordinatesRef = useRef<HTMLSpanElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const selectedItem = selectedIds.length === 1 ? items.find((item) => item.id === selectedIds[0]) : undefined;
  const context = getJobContext();

  useEffect(() => {
    try { localStorage.setItem("trace.theme", theme); } catch { /* Appearance still works for this session. */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem("trace.workspace", drawingMode); } catch { /* Workspace still works for this session. */ }
  }, [drawingMode]);

  useEffect(() => {
    if (activeTool !== "select") setMultiSelect(false);
  }, [activeTool]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    if (!autosaveAllowed.current) return;
    const timer = window.setTimeout(() => {
      const file: DrawingFile = {
        version: 1,
        name: projectName.trim() || "Untitled plan",
        gridFeet,
        items,
      };
      try {
        localStorage.setItem(storageKey(drawingMode), JSON.stringify(file));
        setSaveMessage("All changes saved");
      } catch (error) {
        console.error("Could not save this plan in browser storage.", error);
        setSaveMessage("Browser storage is unavailable");
      }
    }, 350);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = undefined;
    };
  }, [gridFeet, items, projectName, drawingMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const editing = target instanceof HTMLElement &&
        target.matches("input, textarea, select, [contenteditable=true]");

      if (resetOpen) {
        if (event.key === "Escape") setResetOpen(false);
        return;
      }

      if (event.code === "Space" && !editing) {
        if (target instanceof HTMLElement && target.matches(":focus-visible") && target.closest("button, a, [role=button]")) return;
        event.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (editing) return;

      const selectedShape = drawingMode === "workflow" && activeTool === "select" && selectedIds.length === 1
        ? itemsRef.current.find((item) => item.id === selectedIds[0] && (item.kind === "rectangle" || item.kind === "circle"))
        : undefined;
      const startTyping = event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
      const editKey = (event.key === "F2" || event.key === "Enter") && !(target instanceof HTMLElement && target.closest("button, a, [role=button]"));
      if (selectedShape && (startTyping || editKey)) {
        event.preventDefault();
        setTextEditRequest((request) => ({ id: selectedShape.id, text: startTyping ? event.key : selectedShape.label ?? "", sequence: (request?.sequence ?? 0) + 1 }));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(itemsRef.current.map((item) => item.id));
        setActiveTool("select");
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected();
      } else if (event.key === "Escape") {
        setActiveTool("select");
        setExportOpen(false);
        setConnectOpen(false);
        setShapeMenu(null);
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === ACTION_SHORTCUTS.layers.toLowerCase()) toggleLayers();
        else if (key === ACTION_SHORTCUTS.guide.toLowerCase()) setGuideOpen((open) => !open);
        else if (key === ACTION_SHORTCUTS.fit.toLowerCase()) fitToPlan();
        else if (key === ACTION_SHORTCUTS.shapes.toLowerCase()) toggleShapeMenu();
        else if (key === ACTION_SHORTCUTS.export.toLowerCase()) setExportOpen((open) => !open);
        else if (key === ACTION_SHORTCUTS.zoomIn || key === "=") zoomBy(1.2);
        else if (key === ACTION_SHORTCUTS.zoomOut || key === "_") zoomBy(1 / 1.2);
        else {
          const tool = toolForKey(key);
          if (tool && !(drawingMode === "workflow" && tool === "dimension")) { setActiveTool(tool); setShapeMenu(null); }
        }
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpaceDown(false);
    }
    function releaseSpace() {
      setSpaceDown(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, [gridFeet, projectName, selectedIds, items, resetOpen, layersOpen, drawingMode, activeTool]);

  function switchDrawingMode(nextMode: DrawingMode) {
    if (nextMode === drawingMode) return;
    try {
      // Read before changing state; a damaged destination must not replace the open document.
      const next = readDrawing(nextMode);
      if (autosaveAllowed.current) localStorage.setItem(storageKey(drawingMode), JSON.stringify(currentFile()));
      if (autosaveTimerRef.current !== undefined) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
      undoStack.current = [];
      redoStack.current = [];
      const nextItems = assignLayerNames(next.items);
      itemsRef.current = nextItems;
      autosaveAllowed.current = true;
      setItems(nextItems);
      setProjectName(next.name);
      setGridFeet(next.gridFeet);
      setSelectedIds([]);
      setCamera(DEFAULT_CAMERA);
      setActiveTool("select");
      setTextEditRequest(null);
      setMultiSelect(false);
      setShapeMenu(null);
      setDrawingMode(nextMode);
      try { localStorage.setItem("trace.workspace", nextMode); } catch { /* Keep the workspace usable if this preference cannot be saved. */ }
      setSaveMessage("All changes saved");
      if (coordinatesRef.current) coordinatesRef.current.textContent = "X --  |  Y --";
    } catch (error) {
      console.error("Could not switch workspace", error);
      showToast("Could not switch workspaces. Your current work is still open.");
    }
  }

  function toggleLayers() {
    if (!layersOpen && window.innerWidth <= 850) setInspectorOpen(false);
    setLayersOpen(!layersOpen);
  }

  function toggleInspector() {
    if (!inspectorOpen && window.innerWidth <= 850) setLayersOpen(false);
    setInspectorOpen(!inspectorOpen);
  }

  function resetDrawing() {
    // Only the current job's browser-local drawing is removed; no undo state remains.
    try { clearSavedDrawing(localStorage, storageKey(drawingMode), undoStack.current, redoStack.current); }
    catch (error) { console.error("Could not reset the saved drawing.", error); showToast("Could not reset browser storage. Your drawing is still open."); setResetOpen(false); return; }
    // Cancel any pending write of the old drawing before replacing it.
    if (autosaveTimerRef.current !== undefined) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = undefined;
    autosaveAllowed.current = true;
    itemsRef.current = [];
    setItems([]);
    setSelectedIds([]);
    setProjectName(drawingMode === "workflow" ? "Untitled workflow" : "New construction plan");
    setGridFeet(1);
    setCamera(DEFAULT_CAMERA);
    setActiveTool("select");
    setMultiSelect(false);
    setResetOpen(false);
    setSaveMessage(drawingMode === "workflow" ? "Workflow reset" : "Drawing reset");
    showToast(`${drawingMode === "workflow" ? "Workflow" : "Drawing"} reset.`);
  }

  function toggleShapeMenu() {
    const rect = shapeButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setShapeMenu((current) => current ? null : { left: rect.right + 8, top: Math.max(8, Math.min(rect.top, window.innerHeight - 460)) });
  }

  function showToast(message: string, warning = false) {
    setToast(message);
    setToastWarning(warning);
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), warning ? 8000 : 2400);
  }

  function updateCoordinates(point: Point) {
    if (coordinatesRef.current) {
      const unit = drawingMode === "site" ? " ft" : "";
      coordinatesRef.current.textContent = `X ${point.x.toFixed(2)}${unit}  |  Y ${point.y.toFixed(2)}${unit}`;
    }
  }

  function commitItems(next: DrawingItem[]) {
    if (drawingMode === "workflow") next = resolveConnectorAnchors(next);
    next = assignLayerNames(next);
    const previous = itemsRef.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return false;
    if (drawingMode === "site" && hasNewLineOverlap(previous, next)) {
      showToast("A line already occupies that space. Connect to it or draw beside it.", true);
      return false;
    }
    if (!isDrawingFile({ version: 1, name: projectName.trim() || "Untitled plan", gridFeet, items: next })) {
      showToast(`This drawing reached its supported limit of ${MAX_DRAWING_ITEMS} items or ${MAX_TOTAL_FREEHAND_POINTS.toLocaleString()} freehand points.`);
      return false;
    }
    undoStack.current.push(previous);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    autosaveAllowed.current = true;
    itemsRef.current = next;
    setItems(next);
    return true;
  }

  function createItem(item: DrawingItem) {
    let workflowItem = { ...item, showDimension: drawingMode === "workflow" ? false : item.showDimension, ...(drawingMode === "workflow" && (item.kind === "rectangle" || item.kind === "circle") ? { fillColor: "#ffffff" } : {}) };
    if (drawingMode === "workflow" && item.kind === "arrow") {
      workflowItem = bindConnectorEndpoint(workflowItem, "start", { x: item.x, y: item.y }, itemsRef.current, 0.35);
      workflowItem = bindConnectorEndpoint(workflowItem, "end", { x: item.x2, y: item.y2 }, itemsRef.current, 0.35);
    }
    const created = item.kind === "rectangle" && drawingMode === "site" ? rectangleAsLines(item) : [workflowItem];
    if (!created.length) {
      showToast("Draw a rectangle with both width and height.");
      return false;
    }
    const next = [...itemsRef.current, ...created];
    if (!commitItems(next)) return false;
    if (drawingMode === "workflow" && (item.kind === "rectangle" || item.kind === "circle" || item.kind === "arrow")) setActiveTool("select");
    setSelectedIds(created.length === 1 ? [created[0].id] : []);
    return true;
  }

  function createPolygon(kind: PolygonTool, start: Point, end: Point) {
    const created = drawingMode === "workflow" && Math.abs(end.x - start.x) > 0.001 && Math.abs(end.y - start.y) > 0.001
      ? [{ ...newItem("rectangle", start, end), diagramShape: kind, showDimension: false, fillColor: "#ffffff" }]
      : drawingMode === "workflow" ? [] : polygonAsLines(kind, start, end);
    if (!created.length) { showToast("Draw a shape with both width and height."); return undefined; }
    if (!commitItems([...itemsRef.current, ...created])) return undefined;
    setSelectedIds(created.length === 1 ? [created[0].id] : []);
    if (drawingMode === "workflow") { setActiveTool("select"); return created[0]; }
    return undefined;
  }

  function updateItem(updated: DrawingItem) {
    const previous = itemsRef.current.find((item) => item.id === updated.id);
    if (drawingMode === "workflow" && updated.kind === "arrow" && previous && (updated.x !== previous.x || updated.y !== previous.y || updated.x2 !== previous.x2 || updated.y2 !== previous.y2)) {
      updated = { ...updated, startAnchor: undefined, endAnchor: undefined };
    }
    commitItems(itemsRef.current.map((item) => item.id === updated.id ? updated : item));
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    commitItems(itemsRef.current.filter((item) => !selectedIds.includes(item.id)));
    setSelectedIds([]);
  }

  function duplicateSelected() {
    const selected = itemsRef.current.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) return;
    for (const [dx, dy] of [[1, 2], [2, -1], [-1, -2], [-2, 1]]) {
      const ids = new Map(selected.map((item) => [item.id, newItem(item.kind, { x: item.x, y: item.y }, { x: item.x2, y: item.y2 }).id]));
      const copies = selected.map((item) => ({
        ...moveItem(item, dx * gridFeet, dy * gridFeet),
        layerName: undefined,
        id: ids.get(item.id)!,
        startAnchor: item.startAnchor && ids.has(item.startAnchor.shapeId) ? { ...item.startAnchor, shapeId: ids.get(item.startAnchor.shapeId)! } : undefined,
        endAnchor: item.endAnchor && ids.has(item.endAnchor.shapeId) ? { ...item.endAnchor, shapeId: ids.get(item.endAnchor.shapeId)! } : undefined,
      }));
      const next = [...itemsRef.current, ...copies];
      if (drawingMode === "site" && hasNewLineOverlap(itemsRef.current, next)) continue;
      if (commitItems(next)) { setSelectedIds(copies.map((item) => item.id)); setActiveTool("select"); }
      return;
    }
    showToast("Couldn't find a clear position for the copy.");
  }

  function moveLayer(direction: -1 | 1) {
    if (selectedIds.length !== 1) return;
    const next = [...itemsRef.current];
    const index = next.findIndex((item) => item.id === selectedIds[0]);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commitItems(next);
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(itemsRef.current);
    itemsRef.current = previous;
    setItems(previous);
    setSelectedIds([]);
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    setSelectedIds([]);
  }

  function currentFile(): DrawingFile {
    return {
      version: 1,
      name: projectName.trim() || "Untitled plan",
      gridFeet,
      items: itemsRef.current,
    };
  }

  function saveNow() {
    autosaveAllowed.current = true;
    try {
      localStorage.setItem(storageKey(drawingMode), JSON.stringify(currentFile()));
      setSaveMessage(drawingMode === "workflow" ? "Workflow saved" : "Drawing saved");
      showToast(`${drawingMode === "workflow" ? "Workflow" : "Drawing"} saved in this browser.`);
    } catch (error) {
      console.error("Could not save this plan in browser storage.", error);
      setSaveMessage("Browser storage is unavailable");
      showToast("Could not save the drawing.");
    }
  }

  function fitToPlan() {
    if (!items.length) {
      setCamera(DEFAULT_CAMERA);
      return;
    }
    const bounds = items.map((item) => { const b = itemBounds(item); return { minX: b.left, maxX: b.right, minY: b.top, maxY: b.bottom }; });
    const minX = Math.min(...bounds.map((bound) => bound.minX));
    const maxX = Math.max(...bounds.map((bound) => bound.maxX));
    const minY = Math.min(...bounds.map((bound) => bound.minY));
    const maxY = Math.max(...bounds.map((bound) => bound.maxY));
    const host = document.querySelector(".plan-canvas");
    if (!host) return;

    const padding = 3;
    const planWidth = Math.max(maxX - minX + padding * 2, 1);
    const planHeight = Math.max(maxY - minY + padding * 2, 1);
    const zoom = Math.max(
      0.12,
      Math.min(
        4,
        (host.clientWidth - 60) / (planWidth * 40),
        (host.clientHeight - 60) / (planHeight * 40),
      ),
    );
    setCamera({
      zoom,
      x: host.clientWidth / 2 - ((minX + maxX) / 2) * 40 * zoom,
      y: host.clientHeight / 2 - ((minY + maxY) / 2) * 40 * zoom,
    });
  }

  function drawingForExport(): DrawingFile {
    return { ...currentFile(), name: projectName.trim() || "Untitled plan" };
  }

  function handleExport(kind: "svg" | "png" | "json" | "pdf") {
    const original = drawingForExport();
    const file = drawingMode === "workflow" && kind !== "json" ? { ...original, items: original.items.map((item) => ({ ...item, showDimension: false })) } : original;
    const exportOverallDimensions = drawingMode === "site" && showOverallDimensions;
    if (kind === "svg") downloadSvg(file, exportOverallDimensions);
    else if (kind === "png") downloadPng(file, exportOverallDimensions, showToast);
    else if (kind === "pdf") {
      void drawingAsPdf(file, exportOverallDimensions).then((pdf) => downloadFile(`${safeFileName(file.name)}.pdf`, pdf, "application/pdf")).catch((error: unknown) => {
        console.error("PDF export failed", error);
        showToast("Could not export the PDF.");
      });
    } else {
      downloadFile(
        `${safeFileName(file.name)}.json`,
        JSON.stringify(file, null, 2),
        "application/json",
      );
    }
    setExportOpen(false);
  }

  async function importDrawing(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_DRAWING_FILE_BYTES) {
        throw new Error("Drawing files must be 10 MB or smaller.");
      }
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDrawingFile(parsed)) {
        throw new Error("This file is not a supported TRACE drawing.");
      }
      undoStack.current = [];
      redoStack.current = [];
      const namedItems = assignLayerNames(parsed.items);
      itemsRef.current = namedItems;
      setItems(namedItems);
      setProjectName(parsed.name);
      setGridFeet(parsed.gridFeet);
      autosaveAllowed.current = true;
      setSelectedIds([]);
      setCamera(DEFAULT_CAMERA);
      showToast("Drawing imported.");
    } catch (error) {
      console.error("Could not import the selected drawing.", error);
      showToast(error instanceof Error ? error.message : "Could not import this file.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function zoomBy(factor: number) {
    setCamera((current) => ({
      ...current,
      zoom: Math.max(0.12, Math.min(4, current.zoom * factor)),
    }));
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar" inert={resetOpen || undefined}>
        <a className="brand" href="#" aria-label={drawingMode === "workflow" ? "TRACE Workflow" : "TRACE Site Drawings"}>
          <span className="brand-mark"><img src={logo} alt="" /></span>
          <span className="brand-copy">
            <strong>TRACE</strong>
            <small>{drawingMode === "workflow" ? "WORKFLOW" : "SITE DRAWINGS"}</small>
          </span>
        </a>
        <div className="project-title">
          <span className="eyebrow">{drawingMode === "workflow" ? "WORKFLOW" : "DRAWING"}</span>
          <input
            aria-label={drawingMode === "workflow" ? "Workflow name" : "Drawing name"}
            value={projectName}
            maxLength={80}
            onChange={(event) => {
              autosaveAllowed.current = true;
              setProjectName(event.target.value);
            }}
          />
          {context && <span className="job-context" title={context}>{context}</span>}
        </div>
        <div className="top-actions">
          <button className="icon-button theme-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={!undoStack.current.length}>
            <Undo2 size={18} />
          </button>
          <button className="icon-button" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo} disabled={!redoStack.current.length}>
            <Redo2 size={18} />
          </button>
          <span className="top-divider" />
          <div className="export-wrap">
            <button className="button button-outline" title="Toggle Export (E)" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>
              <Download size={16} /> Export <span className="chevron">▾</span>
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => handleExport("svg")}><FileImage size={15} /> Download SVG</button>
                <button onClick={() => handleExport("png")}><FileImage size={15} /> Download PNG</button>
                <button onClick={() => handleExport("pdf")}><FileText size={15} /> Download PDF</button>
                <button onClick={() => handleExport("json")}><FileJson size={15} /> {drawingMode === "workflow" ? "Workflow data" : "Drawing data"}</button>
                <button onClick={() => { setExportOpen(false); importRef.current?.click(); }}><Upload size={15} /> {drawingMode === "workflow" ? "Import workflow" : "Import drawing"}</button>
              </div>
            )}
          </div>
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void importDrawing(event.target.files?.[0])}
          />
          <button className="button button-primary" onClick={saveNow} aria-label={drawingMode === "workflow" ? "Save workflow" : "Save drawing"}>
            <Save size={16} /> {drawingMode === "workflow" ? "Save workflow" : "Save drawing"}
          </button>
          <button className="button button-outline reset-trigger" onClick={() => { setExportOpen(false); setResetOpen(true); }} aria-label={drawingMode === "workflow" ? "Reset workflow" : "Reset drawing"} title={drawingMode === "workflow" ? "Reset workflow" : "Reset drawing"}><RotateCcw size={16} /> Reset</button>
        </div>
      </header>

      <div className="workspace" inert={resetOpen || undefined}>
        <aside className="tool-rail" aria-label={drawingMode === "workflow" ? "Workflow tools" : "Drawing tools"}>
          <span className="tool-caption">TOOLS</span>
          <div className="tool-group">
            {tools.filter((tool) => drawingMode === "site" || ["select", "arrow", "note", "wall", "dashed", "freehand"].includes(tool.id)).map((tool) => <span className="tool-slot" key={tool.id}>
              <ToolButton {...tool} label={drawingMode === "workflow" && tool.id === "arrow" ? "Connector" : tool.label} active={activeTool === tool.id} onClick={(id) => { setActiveTool(id); setShapeMenu(null); }} />
              {tool.id === "dashed" && <>
                <button className={`tool-button shapes-toggle ${shapeTools.some((shape) => shape.id === activeTool) ? "active" : ""}`} ref={shapeButtonRef} aria-label="Shapes" aria-expanded={Boolean(shapeMenu)} aria-haspopup="true" title="Shapes (B)" onClick={toggleShapeMenu}><Shapes size={19} strokeWidth={1.7} /><span>Shapes</span></button>
                {shapeMenu && <div className="shapes-menu" style={{ left: shapeMenu.left, top: shapeMenu.top }} role="group" aria-label="Choose a shape">
                  <div className="shapes-heading">SHAPES <button aria-label="Close shapes" onClick={() => setShapeMenu(null)}><X size={15} /></button></div>
                  {shapeTools.map(({ id, label, shortcut, icon: Icon }) => <button key={id} className={`shape-option ${activeTool === id ? "selected" : ""}`} aria-pressed={activeTool === id} onClick={() => { setActiveTool(id); setShapeMenu(null); }}><Icon size={17} /><span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>)}
                </div>}
              </>}
            </span>)}
          </div>
          <button className={`tool-button layers-toggle ${layersOpen ? "active" : ""}`} aria-pressed={layersOpen} title="Toggle layers (Y)" onClick={toggleLayers}><Layers size={19} strokeWidth={1.7} /><span>Layers</span></button>
          <button className={`tool-button panel-toggle ${inspectorOpen ? "active" : ""}`} aria-pressed={inspectorOpen} title="Toggle properties" onClick={toggleInspector}><PanelRight size={19} strokeWidth={1.7} /><span>Properties</span></button>
          <div className="rail-bottom" hidden>
            <button
              className="tool-button help-tool"
              title="One Click Contractors setup"
              aria-label="One Click Contractors setup"
              onClick={() => setConnectOpen(true)}
            >
              <CircleHelp size={18} />
              <span>Connect</span>
            </button>
          </div>
        </aside>

        {layersOpen && <aside className="layers-panel" aria-label="Drawing layers">
          <div className="layers-heading"><div><span className="eyebrow">{drawingMode === "workflow" ? "YOUR WORKFLOW" : "YOUR PLAN"}</span><h2>Layers <span>{items.length}</span></h2></div><button className="layers-close" aria-label="Close layers" onClick={() => setLayersOpen(false)}><X size={17} /></button></div>
          <div className="layers-actions" aria-label="Layer actions">
            <button title="Move layer forward" aria-label="Move layer forward" disabled={selectedIds.length !== 1 || items.findIndex((item) => item.id === selectedIds[0]) === items.length - 1} onClick={() => moveLayer(1)}><ChevronUp size={16} /></button>
            <button title="Move layer backward" aria-label="Move layer backward" disabled={selectedIds.length !== 1 || items.findIndex((item) => item.id === selectedIds[0]) <= 0} onClick={() => moveLayer(-1)}><ChevronDown size={16} /></button>
            <button title="Duplicate selection (Ctrl+D)" aria-label="Duplicate selection" disabled={!selectedIds.length} onClick={duplicateSelected}><Copy size={15} /></button>
            <button title="Delete selection" aria-label="Delete selection" disabled={!selectedIds.length} onClick={deleteSelected}><Trash2 size={15} /></button>
          </div>
          <div className="layers-list">{items.length === 0 ? <p className="layers-empty">Draw a line or shape and it will appear here.</p> : [...items].reverse().map((item) => {
            const detail = drawingMode === "workflow" ? (item.label || "") : item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension" ? formatFeetInches(itemLength(item)) : item.kind === "note" ? (item.label || "Note") : "";
            return <button key={item.id} className={`layer-row ${selectedIds.includes(item.id) ? "selected" : ""}`} aria-pressed={selectedIds.includes(item.id)} onClick={(event) => { setSelectedIds((current) => updateSelection(current, item.id, event.ctrlKey || event.metaKey || multiSelect)); setActiveTool("select"); }}><span className="layer-swatch" style={{ backgroundColor: item.color }} /><span className="layer-copy"><strong>{item.layerName}</strong><small>{detail || "Drawing element"}</small></span></button>;
          })}</div>
          <p className="layers-footer">Select a layer to edit. Use Multi-select to select more.</p>
        </aside>}

        <main className="drawing-area">
          <div className="canvas-toolbar">
            <div className="breadcrumb">
              <div className="drawing-mode" role="group" aria-label="Drawing mode">
                <button className={drawingMode === "site" ? "active" : ""} aria-pressed={drawingMode === "site"} onClick={() => switchDrawingMode("site")}>Site sketch</button>
                <button className={drawingMode === "workflow" ? "active" : ""} aria-pressed={drawingMode === "workflow"} onClick={() => switchDrawingMode("workflow")}>Workflow</button>
              </div>
            </div>
            <div className="canvas-actions">
              <button className={`canvas-action-button ${multiSelect ? "active" : ""}`} aria-pressed={multiSelect} title="Select multiple items" onClick={() => { setActiveTool("select"); setMultiSelect((active) => !active); }}><CheckSquare2 size={16} /><span>Multi-select</span></button>
              <button className="canvas-action-button" aria-label="Select all items" title="Select all items" disabled={!items.length} onClick={() => { setSelectedIds(itemsRef.current.map((item) => item.id)); setActiveTool("select"); setMultiSelect(true); }}><ListChecks size={16} /></button>
              <button className="canvas-action-button" aria-label="Duplicate selected items" title="Duplicate selected items" disabled={!selectedIds.length} onClick={duplicateSelected}><Copy size={16} /></button>
              <button className="canvas-action-button" aria-label="Delete selected items" title="Delete selected items" disabled={!selectedIds.length} onClick={deleteSelected}><Trash2 size={16} /></button>
              <span className="action-divider" />
              <label className="toggle-control">
                <input type="checkbox" checked={gridSnap} onChange={(event) => setGridSnap(event.target.checked)} />
                <span className="toggle-track" /><span>Grid snap</span>
              </label>
              <span className="action-divider" />
              <label className="toggle-control">
                <input type="checkbox" checked={objectSnap} onChange={(event) => setObjectSnap(event.target.checked)} />
                <span className="toggle-track" /><span>Object snap</span>
              </label>
              <span className="action-divider" />
              {drawingMode === "site" && <label className="toggle-control">
                <input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} />
                <span className="toggle-track" /><span>Dimensions</span>
              </label>}
              {drawingMode === "site" && <span className="action-divider" />}
              {drawingMode === "site" && <label className="toggle-control">
                <input type="checkbox" checked={showOverallDimensions} onChange={(event) => setShowOverallDimensions(event.target.checked)} />
                <span className="toggle-track" /><span>Overall dimensions</span>
              </label>}
              <span className="action-divider" />
              <button className="zoom-button" title="Zoom out (-)" onClick={() => zoomBy(1 / 1.2)}><Minus size={14} /></button>
              <span className="zoom-level">{Math.round(camera.zoom * 100)}%</span>
              <button className="zoom-button" title="Zoom in (+)" onClick={() => zoomBy(1.2)}><Plus size={14} /></button>
              <button className="fit-button" title={drawingMode === "workflow" ? "Fit workflow to page (0)" : "Fit drawing to page (0)"} onClick={fitToPlan}><Grid2X2 size={15} /></button>
            </div>
          </div>

          <PlanCanvas
            key={drawingMode}
            items={items}
            theme={theme}
            selectedIds={selectedIds}
            activeTool={activeTool}
            multiSelect={multiSelect}
            gridFeet={gridFeet}
            gridSnap={gridSnap}
            objectSnap={objectSnap}
            workflowMode={drawingMode === "workflow"}
            textEditRequest={textEditRequest}
            showDimensions={drawingMode === "site" && showDimensions}
            showOverallDimensions={drawingMode === "site" && showOverallDimensions}
            spaceDown={spaceDown}
            camera={camera}
            onCameraChange={setCamera}
            onCreate={createItem}
            onCreatePolygon={createPolygon}
            onSelect={(id, additive = false) => setSelectedIds((current) => updateSelection(current, id, additive || (multiSelect && id !== null)))}
            onBoxSelect={(ids, additive) => setSelectedIds((current) => additive ? [...new Set([...current, ...ids])] : ids)}
            onUpdate={updateItem}
            onUpdateItems={commitItems}
            onCursorMove={updateCoordinates}
          />

          <footer className="statusbar">
            <span className="status-indicator"><i />{saveMessage}</span>
            <span className="status-coordinates" ref={coordinatesRef}>X —  ·  Y —</span>
            <span className="status-help">Hold <kbd>Space</kbd> and drag to pan <span className="status-dot">·</span> Scroll to zoom</span>
            <span className="status-copyright">© 2026 Ryan Horan</span>
          </footer>
        </main>

        {inspectorOpen && <Inspector
          onClose={() => setInspectorOpen(false)}
          guideOpen={guideOpen}
          onToggleGuide={() => setGuideOpen((open) => !open)}
          item={selectedItem}
          selectedCount={selectedIds.length}
          gridFeet={gridFeet}
          showGridSpacing={drawingMode === "site"}
          onGridFeetChange={(value) => {
            autosaveAllowed.current = true;
            setGridFeet(value);
          }}
          onUpdate={updateItem}
          onDelete={deleteSelected}
        />}
      </div>

      {resetOpen && <div className="dialog-backdrop">
        <section className="connect-dialog reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description">
          <span className="dialog-kicker">{drawingMode === "workflow" ? "RESET WORKFLOW" : "RESET DRAWING"}</span>
          <h2 id="reset-title">Reset this {drawingMode === "workflow" ? "workflow" : "drawing"}?</h2>
          <p id="reset-description">This permanently clears this {drawingMode === "workflow" ? "workflow" : "drawing"} and its undo history. You cannot undo the reset. Export its data first if you want a backup.</p>
          <div className="reset-actions"><button className="button reset-cancel" autoFocus onClick={() => setResetOpen(false)}>Cancel</button><button className="button reset-confirm" onClick={resetDrawing}>{drawingMode === "workflow" ? "Reset workflow" : "Reset drawing"}</button></div>
        </section>
      </div>}

      {connectOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConnectOpen(false);
        }}>
          <section className="connect-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title">
            <button className="dialog-close" aria-label="Close" onClick={() => setConnectOpen(false)}><X size={18} /></button>
            <span className="dialog-kicker">ONE CLICK CONTRACTORS</span>
            <h2 id="connect-title">Add TRACE as a design tool</h2>
            <p>Deploy this app to a public HTTPS address, then add that address under <b>Configuration → Tools → Design Tools</b>.</p>
            <ol>
              <li>Choose <b>Add</b> and name the tool “TRACE”.</li>
              <li>Paste the deployed app URL and save it.</li>
              <li>Open it from a customer’s Design Tools page.</li>
            </ol>
            <div className="dialog-note">
              The app uses an opaque <code>job_id</code> only to separate browser-local plans. Customer names and email query parameters are discarded; do not put personal information or credentials in the URL. This app does not connect to a private One Click API or save records back to One Click.
            </div>
            <button className="button button-primary" onClick={() => setConnectOpen(false)}>Got it</button>
          </section>
        </div>
      )}

      {toast && (toastWarning ? (
        <div className="toast toast-warning" role="alert">
          <span aria-hidden="true" className="toast-warning-icon">!</span>
          <div><strong>Overlapping line</strong><span>{toast}</span></div>
          <button type="button" aria-label="Dismiss warning" onClick={() => setToast("")}>×</button>
        </div>
      ) : <div className="toast" role="status" aria-live="polite">{toast}</div>)}
    </div>
  );
}

function getJobContext() {
  const params = new URLSearchParams(location.search);
  const jobId = params.get("job_id") || params.get("jobId") || params.get("job.id");
  return jobId ? `Job ${jobId}` : "";
}

export default App;
