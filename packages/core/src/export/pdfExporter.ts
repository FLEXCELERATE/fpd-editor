/**
 * PDF exporter that renders a DiagramLayout as a PDF document.
 *
 * Uses the same layout, shapes, and colours as the SVG renderer
 * so the PDF output matches the preview exactly.
 */

import { PDFDocument, PDFPage, rgb, RGB, LineCapStyle } from 'pdf-lib';

import {
    LayoutElement,
    LayoutConnection,
    SystemLimitRect,
    DiagramLayout,
} from '../services/layout';

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
// Colour scheme (matches svgRenderer / frontend designTokens)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): RGB {
    const h = hex.replace('#', '');
    return rgb(
        parseInt(h.substring(0, 2), 16) / 255,
        parseInt(h.substring(2, 4), 16) / 255,
        parseInt(h.substring(4, 6), 16) / 255,
    );
}

const COLORS: Record<string, RGB> = {
    product: hexToRgb('#E51400'),
    energy: hexToRgb('#6E9AD1'),
    information: hexToRgb('#2F4DA1'),
    processOperator: hexToRgb('#11AE4B'),
    technicalResource: hexToRgb('#888889'),
    flow: hexToRgb('#000000'),
    alternativeFlow: hexToRgb('#f5a623'),
    parallelFlow: hexToRgb('#4a90d9'),
    usage: hexToRgb('#888889'),
    crossSystem: hexToRgb('#9b59b6'),
    black: hexToRgb('#000000'),
    white: hexToRgb('#ffffff'),
};

const STROKE_WIDTH = 1.5;
const STATE_LABEL_FONT_SIZE = 11;
const PROCESS_LABEL_FONT_SIZE = 13;
const SYSTEM_LIMIT_LABEL_FONT_SIZE = 12;

// ---------------------------------------------------------------------------
// Page size helpers
// ---------------------------------------------------------------------------

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
// Content bounds (same logic as svgRenderer)
// ---------------------------------------------------------------------------

interface ContentBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

