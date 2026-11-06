import { useEffect, useState } from "react";
import { Trash2, ChevronDown, X, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { QUICK_GUIDE } from "../shortcuts";
import {
  distance,
  formatFeetInches,
  itemLength,
  parseFeetInches,
  resizeLine,
  diagramShapeLabel,
} from "../model";
import type { DrawingItem } from "../model";

interface InspectorProps {
  onClose: () => void;
  guideOpen: boolean;
  onToggleGuide: () => void;
  item: DrawingItem | undefined;
  selectedCount: number;
  gridFeet: number;
  showGridSpacing: boolean;
  onGridFeetChange: (value: number) => void;
  onUpdate: (item: DrawingItem) => void;
  onDelete: () => void;
}

function DimensionInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(formatFeetInches(value));
  const [error, setError] = useState("");

  useEffect(() => {
    setText(formatFeetInches(value));
    setError("");
  }, [value]);

  function commit() {
    const parsed = parseFeetInches(text);
    if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a positive length, like 10′ 6″.");
      return;
    }
    setError("");
    onCommit(parsed);
  }

  return (
    <div className="dimension-property">
      <label className="property-row">
        <span>{label}</span>
        <span className="value-input">
        <input
          type="text"
          inputMode="text"
          value={text}
          aria-invalid={Boolean(error)}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
          <span>ft / in</span>
        </span>
      </label>
      {error && <span className="dimension-error" role="alert">{error}</span>}
      <span className="dimension-help">Enter feet and inches, or decimal feet.</span>
    </div>
  );
}

