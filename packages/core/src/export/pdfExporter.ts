/**
 * PDF exporter that renders a DiagramLayout as a PDF document.
 *
 * Uses the same layout, shapes, and colours as the SVG renderer
 * so the PDF output matches the preview exactly.
 */

import { PDFDocument, PDFFont, PDFPage, rgb, RGB, LineCapStyle, StandardFonts } from 'pdf-lib';

import { LayoutElement, SystemLimitRect, DiagramLayout } from '../services/layout';
import {
    COLORS as HEX_COLORS,
    STROKE_WIDTH,
    STATE_LABEL_FONT_SIZE,
    PROCESS_LABEL_FONT_SIZE,
    SYSTEM_LIMIT_LABEL_FONT_SIZE,
} from '../services/designTokens';
import {
    type Point,
    computeRouting,
    computeContentBounds,
    type ContentBounds,
    type RoutedConnection,
} from '../services/routing';
import {
    measureText,
    fitBoxText,
    STATE_LABEL_GAP,
    STATE_LABEL_BLOCK_H,
} from '../services/textMetrics';

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export type PageSizeOption = 'A4' | 'Letter';
export type OrientationOption = 'portrait' | 'landscape';

export interface PdfOptions {
    pageSize?: PageSizeOption;
    orientation?: OrientationOption;
    author?: string;
    title?: string;
}

// ---------------------------------------------------------------------------
// Colour scheme (derived from shared designTokens)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): RGB {
    const h = hex.replace('#', '');
    return rgb(
        parseInt(h.substring(0, 2), 16) / 255,
        parseInt(h.substring(2, 4), 16) / 255,
        parseInt(h.substring(4, 6), 16) / 255,
    );
}

const COLORS: Record<string, RGB> = Object.fromEntries(
    Object.entries(HEX_COLORS).map(([key, hex]) => [key, hexToRgb(hex)]),
);

// ---------------------------------------------------------------------------
// Text sanitizing
// ---------------------------------------------------------------------------

/**
 * Characters that `drawText` handles itself (line breaks and whitespace
 * control characters) and that therefore never reach the font encoder.
 */
const TEXT_CONTROL_CHARS = new Set(['\n', '\f', '\r', '\u000B', '\t', '\b']);

/**
 * Build a sanitizer that replaces every character the given font cannot
 * encode with '?'. The standard fonts only support WinAnsi encoding, so
 * without this any non-WinAnsi character (e.g. CJK labels) would make
 * `drawText` throw and reject the whole export.
 */
function makeTextSanitizer(font: PDFFont): (text: string) => string {
    const supported = new Set(font.getCharacterSet());
    return (text: string): string => {
        let out = '';
        for (const ch of text) {
            const codePoint = ch.codePointAt(0) as number;
            out += supported.has(codePoint) || TEXT_CONTROL_CHARS.has(ch) ? ch : '?';
        }
        return out;
    };
}

// ---------------------------------------------------------------------------
// Page size helpers
// ---------------------------------------------------------------------------

const PAGE_SIZES: Record<PageSizeOption, [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
};

function getPageSize(pageSize: PageSizeOption, orientation: OrientationOption): [number, number] {
    const [w, h] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4;
    if (orientation === 'landscape') {
        return [h, w];
    }
    return [w, h];
}

// ---------------------------------------------------------------------------
// PDF drawing helpers
// ---------------------------------------------------------------------------

/** Transform a diagram-space coordinate to PDF-space (flip Y). */
function toPdfY(
    diagramY: number,
    bounds: ContentBounds,
    pageHeight: number,
    scale: number,
    offsetY: number,
): number {
    return pageHeight - ((diagramY - bounds.y) * scale + offsetY);
}

function toPdfX(diagramX: number, bounds: ContentBounds, scale: number, offsetX: number): number {
    return (diagramX - bounds.x) * scale + offsetX;
}

function drawPolyline(
    page: PDFPage,
    pts: Point[],
    color: RGB,
    thickness: number,
    dash?: number[],
): void {
    for (let i = 0; i < pts.length - 1; i++) {
        page.drawLine({
            start: { x: pts[i][0], y: pts[i][1] },
            end: { x: pts[i + 1][0], y: pts[i + 1][1] },
            color,
            thickness,
            dashArray: dash,
            lineCap: LineCapStyle.Round,
        });
    }
}

