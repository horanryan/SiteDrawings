import { describe, expect, it, vi } from "vitest";
import {
  formatFeetInches,
  isDrawingFile,
  itemBounds,
  itemIntersectsSelection,
  lineSections,
  layoutLineLabels,
  hasFullDimension,
  moveItem,
  moveLineEndpoint,
  moveJoint,
  prepareJoint,
  newItem,
  parseFeetInches,
  resizeLine,
  snapPoint,
  updateSelection,
} from "./model";
import type { DrawingFile } from "./model";
import { drawingAsSvg } from "./io/drawingFiles";
import { jpegAsPdf } from "./io/drawingPdf";

describe("plan measurements", () => {
  it("selects lines intersecting a dragged box in either direction", () => {
    const from = { x: 2, y: 2 }, to = { x: 4, y: 4 };
    const crossing = newItem("wall", { x: 0, y: 3 }, { x: 6, y: 3 });
    const inside = newItem("dashed", { x: 2.5, y: 2.5 }, { x: 3, y: 3 });
    const outside = newItem("wall", { x: 0, y: 4 }, { x: 3, y: 7 });
    expect(itemIntersectsSelection(crossing, from, to)).toBe(true);
    expect(itemIntersectsSelection(inside, to, from)).toBe(true);
    expect(itemIntersectsSelection(outside, from, to)).toBe(false);
    const curve = { ...newItem("freehand", { x: 0, y: 0 }, { x: 6, y: 6 }), points: [{ x: 0, y: 0 }, { x: 6, y: 6 }] };
    expect(itemIntersectsSelection(curve, from, to)).toBe(true);
  });
  it("adds and removes individual items from a selection", () => {
    expect(updateSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(updateSelection(["a", "b"], "a", true)).toEqual(["b"]);
    expect(updateSelection(["a", "b"], "c")).toEqual(["c"]);
    expect(updateSelection(["a", "b"], null)).toEqual([]);
  });
  it("creates distinct items when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    try {
      const first = newItem("wall", { x: 0, y: 0 }, { x: 1, y: 1 });
      const second = newItem("wall", { x: 0, y: 0 }, { x: 1, y: 1 });
      expect(first.id).toBeTruthy();
      expect(first.id).not.toBe(second.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("formats feet and fractional inches", () => {
    expect(formatFeetInches(1.5)).toBe("1′ 6″");
    expect(formatFeetInches(2 + 5.5 / 12)).toBe("2′ 5½″");
    expect(formatFeetInches(0.125)).toBe("0′ 1½″");
  });

  it("resizes a line without changing its direction", () => {
    const line = newItem("wall", { x: 2, y: 3 }, { x: 5, y: 7 });
    const resized = resizeLine(line, 10);

    expect(resized.x).toBe(2);
    expect(resized.y).toBe(3);
    expect(Math.hypot(resized.x2 - resized.x, resized.y2 - resized.y)).toBeCloseTo(10);
    expect((resized.x2 - resized.x) / (resized.y2 - resized.y)).toBeCloseTo(3 / 4);
  });

  it("moves either endpoint without moving the opposite endpoint", () => {
    const line = newItem("wall", { x: 1, y: 2 }, { x: 5, y: 7 });
    const startMoved = moveLineEndpoint(line, "start", { x: -2, y: 3 });
    expect([startMoved.x, startMoved.y, startMoved.x2, startMoved.y2]).toEqual([-2, 3, 5, 7]);
    const endMoved = moveLineEndpoint(line, "end", { x: 8, y: 4 });
    expect([endMoved.x, endMoved.y, endMoved.x2, endMoved.y2]).toEqual([1, 2, 8, 4]);
    expect(endMoved.id).toBe(line.id);
  });

  it("moves all coincident endpoints while leaving unrelated lines alone", () => {
    const joint = { x: 0, y: 0 };
    const first = newItem("wall", { x: 0, y: 0 }, { x: 4, y: 0 });
    const second = newItem("dashed", { x: -3, y: 2 }, joint);
    const separate = newItem("wall", { x: 8, y: 8 }, { x: 9, y: 9 });
    const moved = moveJoint(prepareJoint([first, second, separate], joint), joint, { x: 1, y: 1 });
    expect([moved[0].x, moved[0].y, moved[0].x2, moved[0].y2]).toEqual([1, 1, 4, 0]);
    expect([moved[1].x, moved[1].y, moved[1].x2, moved[1].y2]).toEqual([-3, 2, 1, 1]);
    expect(moved[2]).toEqual(separate);
  });

  it("splits a line at an interior joint and moves both sides with the branch", () => {
    const base = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 0 });
    const branch = newItem("wall", { x: 4, y: 0 }, { x: 4, y: 4 });
    const joint = { x: 4, y: 0 };
    const prepared = prepareJoint([base, branch], joint);
    expect(prepared).toHaveLength(3);
    const moved = moveJoint(prepared, joint, { x: 5, y: 2 });
    expect([moved[0].x2, moved[0].y2]).toEqual([5, 2]);
    expect([moved[1].x, moved[1].y]).toEqual([5, 2]);
    expect([moved[2].x, moved[2].y]).toEqual([5, 2]);
    expect(new Set(moved.map((item) => item.id)).size).toBe(3);
  });

  it("parses decimal feet and feet-and-inches measurements", () => {
    expect(parseFeetInches("10.5")).toBe(10.5);
    expect(parseFeetInches("10' 6\"")).toBe(10.5);
    expect(parseFeetInches("10′ 6½″")).toBeCloseTo(10.5416667);
    expect(parseFeetInches("10' 6 1/2\"")).toBeCloseTo(10.5416667);
    expect(parseFeetInches("9 1/2 in")).toBeCloseTo(0.7916667);
    expect(parseFeetInches("10' 6 1/0\"")).toBeNull();
    expect(parseFeetInches("not a measurement")).toBeNull();
  });
});

describe("plan snapping", () => {
  it("separates nearby line labels without moving the geometry", () => {
    const bottom = newItem("wall", { x: 0, y: 0 }, { x: 5, y: 0 });
    const diagonal = newItem("wall", { x: 0, y: 0 }, { x: 5, y: -1 });
    const labels = layoutLineLabels([bottom, diagonal]);
    const first = labels.get(bottom.id)![0], second = labels.get(diagonal.id)![0];
    const firstWidth = Math.max(0.8, formatFeetInches(5).length * 0.1 + 0.2);
    const secondWidth = Math.max(0.8, formatFeetInches(Math.sqrt(26)).length * 0.1 + 0.2);
    expect(Math.abs(first.x - second.x) >= (firstWidth + secondWidth) / 2 + 0.04 || Math.abs(first.y - second.y) >= 0.3 - 1e-9).toBe(true);
    expect(bottom.y2).toBe(0);
    expect(diagonal.y2).toBe(-1);
    const svg = drawingAsSvg({ version: 1, name: "Plan", gridFeet: 1, items: [bottom, diagonal] });
    expect(svg).toContain(`x="${first.x * 72}" y="${first.y * 72 + 4}"`);
    expect(svg).toContain(`x="${second.x * 72}" y="${second.y * 72 + 4}"`);
  });
  const noGrid = {
    grid: false,
    objects: true,
    gridFeet: 1,
    toleranceFeet: 0.2,
  };

  it("snaps to the closest point on an existing line", () => {
    const wall = newItem("wall", { x: 0, y: 0 }, { x: 4, y: 0 });
    const result = snapPoint({ x: 2.05, y: 0.03 }, [wall], noGrid);

    expect(result.snapped).toBe(true);
    expect(result.point.x).toBeCloseTo(2.05);
    expect(result.point.y).toBe(0);
  });

  it("starts at either endpoint or an independent point, rather than the last endpoint", () => {
    const line = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(snapPoint({ x: -0.03, y: 0.02 }, [line], noGrid).point).toEqual({ x: 0, y: 0 });
    expect(snapPoint({ x: 10.03, y: 0.02 }, [line], noGrid).point).toEqual({ x: 10, y: 0 });
    expect(snapPoint({ x: 2, y: 4 }, [line], noGrid).point).toEqual({ x: 2, y: 4 });
  });

  it("snaps to a grid intersection when object snapping is off", () => {
    const result = snapPoint(
      { x: 1.7, y: 3.2 },
      [],
      { grid: true, objects: false, gridFeet: 0.5, toleranceFeet: 0.2 },
    );

    expect(result.point).toEqual({ x: 1.5, y: 3 });
    expect(result.snapped).toBe(false);
  });

  it("snaps to the actual diagonal before the grid when both are enabled", () => {
    const line = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 5 });
    const result = snapPoint({ x: 4, y: 2.04 }, [line], { ...noGrid, grid: true, gridFeet: 1 });
    expect(result.snapped).toBe(true);
    expect(result.point.y).toBeCloseTo(result.point.x / 2);
    expect(result.point.x).toBeCloseTo(4.016);
  });

  it("snaps exactly to a nearby corner instead of creating a tiny extra section", () => {
    const vertical = newItem("wall", { x: 0, y: -10 }, { x: 0, y: 0 });
    const horizontal = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 0 });
    const result = snapPoint({ x: 0.08, y: -0.01 }, [vertical, horizontal], { ...noGrid, grid: true });
    expect(result.point).toEqual({ x: 0, y: 0 });
    const diagonal = newItem("wall", { x: 4, y: -4 }, result.point);
    expect(lineSections(horizontal, [horizontal, diagonal])).toHaveLength(1);
    expect(lineSections(vertical, [vertical, diagonal])).toHaveLength(1);
  });

  it("keeps a deliberate short section when it is outside the corner snap tolerance", () => {
    const line = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 0 });
    const result = snapPoint({ x: 0.3, y: 0.01 }, [line], noGrid);
    const branch = newItem("wall", { x: 2, y: 2 }, result.point);
    expect(lineSections(line, [line, branch])).toHaveLength(2);
  });

  it("measures each section between attached endpoints and updates after a move", () => {
    const base = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 0 });
    const branch = newItem("wall", { x: 3, y: 0 }, { x: 3, y: -4 });
    const second = newItem("dashed", { x: 7, y: 2 }, { x: 7, y: 0 });
    expect(lineSections(base, [base, branch, second]).map((section) => section.length)).toEqual([expect.closeTo(3), expect.closeTo(4), expect.closeTo(3)]);
    expect(lineSections(base, [base, moveItem(branch, 1, 0)]).map((section) => section.length)).toEqual([expect.closeTo(4), expect.closeTo(6)]);
    expect(lineSections(base, [base, moveItem(branch, 0, 5)]).map((section) => section.length)).toEqual([10]);
  });

  it("divides both lines where they cross and updates when they no longer cross", () => {
    const first = newItem("wall", { x: 0, y: 0 }, { x: 8, y: 8 });
    const second = newItem("wall", { x: 0, y: 8 }, { x: 8, y: 0 });
    const items = [first, second];
    for (const line of items) {
      const sections = lineSections(line, items);
      expect(sections).toHaveLength(2);
      expect(sections[0].length).toBeCloseTo(Math.sqrt(32));
      expect(sections[1].length).toBeCloseTo(Math.sqrt(32));
    }
    expect(lineSections(first, [first, moveItem(second, 20, 0)])).toHaveLength(1);
    const svg = drawingAsSvg({ version: 1, name: "Crossing", gridFeet: 1, items }, true);
    expect((svg.match(/marker-start="url\(#arrow\)"/g) ?? [])).toHaveLength(2);
  });

  it("does not create a crossing for parallel lines or intersecting extensions", () => {
    const base = newItem("wall", { x: 0, y: 0 }, { x: 4, y: 0 });
    const parallel = newItem("wall", { x: 1, y: 1 }, { x: 3, y: 1 });
    const beyond = newItem("wall", { x: 5, y: -1 }, { x: 5, y: 1 });
    expect(lineSections(base, [base, parallel, beyond])).toHaveLength(1);
  });

  it("uses an existing full dimension instead of creating a duplicate", () => {
    const base = newItem("wall", { x: 0, y: 0 }, { x: 10, y: 0 });
    const branch = newItem("wall", { x: 3, y: 0 }, { x: 3, y: -4 });
    const dimension = newItem("dimension", { x: 10, y: 0 }, { x: 0, y: 0 });
    expect(hasFullDimension(base, [base, dimension])).toBe(true);
    const file: DrawingFile = { version: 1, name: "Plan", gridFeet: 1, items: [base, branch] };
    const svg = drawingAsSvg(file, true);
    expect(svg).toContain(formatFeetInches(3));
    expect(svg).toContain(formatFeetInches(7));
    expect(svg).toContain(formatFeetInches(10));
    expect((svg.match(/marker-start="url\(#arrow\)"/g) ?? [])).toHaveLength(1);
    expect((drawingAsSvg(file).match(/marker-start="url\(#arrow\)"/g) ?? [])).toHaveLength(0);
    expect((drawingAsSvg({ ...file, items: [...file.items, dimension] }, true).match(/marker-start="url\(#arrow\)"/g) ?? [])).toHaveLength(1);
    expect((drawingAsSvg({ ...file, items: [...file.items, dimension] }).match(/marker-start="url\(#arrow\)"/g) ?? [])).toHaveLength(1);
  });
});

