/**
 * PDF exporter that renders a ProcessModel as a PDF document
 * with configurable page size and orientation.
 *
 * Port of backend/export/pdf_exporter.py using pdf-lib instead of reportlab.
 */

import { PDFDocument, PDFPage, rgb, RGB, LineCapStyle } from 'pdf-lib';

import { FlowType, StateType } from '../models/fpdModel';
import { ProcessModel } from '../models/processModel';

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export type PageSizeOption = 'A4' | 'Letter';
export type OrientationOption = 'portrait' | 'landscape';

export interface PdfOptions {
    pageSize?: PageSizeOption;
    orientation?: OrientationOption;
    author?: string;
}

// ---------------------------------------------------------------------------
// Layout constants (VDI 3682 standard)
// ---------------------------------------------------------------------------

const ELEMENT_WIDTH = 140;
const ELEMENT_HEIGHT = 60;
const PO_WIDTH = 160;
const PO_HEIGHT = 70;
const TR_WIDTH = 140;
const TR_HEIGHT = 50;
const H_SPACING = 80;
const V_SPACING = 100;
const PADDING = 40;
const FONT_SIZE = 13;
const TITLE_FONT_SIZE = 18;
const TITLE_BLOCK_HEIGHT = 60;
const MARGIN = 20;

// ---------------------------------------------------------------------------
// VDI 3682 colour scheme
// ---------------------------------------------------------------------------

interface ColorPair {
    fill: RGB;
    stroke: RGB;
}

function hexToRgb(hex: string): RGB {
    const h = hex.replace('#', '');
    return rgb(
        parseInt(h.substring(0, 2), 16) / 255,
        parseInt(h.substring(2, 4), 16) / 255,
        parseInt(h.substring(4, 6), 16) / 255,
    );
}

const COLORS: Record<StateType, ColorPair> = {
    product: { fill: hexToRgb('#D4E6F1'), stroke: hexToRgb('#2980B9') },
    energy: { fill: hexToRgb('#FADBD8'), stroke: hexToRgb('#E74C3C') },
    information: { fill: hexToRgb('#D5F5E3'), stroke: hexToRgb('#27AE60') },
};

const PO_COLOR: ColorPair = {
    fill: hexToRgb('#F9E79F'),
    stroke: hexToRgb('#F39C12'),
};

const TR_COLOR: ColorPair = {
    fill: hexToRgb('#E8DAEF'),
    stroke: hexToRgb('#8E44AD'),
};

interface FlowStyle {
    stroke: RGB;
    dash: number[] | null;
}

const FLOW_STYLES: Record<FlowType, FlowStyle> = {
    flow: { stroke: hexToRgb('#2C3E50'), dash: null },
    alternativeFlow: { stroke: hexToRgb('#7F8C8D'), dash: [6, 4] },
    parallelFlow: { stroke: hexToRgb('#2C3E50'), dash: null },
};

const TEXT_COLOR = hexToRgb('#2C3E50');
const GREY_COLOR = hexToRgb('#7F8C8D');

// ---------------------------------------------------------------------------
// Page size helpers
// ---------------------------------------------------------------------------

/** Base page dimensions in points (width, height). */
const PAGE_SIZES: Record<PageSizeOption, [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
};

function getPageSize(
    pageSize: PageSizeOption,
    orientation: OrientationOption,
): [number, number] {
    const [w, h] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4;
    if (orientation === 'landscape') {
        return [h, w];
    }
    return [w, h];
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

type Rect = [x: number, y: number, w: number, h: number];

function truncateLabel(label: string, maxChars = 18): string {
    if (label.length <= maxChars) {
        return label;
    }
    return label.substring(0, maxChars - 1) + '\u2026';
}

/**
 * Approximate width of a string in Helvetica at a given font size.
 * pdf-lib does not expose a synchronous stringWidth for the standard
 * fonts prior to embedding, so we use a rough heuristic
 * (average char width ~0.5 * fontSize).
 */
function approxTextWidth(text: string, fontSize: number): number {
    return text.length * fontSize * 0.5;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawRoundedRect(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    _radius: number,
    fillColor: RGB,
    strokeColor: RGB,
    strokeWidth = 2,
    dash?: number[],
): void {
    page.drawRectangle({
        x,
        y,
        width,
        height,
        // borderRadius not supported in pdf-lib; using sharp corners
        color: fillColor,
        borderColor: strokeColor,
        borderWidth: strokeWidth,
        borderDashArray: dash,
    });
}

function drawLine(
    page: PDFPage,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: RGB,
    lineWidth: number,
    dash?: number[],
): void {
    page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        color,
        thickness: lineWidth,
        dashArray: dash,
        lineCap: LineCapStyle.Round,
    });
}

