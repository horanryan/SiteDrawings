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
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
  { id: "wall", label: "Line", shortcut: "L", icon: MoveUpRight },
  { id: "dashed", label: "Dashed", shortcut: "D", icon: MoveUpRight },
  { id: "dimension", label: "Dimension", shortcut: "M", icon: Ruler },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: ArrowRight },
  { id: "note", label: "Note", shortcut: "N", icon: Type },
  { id: "freehand", label: "Freehand", shortcut: "F", icon: Pencil },
 ];

const shapeTools: Array<{ id: DrawingTool; label: string; shortcut: string; icon: typeof MousePointer2 }> = [
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "circle", label: "Circle", shortcut: "C", icon: Circle },
  { id: "triangle", label: "Triangle", shortcut: "", icon: Triangle },
  { id: "diamond", label: "Diamond", shortcut: "", icon: Diamond },
  { id: "pentagon", label: "Pentagon", shortcut: "", icon: Pentagon },
  { id: "hexagon", label: "Hexagon", shortcut: "", icon: Hexagon },
  { id: "octagon", label: "Octagon", shortcut: "", icon: Octagon },
  { id: "star", label: "Star", shortcut: "", icon: Star },
];

function storageKey() {
  const params = new URLSearchParams(location.search);
  const jobId = params.get("job_id") || params.get("jobId") || params.get("job.id");
  return jobId
    ? `${STORAGE_PREFIX}.job-${encodeURIComponent(jobId)}`
    : STORAGE_PREFIX;
}