function computeContentBounds(
    elements: LayoutElement[],
    systemLimits: SystemLimitRect[],
): ContentBounds {
    const charW = STATE_LABEL_FONT_SIZE * 0.6;
    const slCharW = SYSTEM_LIMIT_LABEL_FONT_SIZE * 0.6;

    const allX: number[] = [];
    const allY: number[] = [];
    const allRight: number[] = [];
    const allBottom: number[] = [];

    for (const e of elements) {
        allRight.push(e.x + e.width);
        allBottom.push(e.y + e.height);
        if (e.type === 'state') {
            const longest = Math.max(e.id.length, (e.label || '').length);
            const labelWidth = longest * charW;
            const anchorX = e.x + e.width / 2 - 6;
            allX.push(anchorX - labelWidth);
            allY.push(e.y - 35);
        } else {
            allX.push(e.x);
            allY.push(e.y);
        }
    }

    for (const sl of systemLimits) {
        allX.push(sl.x);
        allBottom.push(sl.y + sl.height);
        const slLabelW = (sl.label || '').length * slCharW;
        allRight.push(sl.x + sl.width + slLabelW);
        allY.push(sl.y - SYSTEM_LIMIT_LABEL_FONT_SIZE - 5);
    }

    if (allX.length === 0) {
        return { x: 0, y: 0, width: 800, height: 600 };
    }

    const margin = 50;
    const minX = Math.min(...allX) - margin;
    const minY = Math.min(...allY) - margin;
    const maxX = Math.max(...allRight) + margin;
    const maxY = Math.max(...allBottom) + margin;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Routing (same logic as svgRenderer)
// ---------------------------------------------------------------------------

type Point = [number, number];

function centerOf(el: LayoutElement): Point {
    return [el.x + el.width / 2, el.y + el.height / 2];
}

function determineSide(fromEl: LayoutElement, toEl: LayoutElement): string {
    const [fcx, fcy] = centerOf(fromEl);
    const [tcx, tcy] = centerOf(toEl);
    const dx = tcx - fcx;
    const dy = tcy - fcy;
    if (Math.abs(dy) >= Math.abs(dx)) {
        return dy >= 0 ? 'bottom' : 'top';
    }
    return dx >= 0 ? 'right' : 'left';
}

function portPosition(
    el: LayoutElement,
    side: string,
    index: number,
    count: number,
): Point {
    const { x, y, width: w, height: h } = el;
    if (side === 'top') {
        const sp = w / (count + 1);
        return [x + sp * (index + 1), y];
    }
    if (side === 'bottom') {
        const sp = w / (count + 1);
        return [x + sp * (index + 1), y + h];
    }
    if (side === 'left') {
        const sp = h / (count + 1);
        return [x, y + sp * (index + 1)];
    }
    const sp = h / (count + 1);
    return [x + w, y + sp * (index + 1)];
}

function orthogonalWaypoints(
    src: Point,
    tgt: Point,
    sSide: string,
    tSide: string,
): Point[] {
    const isVSrc = sSide === 'top' || sSide === 'bottom';
    const isVTgt = tSide === 'top' || tSide === 'bottom';

    if (isVSrc && isVTgt) {
        if (src[0] === tgt[0]) return [src, tgt];
        const midY = (src[1] + tgt[1]) / 2;
        return [src, [src[0], midY], [tgt[0], midY], tgt];
    }
    if (!isVSrc && !isVTgt) {
        if (src[1] === tgt[1]) return [src, tgt];
        const midX = (src[0] + tgt[0]) / 2;
        return [src, [midX, src[1]], [midX, tgt[1]], tgt];
    }
    if (isVSrc) return [src, [src[0], tgt[1]], tgt];
    return [src, [tgt[0], src[1]], tgt];
}

interface RoutingMeta {
    conn: LayoutConnection;
    source: LayoutElement;
    target: LayoutElement;
    sourceSide: string;
    targetSide: string;
    isDirect: boolean;
}

interface PortGroupEntry {
    metaIndex: number;
    role: 'source' | 'target';
}

interface PortGroup {
    element: LayoutElement;
    side: string;
    entries: PortGroupEntry[];
}

interface RoutedConnection {
    conn: LayoutConnection;
    points: Point[];
}

function computeRouting(
    elements: LayoutElement[],
    connections: LayoutConnection[],
): RoutedConnection[] {
    const lookup: Record<string, LayoutElement> = {};
    for (const el of elements) lookup[el.id] = el;

    const metas: RoutingMeta[] = [];
    for (const conn of connections) {
        const source = lookup[conn.sourceId];
        const target = lookup[conn.targetId];
        if (!source || !target) continue;
        const sSide = conn.sourceSide || determineSide(source, target);
        const tSide = conn.targetSide || determineSide(target, source);
        const isDirect = (conn.flowType || 'flow') === 'alternativeFlow';
        metas.push({ conn, source, target, sourceSide: sSide, targetSide: tSide, isDirect });
    }

    const portGroups: Record<string, PortGroup> = {};
    for (let i = 0; i < metas.length; i++) {
        const m = metas[i];
        const sKey = `${m.source.id}:${m.sourceSide}`;
        if (!portGroups[sKey]) {
            portGroups[sKey] = { element: m.source, side: m.sourceSide, entries: [] };
        }
        portGroups[sKey].entries.push({ metaIndex: i, role: 'source' });

        const tKey = `${m.target.id}:${m.targetSide}`;
        if (!portGroups[tKey]) {
            portGroups[tKey] = { element: m.target, side: m.targetSide, entries: [] };
        }
        portGroups[tKey].entries.push({ metaIndex: i, role: 'target' });
    }

    const sourcePorts: Record<number, Point> = {};
    const targetPorts: Record<number, Point> = {};

    for (const group of Object.values(portGroups)) {
        const { element: el, side, entries } = group;
        const useY = side === 'left' || side === 'right';
        entries.sort((a, b) => {
            const mA = metas[a.metaIndex];
            const connA = a.role === 'source' ? mA.target : mA.source;
            const mB = metas[b.metaIndex];
            const connB = b.role === 'source' ? mB.target : mB.source;
            return (useY ? centerOf(connA)[1] : centerOf(connA)[0]) -
                   (useY ? centerOf(connB)[1] : centerOf(connB)[0]);
        });
        for (let idx = 0; idx < entries.length; idx++) {
            const entry = entries[idx];
            const port = portPosition(el, side, idx, entries.length);
            if (entry.role === 'source') sourcePorts[entry.metaIndex] = port;
            else targetPorts[entry.metaIndex] = port;
        }
    }

    const routed: RoutedConnection[] = [];
    for (let i = 0; i < metas.length; i++) {
        const m = metas[i];
        const sp = sourcePorts[i];
        const tp = targetPorts[i];
        if (!sp || !tp) continue;
        const points = m.isDirect ? [sp, tp] : orthogonalWaypoints(sp, tp, m.sourceSide, m.targetSide);
        routed.push({ conn: m.conn, points });
    }
    return routed;
}

// ---------------------------------------------------------------------------
// PDF drawing helpers
// ---------------------------------------------------------------------------

/** Transform a diagram-space coordinate to PDF-space (flip Y). */
function toPdfY(diagramY: number, bounds: ContentBounds, pageHeight: number, scale: number, offsetY: number): number {
    return pageHeight - ((diagramY - bounds.y) * scale + offsetY);
}

function toPdfX(diagramX: number, bounds: ContentBounds, scale: number, offsetX: number): number {
    return (diagramX - bounds.x) * scale + offsetX;
}

function autoFontSize(
    lines: string[],
    maxWidthPx: number,
    defaultSize: number,
    minSize: number = 7,
): number {
    const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), '');
    const needed = longest.length * defaultSize * 0.6;
    if (needed <= maxWidthPx) return defaultSize;
    const scaled = longest.length > 0 ? (maxWidthPx / longest.length) / 0.6 : defaultSize;
    return Math.max(minSize, scaled);
}