function drawCenteredText(
    page: PDFPage,
    text: string,
    cx: number,
    cy: number,
    fontSize: number,
    color: RGB,
    _fontFamily: 'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique' = 'Helvetica',
): void {
    // We have to manually offset so the text is roughly centred.
    const textWidth = approxTextWidth(text, fontSize);
    const x = cx - textWidth / 2;
    // Baseline adjustment – move down by roughly 1/3 of font size so
    // text appears vertically centred.
    const y = cy - fontSize / 3;

    page.drawText(text, {
        x,
        y,
        size: fontSize,
        color,
        // pdf-lib font is set on embed; for standard fonts the family string
        // is accepted directly when using the helpers below.  The caller is
        // responsible for embedding fonts and passing them here if needed.
        // For now we rely on the default Helvetica that pdf-lib uses.
    });
}

function drawArrowhead(
    page: PDFPage,
    tipX: number,
    tipY: number,
    pointsRight: boolean,
    color: RGB,
    size = 8,
): void {
    const dir = pointsRight ? -1 : 1;
    const x1 = tipX + dir * size;
    const y1Top = tipY + size / 2;
    const y1Bot = tipY - size / 2;

    // Draw filled triangle as three lines + filled polygon.
    // pdf-lib does not have a dedicated polygon fill, but drawSvgPath works.
    const path = pointsRight
        ? `M ${tipX} ${tipY} L ${x1} ${y1Top} L ${x1} ${y1Bot} Z`
        : `M ${tipX} ${tipY} L ${x1} ${y1Top} L ${x1} ${y1Bot} Z`;

    // Use drawSvgPath which handles filled polygons.
    page.drawSvgPath(path, {
        x: 0,
        y: 0,
        color,
        borderColor: color,
        borderWidth: 1,
    });
}