function drawArrowhead(page: PDFPage, tip: Point, prev: Point, color: RGB, size: number = 6): void {
    const dx = tip[0] - prev[0];
    const dy = tip[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const base = [tip[0] - ux * size, tip[1] - uy * size];
    const left = [base[0] + (px * size) / 2, base[1] + (py * size) / 2];
    const right = [base[0] - (px * size) / 2, base[1] - (py * size) / 2];

    const path = `M ${tip[0]} ${tip[1]} L ${left[0]} ${left[1]} L ${right[0]} ${right[1]} Z`;
    page.drawSvgPath(path, { x: 0, y: 0, color, borderColor: color, borderWidth: 0.5 });
}

// ---------------------------------------------------------------------------
// Element renderers
// ---------------------------------------------------------------------------

function drawState(
    page: PDFPage,
    el: LayoutElement,
    bounds: ContentBounds,
    pageHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number,
): void {
    const cx = toPdfX(el.x + el.width / 2, bounds, scale, offsetX);
    const cy = toPdfY(el.y + el.height / 2, bounds, pageHeight, scale, offsetY);
    const w = el.width * scale;
    const h = el.height * scale;
    const stateType = el.stateType || 'product';
    const color = COLORS[stateType] || COLORS['product'];

    if (stateType === 'energy') {
        // Diamond
        const path = `M ${cx} ${cy + h / 2} L ${cx + w / 2} ${cy} L ${cx} ${cy - h / 2} L ${cx - w / 2} ${cy} Z`;
        page.drawSvgPath(path, {
            x: 0,
            y: 0,
            color,
            borderColor: COLORS['black'],
            borderWidth: STROKE_WIDTH,
        });
    } else if (stateType === 'information') {
        // Hexagon
        const qw = w * 0.25;
        const path =
            `M ${cx - w / 2 + qw} ${cy + h / 2} L ${cx + w / 2 - qw} ${cy + h / 2} ` +
            `L ${cx + w / 2} ${cy} L ${cx + w / 2 - qw} ${cy - h / 2} ` +
            `L ${cx - w / 2 + qw} ${cy - h / 2} L ${cx - w / 2} ${cy} Z`;
        page.drawSvgPath(path, {
            x: 0,
            y: 0,
            color,
            borderColor: COLORS['black'],
            borderWidth: STROKE_WIDTH,
        });
    } else {
        // Circle (product)
        const r = Math.min(w, h) / 2;
        page.drawCircle({
            x: cx,
            y: cy,
            size: r,
            color,
            borderColor: COLORS['black'],
            borderWidth: STROKE_WIDTH,
        });
    }

    // Labels above shape
    const label = el.label || el.id;
    const hasName = label !== el.id;
    const fontSize = STATE_LABEL_FONT_SIZE * scale;
    // Right-aligned, ending left of the shape, matching the SVG renderer.
    // pdf-lib draws from the left edge, so subtract the real width.
    const labelRight = cx - w / 2 - STATE_LABEL_GAP * scale;
    const rightAligned = (text: string) => labelRight - measureText(text, fontSize);
    // PDF y grows upwards, so a higher lane means a larger y.
    const laneLift = (el.labelRow ?? 0) * STATE_LABEL_BLOCK_H * scale;

    if (hasName) {
        page.drawText(el.id, {
            x: rightAligned(el.id),
            y: cy + h / 2 + 14 * scale + laneLift,
            size: fontSize,
            color: COLORS['black'],
        });
        page.drawText(label, {
            x: rightAligned(label),
            y: cy + h / 2 + 3 * scale + laneLift,
            size: fontSize,
            color: COLORS['black'],
        });
    } else {
        page.drawText(el.id, {
            x: rightAligned(el.id),
            y: cy + h / 2 + 6 * scale + laneLift,
            size: fontSize,
            color: COLORS['black'],
        });
    }
}

/**
 * Draw a wrapped, centred block of text inside a box. PDF y grows upwards, so
 * successive lines step down from the first baseline.
 */
function drawBoxText(
    page: PDFPage,
    lines: string[],
    fontSize: number,
    lineHeight: number,
    cx: number,
    cy: number,
): void {
    const firstBaseline = cy + ((lines.length - 1) * lineHeight) / 2 - fontSize / 3;
    for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], {
            x: cx - measureText(lines[i], fontSize) / 2,
            y: firstBaseline - i * lineHeight,
            size: fontSize,
            color: COLORS['black'],
        });
    }
}