function readDrawing(): DrawingFile {
  const raw = localStorage.getItem(storageKey());
  if (!raw) {
    return { version: 1, name: "New construction plan", gridFeet: 1, items: [] };
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
  const [initialDrawing] = useState(() => {
    try {
      return { file: readDrawing(), error: "" };
    } catch (error) {
      console.error("Could not read the saved plan.", error);
      return {
        file: { version: 1 as const, name: "New construction plan", gridFeet: 1, items: [] },
        error: "Could not read the saved plan. A new drawing is open.",
      };
    }
  });
  const [items, setItems] = useState(() => assignLayerNames(initialDrawing.file.items));
  const itemsRef = useRef(items);
  const autosaveAllowed = useRef(!initialDrawing.error);
  const [projectName, setProjectName] = useState(initialDrawing.file.name);
  const [gridFeet, setGridFeet] = useState(initialDrawing.file.gridFeet);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("trace.theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const [layersOpen, setLayersOpen] = useState(true);
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
  const [exportOpen, setExportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const undoStack = useRef<DrawingItem[][]>([]);
  const redoStack = useRef<DrawingItem[][]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const coordinatesRef = useRef<HTMLSpanElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const selectedItem = selectedIds.length === 1 ? items.find((item) => item.id === selectedIds[0]) : undefined;
  const context = getJobContext();

  useEffect(() => {
    try { localStorage.setItem("trace.theme", theme); } catch { /* Appearance still works for this session. */ }
  }, [theme]);

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
        localStorage.setItem(storageKey(), JSON.stringify(file));
        setSaveMessage("All changes saved");
      } catch (error) {
        console.error("Could not save this plan in browser storage.", error);
        setSaveMessage("Browser storage is unavailable");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [gridFeet, items, projectName]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const editing = target instanceof HTMLElement &&
        target.matches("input, textarea, select, [contenteditable=true]");

      if (event.code === "Space" && !editing) {
        event.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (editing) return;

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
      } else {
        const tool = [...tools, ...shapeTools].find(
          (entry) => entry.shortcut.toLowerCase() === event.key.toLowerCase(),
        );
        if (tool) { setActiveTool(tool.id); setShapeMenu(null); }
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
  }, [gridFeet, projectName, selectedIds]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }

  function updateCoordinates(point: Point) {
    if (coordinatesRef.current) {
      coordinatesRef.current.textContent =
        `X ${point.x.toFixed(2)} ft  ·  Y ${point.y.toFixed(2)} ft`;
    }
  }

  function commitItems(next: DrawingItem[]) {
    next = assignLayerNames(next);
    const previous = itemsRef.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return false;
    if (hasNewLineOverlap(previous, next)) {
      showToast("A line already occupies that space. Connect to it or draw beside it.");
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
    const created = item.kind === "rectangle" ? rectangleAsLines(item) : [item];
    if (!created.length) {
      showToast("Draw a rectangle with both width and height.");
      return;
    }
    const next = [...itemsRef.current, ...created];
    if (!commitItems(next)) return;
    setSelectedIds(created.length === 1 ? [created[0].id] : []);
  }

  function createPolygon(kind: PolygonTool, start: Point, end: Point) {
    const created = polygonAsLines(kind, start, end);
    if (!created.length) { showToast("Draw a shape with both width and height."); return; }
    if (commitItems([...itemsRef.current, ...created])) setSelectedIds([]);
  }

  function updateItem(updated: DrawingItem) {
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
      const copies = selected.map((item) => ({
        ...moveItem(item, dx * gridFeet, dy * gridFeet),
        layerName: undefined,
        id: newItem(item.kind, { x: item.x, y: item.y }, { x: item.x2, y: item.y2 }).id,
      }));
      const next = [...itemsRef.current, ...copies];
      if (hasNewLineOverlap(itemsRef.current, next)) continue;
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
      localStorage.setItem(storageKey(), JSON.stringify(currentFile()));
      setSaveMessage("Drawing saved");
      showToast("Drawing saved in this browser.");
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
    const file = drawingForExport();
    if (kind === "svg") downloadSvg(file, showOverallDimensions);
    else if (kind === "png") downloadPng(file, showOverallDimensions, showToast);
    else if (kind === "pdf") {
      void drawingAsPdf(file, showOverallDimensions).then((pdf) => downloadFile(`${safeFileName(file.name)}.pdf`, pdf, "application/pdf")).catch((error: unknown) => {
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
      <header className="topbar">
        <a className="brand" href="#" aria-label="TRACE Site Drawings">
          <span className="brand-mark"><img src={logo} alt="" /></span>
          <span className="brand-copy">
            <strong>TRACE</strong>
            <small>SITE DRAWINGS</small>
          </span>
        </a>
        <div className="project-title">
          <span className="eyebrow">DRAWING</span>
          <input
            aria-label="Drawing name"
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
            <button className="button button-outline" onClick={() => setExportOpen(!exportOpen)}>
              <Download size={16} /> Export <span className="chevron">▾</span>
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => handleExport("svg")}><FileImage size={15} /> Download SVG</button>
                <button onClick={() => handleExport("png")}><FileImage size={15} /> Download PNG</button>
                <button onClick={() => handleExport("pdf")}><FileText size={15} /> Download PDF</button>
                <button onClick={() => handleExport("json")}><FileJson size={15} /> Drawing data</button>
                <button onClick={() => { setExportOpen(false); importRef.current?.click(); }}><Upload size={15} /> Import drawing</button>
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
          <button className="button button-primary" onClick={saveNow}>
            <Save size={16} /> Save drawing
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="tool-rail" aria-label="Drawing tools">
          <span className="tool-caption">TOOLS</span>
          <div className="tool-group">
            {tools.map((tool) => <span className="tool-slot" key={tool.id}>
              <ToolButton {...tool} active={activeTool === tool.id} onClick={(id) => { setActiveTool(id); setShapeMenu(null); }} />
              {tool.id === "dashed" && <>
                <button className={`tool-button shapes-toggle ${shapeTools.some((shape) => shape.id === activeTool) ? "active" : ""}`} aria-label="Shapes" aria-expanded={Boolean(shapeMenu)} aria-haspopup="true" title="Shapes" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setShapeMenu(shapeMenu ? null : { left: rect.right + 8, top: Math.max(8, Math.min(rect.top, window.innerHeight - 460)) }); }}><Shapes size={19} strokeWidth={1.7} /><span>Shapes</span></button>
                {shapeMenu && <div className="shapes-menu" style={{ left: shapeMenu.left, top: shapeMenu.top }} role="group" aria-label="Choose a shape">
                  <div className="shapes-heading">SHAPES <button aria-label="Close shapes" onClick={() => setShapeMenu(null)}><X size={15} /></button></div>
                  {shapeTools.map(({ id, label, shortcut, icon: Icon }) => <button key={id} className={`shape-option ${activeTool === id ? "selected" : ""}`} aria-pressed={activeTool === id} onClick={() => { setActiveTool(id); setShapeMenu(null); }}><Icon size={17} /><span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>)}
                </div>}
              </>}
            </span>)}
          </div>
          <button className={`tool-button layers-toggle ${layersOpen ? "active" : ""}`} aria-pressed={layersOpen} title="Toggle layers" onClick={() => setLayersOpen(!layersOpen)}><Layers size={19} strokeWidth={1.7} /><span>Layers</span></button>
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
          <div className="layers-heading"><div><span className="eyebrow">YOUR PLAN</span><h2>Layers <span>{items.length}</span></h2></div><button className="layers-close" aria-label="Close layers" onClick={() => setLayersOpen(false)}><X size={17} /></button></div>
          <div className="layers-actions" aria-label="Layer actions">
            <button title="Move layer forward" aria-label="Move layer forward" disabled={selectedIds.length !== 1 || items.findIndex((item) => item.id === selectedIds[0]) === items.length - 1} onClick={() => moveLayer(1)}><ChevronUp size={16} /></button>
            <button title="Move layer backward" aria-label="Move layer backward" disabled={selectedIds.length !== 1 || items.findIndex((item) => item.id === selectedIds[0]) <= 0} onClick={() => moveLayer(-1)}><ChevronDown size={16} /></button>
            <button title="Duplicate selection (Ctrl+D)" aria-label="Duplicate selection" disabled={!selectedIds.length} onClick={duplicateSelected}><Copy size={15} /></button>
            <button title="Delete selection" aria-label="Delete selection" disabled={!selectedIds.length} onClick={deleteSelected}><Trash2 size={15} /></button>
          </div>
          <div className="layers-list">{items.length === 0 ? <p className="layers-empty">Draw a line or shape and it will appear here.</p> : [...items].reverse().map((item) => {
            const detail = item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension" ? formatFeetInches(itemLength(item)) : item.kind === "note" ? (item.label || "Note") : "";
            return <button key={item.id} className={`layer-row ${selectedIds.includes(item.id) ? "selected" : ""}`} aria-pressed={selectedIds.includes(item.id)} onClick={(event) => { setSelectedIds((current) => updateSelection(current, item.id, event.ctrlKey || event.metaKey)); setActiveTool("select"); }}><span className="layer-swatch" style={{ backgroundColor: item.color }} /><span className="layer-copy"><strong>{item.layerName}</strong><small>{detail || "Drawing element"}</small></span></button>;
          })}</div>
          <p className="layers-footer">Select a layer to edit. Ctrl-click to select more.</p>
        </aside>}

        <main className="drawing-area">
          <div className="canvas-toolbar">
            <div className="breadcrumb">
              <span>Workspace</span><span className="crumb-separator">/</span><strong>Plan editor</strong>
            </div>
            <div className="canvas-actions">
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
              <label className="toggle-control">
                <input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} />
                <span className="toggle-track" /><span>Dimensions</span>
              </label>
              <span className="action-divider" />
              <label className="toggle-control">
                <input type="checkbox" checked={showOverallDimensions} onChange={(event) => setShowOverallDimensions(event.target.checked)} />
                <span className="toggle-track" /><span>Overall dimensions</span>
              </label>
              <span className="action-divider" />
              <button className="zoom-button" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}><Minus size={14} /></button>
              <span className="zoom-level">{Math.round(camera.zoom * 100)}%</span>
              <button className="zoom-button" title="Zoom in" onClick={() => zoomBy(1.2)}><Plus size={14} /></button>
              <button className="fit-button" title="Fit drawing to page" onClick={fitToPlan}><Grid2X2 size={15} /></button>
            </div>
          </div>

          <PlanCanvas
            items={items}
            theme={theme}
            selectedIds={selectedIds}
            activeTool={activeTool}
            gridFeet={gridFeet}
            gridSnap={gridSnap}
            objectSnap={objectSnap}
            showDimensions={showDimensions}
            showOverallDimensions={showOverallDimensions}
            spaceDown={spaceDown}
            camera={camera}
            onCameraChange={setCamera}
            onCreate={createItem}
            onCreatePolygon={createPolygon}
            onChooseTool={setActiveTool}
            onSelect={(id, additive = false) => setSelectedIds((current) => updateSelection(current, id, additive))}
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

        <Inspector
          item={selectedItem}
          selectedCount={selectedIds.length}
          gridFeet={gridFeet}
          onGridFeetChange={(value) => {
            autosaveAllowed.current = true;
            setGridFeet(value);
          }}
          onUpdate={updateItem}
          onDelete={deleteSelected}
        />
      </div>

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

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

function getJobContext() {
  const params = new URLSearchParams(location.search);
  const jobId = params.get("job_id") || params.get("jobId") || params.get("job.id");
  return jobId ? `Job ${jobId}` : "";
}

export default App;
