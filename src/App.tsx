import { useEffect, useRef, useState } from "react";
import {
  CircleHelp,
  Circle,
  Download,
  FileImage,
  FileJson,
  Grid2X2,
  Minus,
  MousePointer2,
  MoveUpRight,
  Plus,
  Redo2,
  Ruler,
  Save,
  Shapes,
  Square,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import Inspector from "./components/Inspector";
import PlanCanvas, { DEFAULT_CAMERA } from "./components/PlanCanvas";
import { isDrawingFile } from "./model";
import type { DrawingFile, DrawingItem, DrawingTool, Point } from "./model";
import {
  downloadFile,
  drawingAsSvg,
  safeFileName,
} from "./io/drawingFiles";

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
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "circle", label: "Circle", shortcut: "C", icon: Circle },
  { id: "dimension", label: "Dimension", shortcut: "M", icon: Ruler },
  { id: "note", label: "Note", shortcut: "N", icon: Type },
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

  const parsed: unknown = JSON.parse(raw);
  if (!isDrawingFile(parsed)) {
    throw new Error("The saved plan has an unsupported or invalid format.");
  }
  return parsed;
}

function downloadSvg(file: DrawingFile) {
  downloadFile(
    `${safeFileName(file.name)}.svg`,
    drawingAsSvg(file),
    "image/svg+xml;charset=utf-8",
  );
}

function downloadPng(file: DrawingFile, onError: (message: string) => void) {
  const svgUrl = URL.createObjectURL(
    new Blob([drawingAsSvg(file)], { type: "image/svg+xml;charset=utf-8" }),
  );
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
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
  const [items, setItems] = useState(initialDrawing.file.items);
  const itemsRef = useRef(items);
  const autosaveAllowed = useRef(!initialDrawing.error);
  const [projectName, setProjectName] = useState(initialDrawing.file.name);
  const [gridFeet, setGridFeet] = useState(initialDrawing.file.gridFeet);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [gridSnap, setGridSnap] = useState(true);
  const [objectSnap, setObjectSnap] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
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

  const selectedItem = items.find((item) => item.id === selectedId);
  const context = getJobContext();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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
      } else {
        const tool = tools.find(
          (entry) => entry.shortcut.toLowerCase() === event.key.toLowerCase(),
        );
        if (tool) setActiveTool(tool.id);
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
  }, [gridFeet, projectName, selectedId]);

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
    const previous = itemsRef.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    undoStack.current.push(previous);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    autosaveAllowed.current = true;
    itemsRef.current = next;
    setItems(next);
  }

  function createItem(item: DrawingItem) {
    const next = [...itemsRef.current, item];
    commitItems(next);
    setSelectedId(item.id);
  }

  function updateItem(updated: DrawingItem) {
    commitItems(itemsRef.current.map((item) => item.id === updated.id ? updated : item));
  }

  function deleteSelected() {
    if (!selectedId) return;
    commitItems(itemsRef.current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(itemsRef.current);
    itemsRef.current = previous;
    setItems(previous);
    setSelectedId(null);
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    setSelectedId(null);
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
    const bounds = items.map((item) => {
      if (item.kind === "circle") {
        const radius = Math.hypot(item.x2 - item.x, item.y2 - item.y);
        return { minX: item.x - radius, maxX: item.x + radius, minY: item.y - radius, maxY: item.y + radius };
      }
      return {
        minX: Math.min(item.x, item.x2),
        maxX: Math.max(item.x, item.x2),
        minY: Math.min(item.y, item.y2),
        maxY: Math.max(item.y, item.y2),
      };
    });
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

  function handleExport(kind: "svg" | "png" | "json") {
    const file = drawingForExport();
    if (kind === "svg") downloadSvg(file);
    else if (kind === "png") downloadPng(file, showToast);
    else {
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
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDrawingFile(parsed)) {
        throw new Error("This file is not a supported SiteSketch drawing.");
      }
      undoStack.current = [];
      redoStack.current = [];
      itemsRef.current = parsed.items;
      setItems(parsed.items);
      setProjectName(parsed.name);
      setGridFeet(parsed.gridFeet);
      autosaveAllowed.current = true;
      setSelectedId(null);
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
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="SiteSketch home">
          <span className="brand-mark"><Shapes size={22} strokeWidth={1.8} /></span>
          <span className="brand-copy">
            <strong>SiteSketch</strong>
            <small>CONSTRUCTION PLAN STUDIO</small>
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
            {tools.map((tool) => (
              <ToolButton
                key={tool.id}
                {...tool}
                active={activeTool === tool.id}
                onClick={setActiveTool}
              />
            ))}
          </div>
          <div className="rail-bottom">
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

        <main className="drawing-area">
          <div className="canvas-toolbar">
            <div className="breadcrumb">
              <span>Design tools</span><span className="crumb-separator">/</span><strong>Plan editor</strong>
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
              <button className="zoom-button" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}><Minus size={14} /></button>
              <span className="zoom-level">{Math.round(camera.zoom * 100)}%</span>
              <button className="zoom-button" title="Zoom in" onClick={() => zoomBy(1.2)}><Plus size={14} /></button>
              <button className="fit-button" title="Fit drawing to page" onClick={fitToPlan}><Grid2X2 size={15} /></button>
            </div>
          </div>

          <PlanCanvas
            items={items}
            selectedId={selectedId}
            activeTool={activeTool}
            gridFeet={gridFeet}
            gridSnap={gridSnap}
            objectSnap={objectSnap}
            showDimensions={showDimensions}
            spaceDown={spaceDown}
            camera={camera}
            onCameraChange={setCamera}
            onCreate={createItem}
            onChooseTool={setActiveTool}
            onSelect={setSelectedId}
            onUpdate={updateItem}
            onCursorMove={updateCoordinates}
          />

          <footer className="statusbar">
            <span className="status-indicator"><i />{saveMessage}</span>
            <span className="status-coordinates" ref={coordinatesRef}>X —  ·  Y —</span>
            <span className="status-help">Hold <kbd>Space</kbd> and drag to pan <span className="status-dot">·</span> Scroll to zoom</span>
          </footer>
        </main>

        <Inspector
          item={selectedItem}
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
            <h2 id="connect-title">Add SiteSketch as a design tool</h2>
            <p>Deploy this app to a public HTTPS address, then add that address under <b>Configuration → Tools → Design Tools</b>.</p>
            <ol>
              <li>Choose <b>Add</b> and name the tool “SiteSketch”.</li>
              <li>Paste the deployed app URL and save it.</li>
              <li>Open it from a customer’s Design Tools page.</li>
            </ol>
            <div className="dialog-note">
              The app recognizes <code>job_id</code>, <code>customer_name</code>, and <code>customer_email</code> query parameters. It does not connect to a private One Click API or save records back to One Click.
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
  const customer =
    params.get("customer_name") ||
    params.get("customerName") ||
    params.get("customer.name");
  const email =
    params.get("customer_email") ||
    params.get("customerEmail") ||
    params.get("job.email");
  return [
    jobId && `Job ${jobId}`,
    customer,
    email,
  ].filter(Boolean).join(" · ");
}

export default App;
