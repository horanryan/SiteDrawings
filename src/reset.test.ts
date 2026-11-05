import { describe, expect, it } from "vitest";
import { clearSavedDrawing } from "./reset";
import { newItem } from "./model";

describe("resetting a drawing", () => {
  it("clears only the requested drawing and both history stacks", () => {
    const values = new Map([["job-a", "first"], ["job-b", "second"]]);
    const storage = { removeItem: (key: string) => { values.delete(key); } };
    const line = newItem("wall", { x: 0, y: 0 }, { x: 3, y: 0 });
    const undo = [[line]], redo = [[line]];
    clearSavedDrawing(storage, "job-a", undo, redo);
    expect(values.has("job-a")).toBe(false);
    expect(values.get("job-b")).toBe("second");
    expect(undo).toEqual([]);
    expect(redo).toEqual([]);
  });

  it("keeps history when the browser cannot remove the saved drawing", () => {
    const line = newItem("wall", { x: 0, y: 0 }, { x: 3, y: 0 });
    const undo = [[line]], redo = [[line]];
    expect(() => clearSavedDrawing({ removeItem: () => { throw new Error("unavailable"); } }, "job-a", undo, redo)).toThrow();
    expect(undo).toEqual([[line]]);
    expect(redo).toEqual([[line]]);
  });
});