function drawPolyline(page: PDFPage, pts: Point[], color: RGB, thickness: number, dash?: number[]): void {
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
    const left = [base[0] + px * size / 2, base[1] + py * size / 2];
    const right = [base[0] - px * size / 2, base[1] - py * size / 2];

    const path = `M ${tip[0]} ${tip[1]} L ${left[0]} ${left[1]} L ${right[0]} ${right[1]} Z`;
    page.drawSvgPath(path, { x: 0, y: 0, color, borderColor: color, borderWidth: 0.5 });
}

// ---------------------------------------------------------------------------
// Element renderers
// ---------------------------------------------------------------------------

function drawState(
    page: PDFPage, el: LayoutElement,
    bounds: ContentBounds, pageHeight: number, scale: number, offsetX: number, offsetY: number,
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
        page.drawSvgPath(path, { x: 0, y: 0, color, borderColor: COLORS['black'], borderWidth: STROKE_WIDTH });
    } else if (stateType === 'information') {
        // Hexagon
        const qw = w * 0.25;
        const path = `M ${cx - w / 2 + qw} ${cy + h / 2} L ${cx + w / 2 - qw} ${cy + h / 2} ` +
            `L ${cx + w / 2} ${cy} L ${cx + w / 2 - qw} ${cy - h / 2} ` +
            `L ${cx - w / 2 + qw} ${cy - h / 2} L ${cx - w / 2} ${cy} Z`;
        page.drawSvgPath(path, { x: 0, y: 0, color, borderColor: COLORS['black'], borderWidth: STROKE_WIDTH });
    } else {
        // Circle (product)
        const r = Math.min(w, h) / 2;
        page.drawCircle({ x: cx, y: cy, size: r, color, borderColor: COLORS['black'], borderWidth: STROKE_WIDTH });
    }

    // Labels above shape
    const label = el.label || el.id;
    const hasName = label !== el.id;
    const fontSize = STATE_LABEL_FONT_SIZE * scale;
    const labelX = cx - 6 * scale;

    if (hasName) {
        page.drawText(el.id, { x: labelX - el.id.length * fontSize * 0.5, y: cy + h / 2 + 14 * scale, size: fontSize, color: COLORS['black'] });
        page.drawText(label, { x: labelX - label.length * fontSize * 0.5, y: cy + h / 2 + 3 * scale, size: fontSize, color: COLORS['black'] });
    } else {
        page.drawText(el.id, { x: labelX - el.id.length * fontSize * 0.5, y: cy + h / 2 + 6 * scale, size: fontSize, color: COLORS['black'] });
    }
}

function drawProcessOperator(
    page: PDFPage, el: LayoutElement,
    bounds: ContentBounds, pageHeight: number, scale: number, offsetX: number, offsetY: number,
): void {
    const px = toPdfX(el.x, bounds, scale, offsetX);
    const py = toPdfY(el.y + el.height, bounds, pageHeight, scale, offsetY);
    const w = el.width * scale;
    const h = el.height * scale;

    page.drawRectangle({
        x: px, y: py, width: w, height: h,
        color: COLORS['processOperator'],
        borderColor: COLORS['black'],
        borderWidth: STROKE_WIDTH,
    });

    const label = el.label || el.id;
    const hasName = label !== el.id;
    const lines = hasName ? [el.id, label] : [el.id];
    const fontSize = autoFontSize(lines, w - 12 * scale, PROCESS_LABEL_FONT_SIZE * scale, 7 * scale);
    const cx = px + w / 2;
    const cy = py + h / 2;

    if (hasName) {
        const idW = el.id.length * fontSize * 0.5;
        const labelW = label.length * fontSize * 0.5;
        page.drawText(el.id, { x: cx - idW / 2, y: cy + fontSize * 0.3, size: fontSize, color: COLORS['black'] });
        page.drawText(label, { x: cx - labelW / 2, y: cy - fontSize * 0.9, size: fontSize, color: COLORS['black'] });
    } else {
        const idW = el.id.length * fontSize * 0.5;
        page.drawText(el.id, { x: cx - idW / 2, y: cy - fontSize / 3, size: fontSize, color: COLORS['black'] });
    }
}

