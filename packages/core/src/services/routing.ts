/**
 * Shared connection routing and layout utilities.
 *
 * Used by both the SVG renderer and the PDF exporter to compute
 * port positions, orthogonal waypoints, content bounds, and
 * automatic font sizing.
 */

import { LayoutElement, LayoutConnection, SystemLimitRect } from './layout';
import { STATE_LABEL_FONT_SIZE, SYSTEM_LIMIT_LABEL_FONT_SIZE } from './designTokens';

// ---------- Geometry primitives ----------

export type Point = [number, number];

export function centerOf(el: LayoutElement): Point {
    return [el.x + el.width / 2, el.y + el.height / 2];
}

export function determineSide(fromEl: LayoutElement, toEl: LayoutElement): string {
    const [fcx, fcy] = centerOf(fromEl);
    const [tcx, tcy] = centerOf(toEl);
    const dx = tcx - fcx;
    const dy = tcy - fcy;
    if (Math.abs(dy) >= Math.abs(dx)) {
        return dy >= 0 ? 'bottom' : 'top';
    }
    return dx >= 0 ? 'right' : 'left';
}

export function portPosition(el: LayoutElement, side: string, index: number, count: number): Point {
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
    // right
    const sp = h / (count + 1);
    return [x + w, y + sp * (index + 1)];
}

export function orthogonalWaypoints(src: Point, tgt: Point, sSide: string, tSide: string): Point[] {
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

// ---------- Routing computation ----------

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

export interface RoutedConnection {
    conn: LayoutConnection;
    points: Point[];
    isDirect: boolean;
}

export function computeRouting(
    elements: LayoutElement[],
    connections: LayoutConnection[],
): RoutedConnection[] {
    const lookup: Record<string, LayoutElement> = {};
    for (const el of elements) {
        lookup[el.id] = el;
    }

    // Step 1: determine sides
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

    // Step 2: group by (elementId, side)
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

    // Step 3: assign port positions
    const sourcePorts: Record<number, Point> = {};
    const targetPorts: Record<number, Point> = {};

    for (const group of Object.values(portGroups)) {
        const { element: el, side, entries } = group;
        const useY = side === 'left' || side === 'right';

        entries.sort((a, b) => {
            const mA = metas[a.metaIndex];
            const connectedA = a.role === 'source' ? mA.target : mA.source;
            const [cxA, cyA] = centerOf(connectedA);
            const posA = useY ? cyA : cxA;

            const mB = metas[b.metaIndex];
            const connectedB = b.role === 'source' ? mB.target : mB.source;
            const [cxB, cyB] = centerOf(connectedB);
            const posB = useY ? cyB : cxB;

            return posA - posB;
        });

        const count = entries.length;
        for (let idx = 0; idx < entries.length; idx++) {
            const entry = entries[idx];
            const port = portPosition(el, side, idx, count);
            if (entry.role === 'source') {
                sourcePorts[entry.metaIndex] = port;
            } else {
                targetPorts[entry.metaIndex] = port;
            }
        }
    }

    // Step 4: waypoints
    const routed: RoutedConnection[] = [];
    for (let i = 0; i < metas.length; i++) {
        const m = metas[i];
        const sp = sourcePorts[i];
        const tp = targetPorts[i];
        if (!sp || !tp) continue;

        const points = m.isDirect
            ? [sp, tp]
            : orthogonalWaypoints(sp, tp, m.sourceSide, m.targetSide);
        routed.push({ conn: m.conn, points, isDirect: m.isDirect });
    }

    return routed;
}

// ---------- Content bounds ----------

export interface ContentBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function computeContentBounds(
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

// ---------- Font sizing ----------

export function autoFontSize(
    lines: string[],
    maxWidthPx: number,
    defaultSize: number,
    minSize: number = 7,
): number {
    const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), '');
    const needed = longest.length * defaultSize * 0.6;
    if (needed <= maxWidthPx) return defaultSize;
    const scaled = longest.length > 0 ? maxWidthPx / longest.length / 0.6 : defaultSize;
    return Math.max(minSize, scaled);
}
