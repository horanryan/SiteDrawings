import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  distance,
  formatFeetInches,
  itemLength,
  parseFeetInches,
  resizeLine,
} from "../model";
import type { DrawingItem } from "../model";

interface InspectorProps {
  item: DrawingItem | undefined;
  selectedCount: number;
  gridFeet: number;
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
}: {
  label: string;
  value: string;
  placeholder: string;
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

export default function Inspector({
  item,
  selectedCount,
  gridFeet,
  onGridFeetChange,
  onUpdate,
  onDelete,
}: InspectorProps) {
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
          <span className="eyebrow">PLAN DETAILS</span>
          <h2>Properties</h2>
        </div>
        <span className="inspector-mark">⌖</span>
      </div>

      <div className="inspector-scroll">
        <section className="property-section">
          <h3>GRID SPACING</h3>
          <label className="field-label" htmlFor="grid-feet">One grid square represents</label>
          <div className="scale-input">
            <input
              id="grid-feet"
              type="number"
              min="0.125"
              max="1000"
              step="0.125"
              value={gridFeet}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 0.125 && next <= 1000) {
                  onGridFeetChange(next);
                }
              }}
            />
            <span>feet</span>
          </div>
          <p className="field-help">This is the interval used when snapping new points to the grid.</p>
        </section>

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
              <span>Select a line or shape to edit its measurements.</span>
            </div>
          ) : (
            <div className="selection-properties">
              <div className="selected-type">
                <span>{item.kind === "wall" ? "Line" : item.kind}</span>
                <span className="selected-dot" style={{ backgroundColor: item.color }} />
              </div>

              {item.kind === "wall" || item.kind === "dashed" || item.kind === "dimension" ? (
                <DimensionInput
                  label="Length"
                  value={itemLength(item)}
                  onCommit={changeLineLength}
                />
              ) : null}
              {item.kind === "rectangle" ? (
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
              {item.kind === "circle" ? (
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

              {item.kind === "rectangle" ? (
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
              ) : item.kind !== "freehand" ? (
                <TextProperty
                  label={item.kind === "note" ? "Note" : "Dimension label"}
                  value={item.label ?? ""}
                  placeholder={item.kind === "note" ? "Enter a note" : "Automatic"}
                  onCommit={(label) => onUpdate({ ...item, label })}
                />
              ) : null}

              {item.kind !== "note" && item.kind !== "freehand" && (
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
          <h3>QUICK GUIDE</h3>
          {[
            ["V", "Select and move"],
            ["L", "Line"],
            ["D", "Dashed line"],
            ["R", "Rectangle"],
            ["C", "Circle"],
            ["M", "Dimension"],
            ["N", "Add note"],
            ["F", "Freehand"],
          ].map(([key, description]) => (
            <div className="guide-row" key={key}>
              <kbd>{key}</kbd>
              <span>{description}</span>
            </div>
          ))}
          <p className="field-help guide-tip">
            Start each line where you press. Use object snap to connect to existing linework.
          </p>
        </section>
      </div>

      <div className="inspector-footer">
        <span className="save-dot" />
        Saved in this browser
      </div>
    </aside>
  );
}