describe("drawing file validation", () => {
  it("preserves freehand geometry through save, move, bounds and SVG export", () => {
    const stroke = { ...newItem("freehand", { x: 2, y: 3 }, { x: 2, y: 3 }), points: [{ x: 0, y: 0 }, { x: 4, y: -2 }, { x: 0, y: 0 }] };
    const file: DrawingFile = { version: 1, name: "Sketch", gridFeet: 1, items: [stroke] };
    expect(isDrawingFile(JSON.parse(JSON.stringify(file)))).toBe(true);
    expect(isDrawingFile({ ...file, items: [{ ...stroke, points: [{ x: NaN, y: 0 }] }] })).toBe(false);
    expect(itemBounds(moveItem(stroke, 1, 2))).toEqual({ left: 3, top: 3, right: 7, bottom: 5 });
    expect(drawingAsSvg(file)).toContain('<polyline points="144,216 432,72 144,216"');
  });

  it("creates a PDF with a valid cross-reference table", async () => {
    const pdf = jpegAsPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 100, 50);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(pdf.type).toBe("application/pdf");
    expect(text).toContain("/MediaBox [0 0 792 612]");
    const xref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    for (const [, offset, object] of Array.from(text.matchAll(/(\d{10}) 00000 n \n/g), (match, index) => [match[0], match[1], index + 1] as const)) {
      expect(text.slice(Number(offset)).startsWith(`${object} 0 obj`)).toBe(true);
    }
  });

  it("uses landscape PDF pages even for tall drawings", async () => {
    const pdf = jpegAsPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 50, 100);
    const text = new TextDecoder("latin1").decode(await pdf.arrayBuffer());
    expect(text).toContain("/MediaBox [0 0 792 612]");
    expect(text).toContain("270.000 0 0 540.000 261.000 36.000 cm");
  });

  it("accepts a saved drawing and rejects malformed geometry", () => {
    const file: DrawingFile = {
      version: 1,
      name: "Garage",
      gridFeet: 1,
      items: [newItem("rectangle", { x: 0, y: 0 }, { x: 20, y: 24 })],
    };

    expect(isDrawingFile(file)).toBe(true);
    expect(isDrawingFile({ ...file, items: [{ ...file.items[0], x: Number.NaN }] })).toBe(false);
    expect(isDrawingFile({ ...file, gridFeet: 0 })).toBe(false);
  });
});
