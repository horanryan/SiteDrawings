import { formatFeetInches, itemBounds, lineSections, lineSectionsByItem, hasFullDimension, layoutLineLabels, noteSize, visibleNoteLines, NOTE_FONT_SIZE, NOTE_PADDING, NOTE_LINE_HEIGHT, polygonVertices } from "../model";
import type { DrawingFile, DrawingItem, Point } from "../model";

const EXPORT_SCALE = 72;

function xml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function shapeText(item: DrawingItem, left: number, top: number, width: number, height: number): string {
  if (!item.label || width <= 0 || height <= 0) return "";
  const size = (item.textSize ?? 14) * EXPORT_SCALE / 40;
  const padding = 0.15 * EXPORT_SCALE;
  const availableWidth = Math.max(size, width - padding * 2);
  const capacity = Math.max(1, Math.floor(availableWidth / (size * 0.56)));
  const lines = item.label.split(/\r\n|\r|\n/).flatMap((paragraph) => {
    const result: string[] = [];
    let remaining = paragraph;
    while (remaining.length > capacity) {
      const space = remaining.lastIndexOf(" ", capacity);
      const cut = space > 0 ? space : capacity;
      result.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    result.push(remaining);
    return result;
  });
  const lineHeight = size * 1.2;
  const visible = lines.slice(0, Math.max(1, Math.floor((height - padding * 2) / lineHeight)));
  const alignment = item.textAlign ?? "center";
  const anchor = alignment === "left" ? "start" : alignment === "right" ? "end" : "middle";
  const x = alignment === "left" ? left + padding : alignment === "right" ? left + width - padding : left + width / 2;
  const firstY = top + height / 2 - (visible.length - 1) * lineHeight / 2;
  const linesSvg = visible.map((line, index) => `<tspan x="${x}" y="${firstY + index * lineHeight}">${xml(line)}</tspan>`).join("");
  return `<text text-anchor="${anchor}" dominant-baseline="middle" fill="${xml(item.textColor ?? item.color)}" font-family="${xml(item.textFont ?? "Arial")}" font-size="${size}" font-weight="${item.textBold ? "bold" : "normal"}" font-style="${item.textItalic ? "italic" : "normal"}">${linesSvg}</text>`;
}

function dimensionLabel(text: string, x: number, y: number) {
  const width = Math.max(38, text.length * 7 + 12);
  return `
    <g>
      <rect x="${x - width / 2}" y="${y - 10}" width="${width}" height="20" rx="4" fill="white" stroke="#e1e7ec"/>
      <text x="${x}" y="${y + 4}" fill="#31465a" font-family="Arial,sans-serif" font-size="12" font-weight="600" text-anchor="middle">${xml(text)}</text>
    </g>`;
}

function renderItem(item: DrawingItem, items: DrawingItem[] = [], showOverallDimensions = false, positions?: Map<string, Point[]>, sectionsByItem?: Map<string, Array<{ start: number; end: number; length: number }>>): string {
  const scale = EXPORT_SCALE;
  const x = item.x * scale;
  const y = item.y * scale;
  const x2 = item.x2 * scale;
  const y2 = item.y2 * scale;
  const dx = x2 - x;
  const dy = y2 - y;
  const length = Math.hypot(dx, dy) || 1;
  const color = xml(item.color);

  if (item.kind === "arrow") {
    const bendX = item.bend ? x + item.bend.x * scale : x;
    const bendY = item.bend ? y + item.bend.y * scale : y;
    const endDx = x2 - bendX, endDy = y2 - bendY;
    const endLength = Math.hypot(endDx, endDy) || 1;
    const head = Math.min(0.3 * scale, endLength * 0.7);
    const wing = head * 0.4;
    const ux = endDx / endLength, uy = endDy / endLength;
    const bx = x2 - ux * head, by = y2 - uy * head;
    return `<polyline points="${x},${y} ${bendX},${bendY} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M ${x2} ${y2} L ${bx - uy * wing} ${by + ux * wing} L ${bx + uy * wing} ${by - ux * wing} Z" fill="${color}"/>`;
  }

  if (item.kind === "freehand") {
    const points = (item.points ?? []).map((point) => `${(item.x + point.x) * scale},${(item.y + point.y) * scale}`).join(" ");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (item.kind === "wall" || item.kind === "dashed") {
    const line = `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"${item.kind === "dashed" ? ' stroke-dasharray="9 6"' : ""}/>`;
    if (!item.showDimension) return line;
    const sections = sectionsByItem?.get(item.id) ?? lineSections(item, items);
    if (sections.length > 1) {
      const labels = sections.map((section, index) => {
        const midpoint = (section.start + section.end) / 2;
        const position = positions?.get(item.id)?.[index];
        return dimensionLabel(formatFeetInches(section.length), position ? position.x * scale : x + dx * midpoint + dy / length * 22, position ? position.y * scale : y + dy * midpoint - dx / length * 22);
      }).join("");
      const full = !showOverallDimensions || hasFullDimension(item, items) ? "" : renderItem({ ...item, kind: "dimension" });
      return `${line}${labels}${full}`;
    }
    const position = positions?.get(item.id)?.[0];
    const labelX = position ? position.x * scale : (x + x2) / 2 - (dy / length) * 22;
    const labelY = position ? position.y * scale : (y + y2) / 2 + (dx / length) * 22;
    const label = item.label?.trim() || formatFeetInches(length / scale);
    return `${line}${dimensionLabel(label, labelX, labelY)}`;
  }

  if (item.kind === "rectangle") {
    const left = Math.min(x, x2);
    const top = Math.min(y, y2);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    const shape = item.diagramShape ? `<polygon points="${polygonVertices(item.diagramShape, { x, y }, { x: x2, y: y2 }).map((point) => `${point.x},${point.y}`).join(" ")}" fill="${item.fillColor ?? "rgba(64,124,177,.04)"}" stroke="${color}" stroke-width="2.5"/>` : `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${item.fillColor ?? "rgba(64,124,177,.04)"}" stroke="${color}" stroke-width="2.5"/>`;
    const text = shapeText(item, left, top, width, height);
    if (!item.showDimension) return shape + text;
    const widthLabel = item.widthLabel?.trim() || formatFeetInches(width / scale);
    const heightLabel = item.heightLabel?.trim() || formatFeetInches(height / scale);
    return `${shape}${dimensionLabel(widthLabel, left + width / 2, top - 20)}${dimensionLabel(heightLabel, left + width + 22, top + height / 2)}`;
  }

  if (item.kind === "circle") {
    const radius = Math.hypot(dx, dy);
    const shape = `<circle cx="${x}" cy="${y}" r="${radius}" fill="${item.fillColor ?? "rgba(64,124,177,.04)"}" stroke="${color}" stroke-width="2.5"/>`;
    const text = !item.showDimension ? shapeText(item, x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4) : "";
    if (!item.showDimension) return shape + text;
    const label = item.label?.trim() || `Ø ${formatFeetInches((radius * 2) / scale)}`;
    return `${shape}${dimensionLabel(label, x, y - radius - 20)}`;
  }

  if (item.kind === "dimension") {
    const offset = 0.38 * scale;
    const nx = (-dy / length) * offset;
    const ny = (dx / length) * offset;
    const startX = x + nx;
    const startY = y + ny;
    const endX = x2 + nx;
    const endY = y2 + ny;
    const lines = `
      <line x1="${x}" y1="${y}" x2="${startX}" y2="${startY}" stroke="#96a5b3"/>
      <line x1="${x2}" y1="${y2}" x2="${endX}" y2="${endY}" stroke="#96a5b3"/>
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#6f8295" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`;
    if (!item.showDimension) return lines;
    const label = item.label?.trim() || formatFeetInches(length / scale);
    return `${lines}${dimensionLabel(label, (startX + endX) / 2, (startY + endY) / 2 - 0.16 * scale)}`;
  }

  const box = noteSize(item);
  const lines = visibleNoteLines(item).map((line, index) => `<text x="${x + NOTE_PADDING * scale}" y="${y + (NOTE_PADDING + NOTE_FONT_SIZE * 0.85 + index * NOTE_LINE_HEIGHT) * scale}" fill="${color}" font-family="monospace" font-size="${NOTE_FONT_SIZE * scale}">${xml(line)}</text>`).join("");
  return `<rect x="${x}" y="${y}" width="${box.width * scale}" height="${box.height * scale}" fill="none" stroke="#b9cdd0" stroke-width="1"/>${lines}`;
}

export function drawingAsSvg(file: DrawingFile, showOverallDimensions = false): string {
  // Export bounds include a little breathing room so labels at the edges aren't clipped.
  const bounds = file.items.map(itemBounds);
  const sectionsByItem = lineSectionsByItem(file.items);
  const positions = layoutLineLabels(file.items, showOverallDimensions, sectionsByItem);
  for (const labels of positions.values()) {
    for (const point of labels) bounds.push({ left: point.x, top: point.y, right: point.x, bottom: point.y });
  }
  const padding = 1.2 * EXPORT_SCALE;
  const left = bounds.length ? Math.min(...bounds.map((bound) => bound.left * EXPORT_SCALE)) - padding : 0;
  const top = bounds.length ? Math.min(...bounds.map((bound) => bound.top * EXPORT_SCALE)) - padding : 0;
  const right = bounds.length ? Math.max(...bounds.map((bound) => bound.right * EXPORT_SCALE)) + padding : 960;
  const bottom = bounds.length ? Math.max(...bounds.map((bound) => bound.bottom * EXPORT_SCALE)) + padding : 600;
  const width = Math.max(240, right - left);
  const height = Math.max(180, bottom - top);
  const title = xml(file.name || "Construction plan");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}">
  <title>${title}</title>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="#6f8295"/></marker>
  </defs>
  <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#fff"/>
  ${file.items.map((item) => renderItem(item, file.items, showOverallDimensions, positions, sectionsByItem)).join("\n")}
</svg>`;
}

export function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Mobile browsers may need more time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function safeFileName(name: string) {
  return (name.trim() || "construction-plan")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 70);
}