function TextProperty({
  label,
  value,
  placeholder,
  onCommit,
  maxLength = 1000,
}: {
  label: string;
  value: string;
  placeholder: string;
  maxLength?: number;
  onCommit: (next: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function commit() {
    if (text !== value) onCommit(text);
  }

  return (
    <label className="property-row">
      <span>{label}</span>
      <input
        className="text-input"
        type="text"
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function ShapeTextControls({ item, onUpdate }: { item: DrawingItem; onUpdate: (item: DrawingItem) => void }) {
  const [text, setText] = useState(item.label ?? "");
  const [size, setSize] = useState(String(item.textSize ?? 14));
  useEffect(() => setText(item.label ?? ""), [item.id, item.label]);
  useEffect(() => setSize(String(item.textSize ?? 14)), [item.id, item.textSize]);
  return <div className="workflow-text-controls">
    <label className="workflow-field"><span>Text</span><textarea aria-label="Shape text" rows={3} maxLength={1000} value={text} placeholder="Type inside the shape" onChange={(event) => setText(event.target.value)} onBlur={() => { if (text !== (item.label ?? "")) onUpdate({ ...item, label: text }); }} /></label>
    <label className="workflow-field"><span>Font</span><select aria-label="Font family" value={item.textFont ?? "Arial"} onChange={(event) => onUpdate({ ...item, textFont: event.target.value as DrawingItem["textFont"] })}><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="monospace">Monospace</option></select></label>
    <div className="workflow-format-row"><label className="workflow-field"><span>Size</span><input aria-label="Font size" type="number" min={8} max={72} value={size} onChange={(event) => setSize(event.target.value)} onBlur={() => { const value = Number(size); if (Number.isFinite(value) && value >= 8 && value <= 72) onUpdate({ ...item, textSize: value }); else setSize(String(item.textSize ?? 14)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
      <div className="workflow-format-buttons" aria-label="Text style"><button type="button" title="Bold" aria-label="Bold" aria-pressed={!!item.textBold} onClick={() => onUpdate({ ...item, textBold: !item.textBold })}><b>B</b></button><button type="button" title="Italic" aria-label="Italic" aria-pressed={!!item.textItalic} onClick={() => onUpdate({ ...item, textItalic: !item.textItalic })}><i>I</i></button></div>
    </div>
    <div className="workflow-field"><span>Alignment</span><div className="workflow-format-buttons" role="group" aria-label="Text alignment">{(["left", "center", "right"] as const).map((alignment) => <button type="button" key={alignment} aria-label={`Align ${alignment}`} aria-pressed={(item.textAlign ?? "center") === alignment} onClick={() => onUpdate({ ...item, textAlign: alignment })}>{alignment === "left" ? <AlignLeft size={16} /> : alignment === "center" ? <AlignCenter size={16} /> : <AlignRight size={16} />}</button>)}</div></div>
    <label className="property-row"><span>Text color</span><input aria-label="Text color" className="color-input" type="color" value={item.textColor ?? item.color} onChange={(event) => onUpdate({ ...item, textColor: event.target.value })} /></label>
    <label className="property-row"><span>Fill color</span><input aria-label="Fill color" className="color-input" type="color" value={item.fillColor ?? "#ffffff"} onChange={(event) => onUpdate({ ...item, fillColor: event.target.value })} /></label>
    <label className="check-row"><input type="checkbox" checked={item.fillColor === undefined} onChange={(event) => onUpdate({ ...item, fillColor: event.target.checked ? undefined : "#ffffff" })} /><span>Transparent fill</span></label>
  </div>;
}

export default function Inspector({
  onClose,
  guideOpen,
  onToggleGuide,
  item,
  selectedCount,
  gridFeet,
  showGridSpacing,
  onGridFeetChange,
  onUpdate,
  onDelete,
}: InspectorProps) {
  const [gridText, setGridText] = useState(String(gridFeet));
  const [gridError, setGridError] = useState("");

  useEffect(() => {
    setGridText(String(gridFeet));
    setGridError("");
  }, [gridFeet]);

  function commitGridFeet() {
    const next = Number(gridText);
    if (!Number.isFinite(next) || next < 0.125 || next > 1000) {
      setGridText(String(gridFeet));
      setGridError("Enter a value between 0.125 and 1,000 feet.");
      return;
    }
    setGridError("");
    if (next !== gridFeet) onGridFeetChange(next);
  }

  function changeLineLength(length: number) {
    if (item) onUpdate(resizeLine(item, length));
  }

  function changeWidth(width: number) {
    if (!item) return;
    const direction = Math.sign(item.x2 - item.x) || 1;
    onUpdate({ ...item, x2: item.x + direction * width });
  }

  function changeHeight(height: number) {
    if (!item) return;
    const direction = Math.sign(item.y2 - item.y) || 1;
    onUpdate({ ...item, y2: item.y + direction * height });
  }

  function changeDiameter(diameter: number) {
    if (!item) return;
    const currentRadius = distance(
      { x: item.x, y: item.y },
      { x: item.x2, y: item.y2 },
    );
    const direction =
      currentRadius === 0
        ? { x: 1, y: 0 }
        : {
            x: (item.x2 - item.x) / currentRadius,
            y: (item.y2 - item.y) / currentRadius,
          };
    const radius = diameter / 2;
    onUpdate({
      ...item,
      x2: item.x + direction.x * radius,
      y2: item.y + direction.y * radius,
    });
  }

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">{showGridSpacing ? "PLAN DETAILS" : "WORKFLOW DETAILS"}</span>
          <h2>Properties</h2>
        </div>
        <button className="inspector-close" aria-label="Close properties" title="Close properties" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="inspector-scroll">
        {showGridSpacing && <section className="property-section">
          <h3>GRID SPACING</h3>
          <label className="field-label" htmlFor="grid-feet">One grid square represents</label>
          <div className="scale-input">
            <input
              id="grid-feet"
              type="number"
              min="0.125"
              max="1000"
              step="0.125"
              value={gridText}
              aria-invalid={Boolean(gridError)}
              aria-describedby={gridError ? "grid-feet-error" : undefined}
              onChange={(event) => setGridText(event.target.value)}
              onBlur={commitGridFeet}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <span>feet</span>
          </div>
          {gridError && <p id="grid-feet-error" className="dimension-error" role="alert">{gridError}</p>}
          <p className="field-help">This is the interval used when snapping new points to the grid.</p>
        </section>}

        <section className="property-section selection-section">
          <h3>SELECTION</h3>
          {selectedCount > 1 ? (
            <div className="selection-properties">
              <div className="selected-type">{selectedCount} items selected</div>
              <button className="delete-selection" onClick={onDelete}><Trash2 size={14} /> Delete selected items</button>
            </div>
          ) : !item ? (
            <div className="selection-empty">
              <span className="selection-icon">↖</span>
              <span>{showGridSpacing ? "Select a line or shape to edit its measurements." : "Select a shape or arrow to edit it."}</span>
            </div>
          ) : (
            <div className="selection-properties">
              <div className="selected-type">
                <span>{!showGridSpacing && item.kind === "arrow" ? "Connector" : !showGridSpacing ? diagramShapeLabel(item) : item.kind === "wall" ? "Line" : item.kind}</span>
                <span className="selected-dot" style={{ backgroundColor: item.color }} />
              </div>

              <TextProperty label={showGridSpacing ? "Layer name" : "Object name"} value={item.layerName ?? ""} placeholder={showGridSpacing ? "Layer name" : "Object name"} maxLength={80} onCommit={(layerName) => onUpdate({ ...item, layerName: layerName.trim() })} />

              {showGridSpacing && (item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension") ? (
                <DimensionInput
                  label="Length"
                  value={itemLength(item)}
                  onCommit={changeLineLength}
                />
              ) : null}
              {showGridSpacing && item.kind === "rectangle" ? (
                <>
                  <DimensionInput
                    label="Width"
                    value={Math.abs(item.x2 - item.x)}
                    onCommit={changeWidth}
                  />
                  <DimensionInput
                    label="Height"
                    value={Math.abs(item.y2 - item.y)}
                    onCommit={changeHeight}
                  />
                </>
              ) : null}
              {!showGridSpacing && (item.kind === "rectangle" || item.kind === "circle") && <><ShapeTextControls key={item.id} item={item} onUpdate={onUpdate} /><p className="field-help">Double-click a shape to edit its text, or select it and start typing. Drag its square handle to resize it.</p></>}
              {!showGridSpacing && item.kind === "arrow" && <>
                <label className="workflow-field"><span>Connector style</span><select aria-label="Connector style" value={item.connectorRoute === "elbow" ? "elbow" : item.curve ? "curved" : "straight"} onChange={(event) => {
                  const style = event.target.value;
                  const dx = item.x2 - item.x, dy = item.y2 - item.y;
                  onUpdate({ ...item, connectorRoute: style === "elbow" ? "elbow" : undefined, bend: undefined, curve: style === "curved" ? item.curve ?? { x: dx / 2 - dy * 0.2, y: dy / 2 + dx * 0.2 } : undefined });
                }}><option value="straight">Straight</option><option value="elbow">Rounded right angle</option><option value="curved">Curved</option></select></label>
                <label className="check-row"><input type="checkbox" checked={item.arrowHead !== false} onChange={(event) => onUpdate({ ...item, arrowHead: event.target.checked })} /><span>Show arrowhead</span></label>
                <p className="field-help">Drag endpoints onto shape edges or highlighted points to attach them. Curved connectors can be adjusted with the square handle.</p>
              </>}
              {item.kind === "note" && <p className="field-help">Click the note to edit its text. Drag the lower-right handle to resize; the box grows to fit its text.</p>}
              {showGridSpacing && item.kind === "circle" ? (
                <DimensionInput
                  label="Diameter"
                  value={distance(
                    { x: item.x, y: item.y },
                    { x: item.x2, y: item.y2 },
                  ) * 2}
                  onCommit={changeDiameter}
                />
              ) : null}

              {item.kind !== "note" && (
                <label className="property-row">
                  <span>Line color</span>
                  <input
                    className="color-input"
                    type="color"
                    value={item.color}
                    onChange={(event) =>
                      onUpdate({ ...item, color: event.target.value })
                    }
                  />
                </label>
              )}

              {showGridSpacing && item.kind === "rectangle" ? (
                <>
                  <TextProperty
                    label="Width label"
                    value={item.widthLabel ?? ""}
                    placeholder="Automatic"
                    onCommit={(widthLabel) => onUpdate({ ...item, widthLabel })}
                  />
                  <TextProperty
                    label="Height label"
                    value={item.heightLabel ?? ""}
                    placeholder="Automatic"
                    onCommit={(heightLabel) => onUpdate({ ...item, heightLabel })}
                  />
                </>
              ) : showGridSpacing && item.kind !== "freehand" && item.kind !== "arrow" && item.kind !== "note" ? (
                <TextProperty
                  label="Dimension label"
                  value={item.label ?? ""}
                  placeholder="Automatic"
                  onCommit={(label) => onUpdate({ ...item, label })}
                />
              ) : null}

              {showGridSpacing && item.kind !== "note" && item.kind !== "freehand" && item.kind !== "arrow" && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={item.showDimension}
                    onChange={(event) =>
                      onUpdate({ ...item, showDimension: event.target.checked })
                    }
                  />
                  <span>Show dimensions on plan</span>
                </label>
              )}

              <button className="delete-selection" onClick={onDelete}>
                <Trash2 size={14} />
                Delete selected item
              </button>
            </div>
          )}
        </section>

        <section className="property-section quick-guide">
          <h3><button className="guide-toggle" aria-expanded={guideOpen} aria-controls="quick-guide-content" title="Toggle Quick Guide (G)" onClick={onToggleGuide}>QUICK GUIDE <ChevronDown size={15} className={guideOpen ? "expanded" : ""} /></button></h3>
          {guideOpen && <div id="quick-guide-content">
            {(showGridSpacing ? QUICK_GUIDE.filter(([, description]) => !["Start / end", "Input / output", "Subprocess"].includes(description)) : QUICK_GUIDE.filter(([, description]) => !["Dimension", "Arrow annotation", "Fit drawing", "Save drawing", "Add note", "Triangle", "Pentagon", "Hexagon", "Octagon", "Star", "New line while editing a note", "Finish note editing", "Cancel note edit / select tool / close menus"].includes(description)).map(([key, description]): [string, string] => [key, description === "Rectangle" ? "Process" : description === "Diamond" ? "Decision" : description]).concat([["A", "Connector"], ["N", "Text note"], ["0", "Fit workflow"], ["Enter", "New line in shape text"], ["Ctrl/Command + Enter", "Finish editing text"], ["Ctrl/Command + S", "Save workflow"]])).map(([key, description]) => <div className="guide-row" key={`${key}-${description}`}><kbd>{key}</kbd><span>{description}</span></div>)}
            <p className="field-help guide-tip">{showGridSpacing ? "Drag a note to move it; click it to edit. Start each line where you press and use object snap to connect linework." : "Draw connectors between shape edges or highlighted points. Attached endpoints follow shapes when moved. Choose a connector style in Properties."}</p>
          </div>}
        </section>
      </div>

      <div className="inspector-footer">
        <span className="save-dot" />
        Saved in this browser
      </div>
    </aside>
  );
}