function drawProcessOperator(
    page: PDFPage,
    el: LayoutElement,
    bounds: ContentBounds,
    pageHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number,
): void {
    const px = toPdfX(el.x, bounds, scale, offsetX);
    const py = toPdfY(el.y + el.height, bounds, pageHeight, scale, offsetY);
    const w = el.width * scale;
    const h = el.height * scale;

    page.drawRectangle({
        x: px,
        y: py,
        width: w,
        height: h,
        color: COLORS['processOperator'],
        borderColor: COLORS['black'],
        borderWidth: STROKE_WIDTH,
    });

    const label = el.label || el.id;
    const hasName = label !== el.id;
    const fitted = fitBoxText(
        hasName ? [el.id, label] : [el.id],
        w - 12 * scale,
        h - 8 * scale,
        PROCESS_LABEL_FONT_SIZE * scale,
        7 * scale,
    );
    drawBoxText(page, fitted.lines, fitted.fontSize, fitted.lineHeight, px + w / 2, py + h / 2);
}

function drawTechnicalResource(
    page: PDFPage,
    el: LayoutElement,
    bounds: ContentBounds,
    pageHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number,
): void {
    const px = toPdfX(el.x, bounds, scale, offsetX);
    const py = toPdfY(el.y + el.height, bounds, pageHeight, scale, offsetY);
    const w = el.width * scale;
    const h = el.height * scale;

    // Rounded rectangle (pdf-lib drawRectangle doesn't support borderRadius,
    // so we approximate with an SVG path with arcs)
    const r = Math.min(20 * scale, w / 2, h / 2);
    const path =
        `M ${px + r} ${py} ` +
        `L ${px + w - r} ${py} A ${r} ${r} 0 0 1 ${px + w} ${py + r} ` +
        `L ${px + w} ${py + h - r} A ${r} ${r} 0 0 1 ${px + w - r} ${py + h} ` +
        `L ${px + r} ${py + h} A ${r} ${r} 0 0 1 ${px} ${py + h - r} ` +
        `L ${px} ${py + r} A ${r} ${r} 0 0 1 ${px + r} ${py} Z`;
    page.drawSvgPath(path, {
        x: 0,
        y: 0,
        color: COLORS['technicalResource'],
        borderColor: COLORS['black'],
        borderWidth: STROKE_WIDTH,
    });

    const label = el.label || el.id;
    const hasName = label !== el.id;
    const fitted = fitBoxText(
        hasName ? [el.id, label] : [el.id],
        w - 24 * scale,
        h - 8 * scale,
        PROCESS_LABEL_FONT_SIZE * scale,
        7 * scale,
    );
    drawBoxText(page, fitted.lines, fitted.fontSize, fitted.lineHeight, px + w / 2, py + h / 2);
}

function drawSystemLimit(
    page: PDFPage,
    sl: SystemLimitRect,
    bounds: ContentBounds,
    pageHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number,
): void {
    const px = toPdfX(sl.x, bounds, scale, offsetX);
    const py = toPdfY(sl.y + sl.height, bounds, pageHeight, scale, offsetY);
    const w = sl.width * scale;
    const h = sl.height * scale;

    page.drawRectangle({
        x: px,
        y: py,
        width: w,
        height: h,
        borderColor: COLORS['black'],
        borderWidth: STROKE_WIDTH,
        borderDashArray: [10, 12],
    });

    if (sl.label) {
        const fontSize = SYSTEM_LIMIT_LABEL_FONT_SIZE * scale;
        page.drawText(sl.label, {
            x: px + w,
            y: py + h + 5 * scale,
            size: fontSize,
            color: COLORS['black'],
        });
    }
}