function drawTechnicalResource(
    page: PDFPage, el: LayoutElement,
    bounds: ContentBounds, pageHeight: number, scale: number, offsetX: number, offsetY: number,
): void {
    const px = toPdfX(el.x, bounds, scale, offsetX);
    const py = toPdfY(el.y + el.height, bounds, pageHeight, scale, offsetY);
    const w = el.width * scale;
    const h = el.height * scale;

    // Rounded rectangle (pdf-lib drawRectangle doesn't support borderRadius,
    // so we approximate with an SVG path with arcs)
    const r = Math.min(20 * scale, w / 2, h / 2);
    const path = `M ${px + r} ${py} ` +
        `L ${px + w - r} ${py} A ${r} ${r} 0 0 1 ${px + w} ${py + r} ` +
        `L ${px + w} ${py + h - r} A ${r} ${r} 0 0 1 ${px + w - r} ${py + h} ` +
        `L ${px + r} ${py + h} A ${r} ${r} 0 0 1 ${px} ${py + h - r} ` +
        `L ${px} ${py + r} A ${r} ${r} 0 0 1 ${px + r} ${py} Z`;
    page.drawSvgPath(path, {
        x: 0, y: 0,
        color: COLORS['technicalResource'],
        borderColor: COLORS['black'],
        borderWidth: STROKE_WIDTH,
    });

    const label = el.label || el.id;
    const hasName = label !== el.id;
    const lines = hasName ? [el.id, label] : [el.id];
    const fontSize = autoFontSize(lines, w - 24 * scale, PROCESS_LABEL_FONT_SIZE * scale, 7 * scale);
    const cx = px + w / 2;
    const cy = py + h / 2;

    if (hasName) {
        const idW = el.id.length * fontSize * 0.5;
        const labelW = label.length * fontSize * 0.5;
        page.drawText(el.id, { x: cx - idW / 2, y: cy + fontSize * 0.3, size: fontSize, color: COLORS['black'] });
        page.drawText(label, { x: cx - labelW / 2, y: cy - fontSize * 0.9, size: fontSize, color: COLORS['black'] });
    } else {
        const idW = el.id.length * fontSize * 0.5;
        page.drawText(el.id, { x: cx - idW / 2, y: cy - fontSize / 3, size: fontSize, color: COLORS['black'] });
    }
}

function drawSystemLimit(
    page: PDFPage, sl: SystemLimitRect,
    bounds: ContentBounds, pageHeight: number, scale: number, offsetX: number, offsetY: number,
): void {
    const px = toPdfX(sl.x, bounds, scale, offsetX);
    const py = toPdfY(sl.y + sl.height, bounds, pageHeight, scale, offsetY);
    const w = sl.width * scale;
    const h = sl.height * scale;

    page.drawRectangle({
        x: px, y: py, width: w, height: h,
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
    page: PDFPage, routed: RoutedConnection,
    bounds: ContentBounds, pageHeight: number, scale: number, offsetX: number, offsetY: number,
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

    if (conn.isCrossSystem) {
        color = COLORS['crossSystem'];
        dash = [8, 4];
    } else if (conn.isUsage) {
        color = COLORS['usage'];
        dash = [6, 4];
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
export async function exportPdf(
    diagram: DiagramLayout,
    options?: PdfOptions,
): Promise<Uint8Array> {
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

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // White background
    page.drawRectangle({
        x: 0, y: 0, width: pageWidth, height: pageHeight,
        color: COLORS['white'],
    });

    // System limits
    for (const sl of systemLimits) {
        drawSystemLimit(page, sl, bounds, pageHeight, scale, offsetX, offsetY);
    }

    // Connections
    for (const r of routed) {
        drawConnection(page, r, bounds, pageHeight, scale, offsetX, offsetY);
    }

    // Elements
    for (const el of elements) {
        if (el.type === 'state') {
            drawState(page, el, bounds, pageHeight, scale, offsetX, offsetY);
        } else if (el.type === 'processOperator') {
            drawProcessOperator(page, el, bounds, pageHeight, scale, offsetX, offsetY);
        } else if (el.type === 'technicalResource') {
            drawTechnicalResource(page, el, bounds, pageHeight, scale, offsetX, offsetY);
        }
    }

    return pdfDoc.save();
}