function drawTitleBlock(
    page: PDFPage,
    model: ProcessModel,
    pageWidth: number,
    _pageHeight: number,
): void {
    const blockY = MARGIN;
    const blockHeight = TITLE_BLOCK_HEIGHT;

    // Border rectangle
    page.drawRectangle({
        x: MARGIN,
        y: blockY,
        width: pageWidth - 2 * MARGIN,
        height: blockHeight,
        borderColor: TEXT_COLOR,
        borderWidth: 1,
    });

    // Process title (bold, 14pt)
    page.drawText(`Process: ${model.title}`, {
        x: MARGIN + 10,
        y: blockY + blockHeight - 25,
        size: 14,
        color: TEXT_COLOR,
    });

    // Export date
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const exportDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    page.drawText(`Exported: ${exportDate}`, {
        x: MARGIN + 10,
        y: blockY + blockHeight - 45,
        size: 10,
        color: TEXT_COLOR,
    });

    // VDI 3682 label (right side)
    const vdiLabel = 'VDI 3682 Formalized Process Description';
    const labelWidth = approxTextWidth(vdiLabel, 9);
    page.drawText(vdiLabel, {
        x: pageWidth - MARGIN - labelWidth - 10,
        y: blockY + 10,
        size: 9,
        color: GREY_COLOR,
    });
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Render a ProcessModel as a PDF document.
 *
 * Lays out states on the left and right of process operators, with
 * technical resources below their associated operators.  Includes a
 * title block with process name, date, and VDI 3682 reference.
 *
 * @param model   The process model to render.
 * @param options Optional page size, orientation, and author metadata.
 * @returns       Uint8Array containing the PDF bytes.
 */
export async function exportPdf(
    model: ProcessModel,
    options?: PdfOptions,
): Promise<Uint8Array> {
    const pageSize: PageSizeOption = options?.pageSize ?? 'A4';
    const orientation: OrientationOption = options?.orientation ?? 'landscape';
    const author: string | undefined = options?.author;

    // Page dimensions
    const [pageWidth, pageHeight] = getPageSize(pageSize, orientation);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();

    // Metadata
    pdfDoc.setTitle(model.title);
    pdfDoc.setSubject('VDI 3682 Formalized Process Description');
    pdfDoc.setCreator('Text-Based FPD Tool');
    if (author) {
        pdfDoc.setAuthor(author);
    }

    // Add a single page
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Available drawing area (above title block)
    const drawAreaY = MARGIN + TITLE_BLOCK_HEIGHT + MARGIN;
    // const drawAreaHeight = pageHeight - drawAreaY - PADDING;

    // ------------------------------------------------------------------
    // Build position map
    // ------------------------------------------------------------------
    const positions = new Map<string, Rect>();

    // Determine input / output states from flows
    const inputStateIds = new Set<string>();
    const outputStateIds = new Set<string>();
    const poIds = new Set(model.processOperators.map((po) => po.id));

    for (const flow of model.flows) {
        if (poIds.has(flow.targetRef)) {
            inputStateIds.add(flow.sourceRef);
        }
        if (poIds.has(flow.sourceRef)) {
            outputStateIds.add(flow.targetRef);
        }
    }

    // Unconnected states go to the input side
    const allStateIds = new Set(model.states.map((s) => s.id));
    for (const sid of allStateIds) {
        if (!inputStateIds.has(sid) && !outputStateIds.has(sid)) {
            inputStateIds.add(sid);
        }
    }

    // Column x-positions
    const colInputX = PADDING;
    const colPoX = PADDING + ELEMENT_WIDTH + H_SPACING;
    const colOutputX = colPoX + PO_WIDTH + H_SPACING;

    const titleOffset = model.title ? TITLE_FONT_SIZE + PADDING : 0;
    const baseY = drawAreaY + titleOffset;

    // Place input states
    const inputStates = model.states.filter((s) => inputStateIds.has(s.id));
    for (let i = 0; i < inputStates.length; i++) {
        const y = baseY + i * (ELEMENT_HEIGHT + V_SPACING);
        positions.set(inputStates[i].id, [colInputX, y, ELEMENT_WIDTH, ELEMENT_HEIGHT]);
    }

    // Place process operators
    for (let i = 0; i < model.processOperators.length; i++) {
        const y = baseY + i * (PO_HEIGHT + V_SPACING);
        positions.set(model.processOperators[i].id, [colPoX, y, PO_WIDTH, PO_HEIGHT]);
    }

    // Place output states
    const outputStates = model.states.filter((s) => outputStateIds.has(s.id));
    for (let i = 0; i < outputStates.length; i++) {
        const y = baseY + i * (ELEMENT_HEIGHT + V_SPACING);
        positions.set(outputStates[i].id, [colOutputX, y, ELEMENT_WIDTH, ELEMENT_HEIGHT]);
    }

    // Place technical resources below their connected POs
    const trMap = new Map<string, string>();
    for (const usage of model.usages) {
        trMap.set(usage.technicalResourceRef, usage.processOperatorRef);
    }

    for (const tr of model.technicalResources) {
        const poRef = trMap.get(tr.id);
        if (poRef && positions.has(poRef)) {
            const [px, py, pw] = positions.get(poRef)!;
            const tx = px + (pw - TR_WIDTH) / 2;
            const ty = py + PO_HEIGHT + 40; // below the PO
            positions.set(tr.id, [tx, ty, TR_WIDTH, TR_HEIGHT]);
        } else {
            // Place unconnected TRs at the bottom
            const maxRows = Math.max(
                inputStates.length,
                model.processOperators.length,
                outputStates.length,
            );
            const y = baseY + maxRows * (ELEMENT_HEIGHT + V_SPACING);
            positions.set(tr.id, [colPoX, y, TR_WIDTH, TR_HEIGHT]);
        }
    }

    // ------------------------------------------------------------------
    // Flip y-coordinates from top-left layout to PDF bottom-left origin
    // ------------------------------------------------------------------
    const pdfPositions = new Map<string, Rect>();

    if (positions.size > 0) {
        let maxY = 0;
        for (const [, [, y, , h]] of positions) {
            if (y + h > maxY) {
                maxY = y + h;
            }
        }

        for (const [id, [x, y, w, h]] of positions) {
            const pdfY = pageHeight - y - h;
            pdfPositions.set(id, [x, pdfY, w, h]);
        }
    }

    // ------------------------------------------------------------------
    // Draw title
    // ------------------------------------------------------------------
    if (model.title) {
        const titleX = pageWidth / 2;
        const titleY = pageHeight - MARGIN - TITLE_FONT_SIZE;
        drawCenteredText(page, model.title, titleX, titleY, TITLE_FONT_SIZE, TEXT_COLOR, 'Helvetica-Bold');
    }

    // ------------------------------------------------------------------
    // Draw flows (lines with arrowheads)
    // ------------------------------------------------------------------
    for (const flow of model.flows) {
        if (!pdfPositions.has(flow.sourceRef) || !pdfPositions.has(flow.targetRef)) {
            continue;
        }
        const [sx, sy, sw, sh] = pdfPositions.get(flow.sourceRef)!;
        const [tx, ty, tw, th] = pdfPositions.get(flow.targetRef)!;

        // Default: connect right edge of source to left edge of target
        let x1 = sx + sw;
        const y1 = sy + sh / 2;
        let x2 = tx;
        const y2 = ty + th / 2;

        // If target centre is to the left of source centre, reverse
        if (tx + tw / 2 < sx + sw / 2) {
            x1 = sx;
            x2 = tx + tw;
        }

        const style = FLOW_STYLES[flow.flowType] ?? FLOW_STYLES.flow;
        const strokeWidth = flow.flowType === 'parallelFlow' ? 3 : 1.5;

        drawLine(
            page,
            x1, y1, x2, y2,
            style.stroke,
            strokeWidth,
            style.dash ?? undefined,
        );

        // Arrowhead
        const pointsRight = x2 > x1;
        drawArrowhead(page, x2, y2, pointsRight, style.stroke);
    }

    // ------------------------------------------------------------------
    // Draw usage connections (dashed lines)
    // ------------------------------------------------------------------
    for (const usage of model.usages) {
        const poRef = usage.processOperatorRef;
        const trRef = usage.technicalResourceRef;
        if (!pdfPositions.has(poRef) || !pdfPositions.has(trRef)) {
            continue;
        }
        const [px, py, pw] = pdfPositions.get(poRef)!;
        const [trx, trY, trW, trH] = pdfPositions.get(trRef)!;

        const x1 = px + pw / 2;
        const y1 = py;           // bottom edge of PO (lower y in PDF coords)
        const x2 = trx + trW / 2;
        const y2 = trY + trH;    // top edge of TR

        drawLine(page, x1, y1, x2, y2, TR_COLOR.stroke, 1.5, [4, 3]);
    }

    // ------------------------------------------------------------------
    // Draw states (rounded rectangles with coloured fills)
    // ------------------------------------------------------------------
    for (const state of model.states) {
        if (!pdfPositions.has(state.id)) {
            continue;
        }
        const [x, y, w, h] = pdfPositions.get(state.id)!;
        const colors = COLORS[state.stateType] ?? COLORS.product;
        const label = truncateLabel(state.label || state.id);

        drawRoundedRect(page, x, y, w, h, 10, colors.fill, colors.stroke);
        drawCenteredText(page, label, x + w / 2, y + h / 2, FONT_SIZE, TEXT_COLOR);
    }

    // ------------------------------------------------------------------
    // Draw process operators (rectangles)
    // ------------------------------------------------------------------
    for (const po of model.processOperators) {
        if (!pdfPositions.has(po.id)) {
            continue;
        }
        const [x, y, w, h] = pdfPositions.get(po.id)!;
        const label = truncateLabel(po.label || po.id);

        drawRoundedRect(page, x, y, w, h, 4, PO_COLOR.fill, PO_COLOR.stroke);
        drawCenteredText(page, label, x + w / 2, y + h / 2, FONT_SIZE, TEXT_COLOR, 'Helvetica-Bold');
    }

    // ------------------------------------------------------------------
    // Draw technical resources (dashed rectangles)
    // ------------------------------------------------------------------
    for (const tr of model.technicalResources) {
        if (!pdfPositions.has(tr.id)) {
            continue;
        }
        const [x, y, w, h] = pdfPositions.get(tr.id)!;
        const label = truncateLabel(tr.label || tr.id);

        drawRoundedRect(page, x, y, w, h, 4, TR_COLOR.fill, TR_COLOR.stroke, 2, [6, 3]);
        drawCenteredText(page, label, x + w / 2, y + h / 2, FONT_SIZE, TEXT_COLOR);
    }

    // ------------------------------------------------------------------
    // Draw title block at bottom
    // ------------------------------------------------------------------
    drawTitleBlock(page, model, pageWidth, pageHeight);

    // ------------------------------------------------------------------
    // Serialize and return
    // ------------------------------------------------------------------
    return pdfDoc.save();
}
