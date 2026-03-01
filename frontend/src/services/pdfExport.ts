/** Browser-based PDF export using jsPDF + svg2pdf.js.
 *
 * Converts the rendered SVG diagram to a vector PDF document
 * with a VDI 3682 title block. Libraries are loaded dynamically
 * to keep the initial bundle small.
 */

export interface PdfExportOptions {
  /** The live SVG DOM element to render into the PDF. */
  svgElement: SVGSVGElement;
  /** Process title for the title block. */
  title: string;
  /** Filename for download (default: "diagram.pdf"). */
  filename?: string;
}

/** Prepare a clean SVG clone for PDF export. */
function prepareSvgForExport(svgElement: SVGSVGElement): SVGSVGElement {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // Remove selection highlight filters (glow effect).
  clone.querySelectorAll("[filter]").forEach((el) => {
    el.removeAttribute("filter");
  });

  // Remove background style (PDF has white background by default).
  clone.style.background = "";

  // Temporarily insert clone to compute the actual content bounding box,
  // which is independent of the current pan/zoom viewBox.
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "-9999px";
  document.body.appendChild(clone);
  const bbox = clone.getBBox();
  document.body.removeChild(clone);
  clone.style.position = "";
  clone.style.left = "";
  clone.style.top = "";

  // Reset viewBox to encompass all content (ignoring pan/zoom state).
  const margin = 50;
  const vbX = bbox.x - margin;
  const vbY = bbox.y - margin;
  const vbW = bbox.width + 2 * margin;
  const vbH = bbox.height + 2 * margin;
  clone.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
  clone.setAttribute("width", String(vbW));
  clone.setAttribute("height", String(vbH));

  return clone;
}

/** Draw title information as plain text lines at the bottom of the PDF page. */
function drawTitleLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  title: string,
  x: number,
  y: number,
): void {
  const lineHeight = 5; // mm between lines
  const dateStr = new Date().toISOString().slice(0, 16).replace("T", " ");

  pdf.setTextColor(44, 62, 80);

  // Line 1: Process title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(`Process: ${title}`, x, y);

  // Line 2: Export date
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Exported: ${dateStr}`, x, y + lineHeight);

  // Line 3: VDI 3682 label
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(127, 140, 141);
  pdf.text("VDI 3682 — Formalized Process Description", x, y + lineHeight * 2);
}

/**
 * Export the rendered SVG diagram to a PDF file.
 *
 * Uses dynamic imports so jsPDF (~300KB) is only loaded when actually needed.
 */
export async function exportSvgToPdf({
  svgElement,
  title,
  filename = "diagram.pdf",
}: PdfExportOptions): Promise<void> {
  // Dynamic imports — loaded only on first PDF export
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  // Prepare a clean SVG clone
  const svgClone = prepareSvgForExport(svgElement);

  // Parse viewBox dimensions
  const viewBox = svgClone.getAttribute("viewBox");
  if (!viewBox) {
    throw new Error("SVG element has no viewBox attribute");
  }
  const [, , svgW, svgH] = viewBox.split(/[\s,]+/).map(Number);
  if (!svgW || !svgH) {
    throw new Error("Invalid SVG viewBox dimensions");
  }

  // Create PDF: A4 portrait
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 297mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 210mm

  // Layout regions
  const margin = 10; // mm
  const titleLinesHeight = 16; // mm for 3 text lines
  const gap = 4; // mm between diagram and title lines
  const diagramAreaX = margin;
  const diagramAreaY = margin;
  const diagramAreaWidth = pageWidth - 2 * margin;
  const diagramAreaHeight = pageHeight - 2 * margin - titleLinesHeight - gap;

  // Scale SVG to fit within diagram area (preserving aspect ratio)
  const scaleX = diagramAreaWidth / svgW;
  const scaleY = diagramAreaHeight / svgH;
  const scale = Math.min(scaleX, scaleY);

  // Center the diagram
  const renderedWidth = svgW * scale;
  const renderedHeight = svgH * scale;
  const offsetX = diagramAreaX + (diagramAreaWidth - renderedWidth) / 2;
  const offsetY = diagramAreaY + (diagramAreaHeight - renderedHeight) / 2;

  // Render SVG into PDF
  await pdf.svg(svgClone, {
    x: offsetX,
    y: offsetY,
    width: renderedWidth,
    height: renderedHeight,
  });

  // Draw title lines
  drawTitleLines(
    pdf,
    title,
    margin,
    pageHeight - margin - titleLinesHeight,
  );

  // Set PDF metadata
  pdf.setProperties({
    title: title,
    subject: "VDI 3682 Formalized Process Description",
    creator: "FPB Editor",
  });

  // Trigger download
  pdf.save(filename);
}
