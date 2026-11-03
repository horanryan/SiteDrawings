import type { DrawingFile } from "../model";
import { drawingAsSvg } from "./drawingFiles";

// Embed a rasterized plan on a landscape letter page, preserving its aspect ratio.
export function jpegAsPdf(jpeg: Uint8Array, width: number, height: number): Blob {
  const pageWidth = 792;
  const pageHeight = 612;
  const scale = Math.min((pageWidth - 72) / width, (pageHeight - 72) / height);
  const imageWidth = width * scale;
  const imageHeight = height * scale;
  const x = (pageWidth - imageWidth) / 2;
  const y = (pageHeight - imageHeight) / 2;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets = [0];
  const append = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (number: number, body: string) => {
    offsets[number] = length;
    append(`${number} 0 obj\n${body}\nendobj\n`);
  };
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  append(jpeg);
  append("\nendstream\nendobj\n");
  const commands = `q\n${imageWidth.toFixed(3)} 0 0 ${imageHeight.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref = length;
  append(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export async function drawingAsPdf(file: DrawingFile): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([drawingAsSvg(file)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render the plan for PDF export."));
      image.src = url;
    });
    const scale = 2000 / Math.max(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the PDF export canvas.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the PDF image.")), "image/jpeg", 0.92));
    return jpegAsPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