function drawConnection(
    page: PDFPage,
    routed: RoutedConnection,
    bounds: ContentBounds,
    pageHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number,
): void {
    const { conn, points } = routed;
    if (points.length < 2) return;

    // Transform points to PDF space
    const pdfPts: Point[] = points.map(([x, y]) => [
        toPdfX(x, bounds, scale, offsetX),
        toPdfY(y, bounds, pageHeight, scale, offsetY),
    ]);

    let color = COLORS['flow'];
    let dash: number[] | undefined;
    let thickness = STROKE_WIDTH;

    // Dashing marks resource assignment only; flows are solid whatever their
    // kind, and are told apart by their routing.
    if (conn.isCrossSystem) {
        color = COLORS['crossSystem'];
    } else if (conn.isUsage) {
        color = COLORS['usage'];
        dash = [6, 4];
    } else if (conn.flowType === 'alternativeFlow') {
        color = COLORS['alternativeFlow'];
    } else if (conn.flowType === 'parallelFlow') {
        color = COLORS['parallelFlow'];
    }

    drawPolyline(page, pdfPts, color, thickness, dash);

    // Arrowhead at last segment
    const tip = pdfPts[pdfPts.length - 1];
    const prev = pdfPts[pdfPts.length - 2];
    drawArrowhead(page, tip, prev, color);

    // Usage gets arrowhead at start too
    if (conn.isUsage && pdfPts.length >= 2) {
        drawArrowhead(page, pdfPts[0], pdfPts[1], color);
    }
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Render a DiagramLayout as a PDF document.
 *
 * Uses the same positions and shapes as the SVG renderer so
 * the output matches the preview exactly.
 */
export async function exportPdf(diagram: DiagramLayout, options?: PdfOptions): Promise<Uint8Array> {
    const pageSize: PageSizeOption = options?.pageSize ?? 'A4';
    const orientation: OrientationOption = options?.orientation ?? 'landscape';
    const author: string | undefined = options?.author;
    const title: string | undefined = options?.title;

    const [pageWidth, pageHeight] = getPageSize(pageSize, orientation);

    const elements = diagram.elements || [];
    const connections = diagram.connections || [];
    const systemLimits = diagram.systemLimits || [];

    // Compute bounds and routing (same as SVG renderer)
    const bounds = computeContentBounds(elements, systemLimits);
    const routed = computeRouting(elements, connections);

    // Compute scale to fit diagram on page with margins
    const margin = 40;
    const availW = pageWidth - 2 * margin;
    const availH = pageHeight - 2 * margin;
    const scaleX = bounds.width > 0 ? availW / bounds.width : 1;
    const scaleY = bounds.height > 0 ? availH / bounds.height : 1;
    const scale = Math.min(scaleX, scaleY, 1); // never upscale

    // Center the diagram on the page
    const scaledW = bounds.width * scale;
    const scaledH = bounds.height * scale;
    const offsetX = margin + (availW - scaledW) / 2;
    const offsetY = margin + (availH - scaledH) / 2;

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    if (title) pdfDoc.setTitle(title);
    pdfDoc.setSubject('VDI 3682 Formalized Process Description');
    pdfDoc.setCreator('FPD Editor');
    if (author) pdfDoc.setAuthor(author);

    // Standard fonts only support WinAnsi encoding; sanitize every string we
    // draw so non-WinAnsi characters become '?' instead of crashing the export.
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const sanitize = makeTextSanitizer(font);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.setFont(font);

    // White background
    page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: COLORS['white'],
    });

    // System limits
    for (const sl of systemLimits) {
        const safeSl = sl.label === undefined ? sl : { ...sl, label: sanitize(sl.label) };
        drawSystemLimit(page, safeSl, bounds, pageHeight, scale, offsetX, offsetY);
    }

    // Connections
    for (const r of routed) {
        drawConnection(page, r, bounds, pageHeight, scale, offsetX, offsetY);
    }

    // Elements (ids and labels sanitized; positions are left untouched)
    for (const el of elements) {
        const safeEl = { ...el, id: sanitize(el.id), label: sanitize(el.label) };
        if (el.type === 'state') {
            drawState(page, safeEl, bounds, pageHeight, scale, offsetX, offsetY);
        } else if (el.type === 'processOperator') {
            drawProcessOperator(page, safeEl, bounds, pageHeight, scale, offsetX, offsetY);
        } else if (el.type === 'technicalResource') {
            drawTechnicalResource(page, safeEl, bounds, pageHeight, scale, offsetX, offsetY);
        }
    }

    return pdfDoc.save();
}
