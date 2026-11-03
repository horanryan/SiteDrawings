import { describe, expect, it, vi } from "vitest";
import {
  formatFeetInches,
  isDrawingFile,
  itemBounds,
  moveItem,
  newItem,
  parseFeetInches,
  resizeLine,
  snapPoint,
} from "./model";
import type { DrawingFile } from "./model";
import { drawingAsSvg } from "./io/drawingFiles";
import { jpegAsPdf } from "./io/drawingPdf";

describe("plan measurements", () => {
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
