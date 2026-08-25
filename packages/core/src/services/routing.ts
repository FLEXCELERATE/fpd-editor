/**
 * Shared connection routing and layout utilities.
 *
 * Used by both the SVG renderer and the PDF exporter to compute
 * port positions, orthogonal waypoints, content bounds, and
 * automatic font sizing.
 */

import { LayoutElement, LayoutConnection, SystemLimitRect } from './layout';
import { SYSTEM_LIMIT_LABEL_FONT_SIZE } from './designTokens';
import {
    measureLines,
    measureText,
    stateLabelWidth,
    STATE_LABEL_BLOCK_H,
    STATE_LABEL_GAP,
} from './textMetrics';
import { Obstacle, createRouterGrid, routeConnection, simplify } from './orthogonalRouter';

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

/**
 * What a connection must not be drawn across: every element body, plus every
 * state's label block. Labels are part of the drawing, so treating them as
 * obstacles is what keeps edges from crossing text.
 */
export function collectObstacles(elements: LayoutElement[]): Obstacle[] {
    const obstacles: Obstacle[] = [];
    for (const el of elements) {
        obstacles.push({
            id: el.id,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
        });
        if (el.type !== 'state') {
            continue;
        }
        const labelW = stateLabelWidth(el.id, el.label);
        if (labelW <= 0) {
            continue;
        }
        const right = el.x - STATE_LABEL_GAP;
        obstacles.push({
            id: el.id + '::label',
            x: right - labelW,
            y: el.y - STATE_LABEL_BLOCK_H,
            width: labelW,
            height: STATE_LABEL_BLOCK_H,
        });
    }
    return obstacles;
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

    // Step 4: waypoints, routed around the obstacles rather than straight
    // through them. Longer edges are routed first: they have the least freedom,
    // and the congestion cost then pushes the short ones onto other lanes.
    const obstacles = collectObstacles(elements);
    const portXs: number[] = [];
    const portYs: number[] = [];
    for (let i = 0; i < metas.length; i++) {
        for (const p of [sourcePorts[i], targetPorts[i]]) {
            if (!p) continue;
            portXs.push(p[0]);
            portYs.push(p[1]);
        }
    }
    const grid = createRouterGrid(obstacles, portXs, portYs);

    const order = metas
        .map((_, i) => i)
        .filter((i) => sourcePorts[i] && targetPorts[i])
        .sort((a, b) => {
            const span = (i: number) =>
                Math.abs(sourcePorts[i][0] - targetPorts[i][0]) +
                Math.abs(sourcePorts[i][1] - targetPorts[i][1]);
            return span(b) - span(a);
        });

    const pointsByIndex: Record<number, Point[]> = {};
    for (const i of order) {
        const m = metas[i];
        const sp = sourcePorts[i];
        const tp = targetPorts[i];

        if (m.isDirect) {
            // Alternative flows are drawn as a straight line by definition.
            pointsByIndex[i] = [sp, tp];
            continue;
        }

        // The plain two-or-three-segment route is both the cheapest to compute
        // and the clearest to read, so it is used whenever nothing is in its way.
        // Searching the grid is reserved for edges that actually need to detour.
        // The endpoints' own bodies are touched by definition; their label
        // blocks are not — an edge across its own label reads no better than one
        // across someone else's.
        const own = new Set([m.conn.sourceId, m.conn.targetId]);
        const relevant = obstacles.filter((o) => !own.has(o.id));
        const naive = simplify(orthogonalWaypoints(sp, tp, m.sourceSide, m.targetSide));
        if (!segmentsBlocked(naive, relevant)) {
            pointsByIndex[i] = naive;
            continue;
        }

        const routedPoints = routeConnection(grid, sp, m.sourceSide, tp, m.targetSide);
        pointsByIndex[i] = routedPoints ?? naive;
    }

    const routed: RoutedConnection[] = [];
    for (let i = 0; i < metas.length; i++) {
        const points = pointsByIndex[i];
        if (!points) continue;
        routed.push({ conn: metas[i].conn, points, isDirect: metas[i].isDirect });
    }

    return routed;
}

/** Does any segment of `points` enter an obstacle? */
function segmentsBlocked(points: Point[], obstacles: Obstacle[]): boolean {
    for (let k = 0; k + 1 < points.length; k++) {
        const [x1, y1] = points[k];
        const [x2, y2] = points[k + 1];
        const loX = Math.min(x1, x2);
        const hiX = Math.max(x1, x2);
        const loY = Math.min(y1, y2);
        const hiY = Math.max(y1, y2);
        for (const o of obstacles) {
            if (hiX <= o.x || loX >= o.x + o.width) continue;
            if (hiY <= o.y || loY >= o.y + o.height) continue;
            return true;
        }
    }
    return false;
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
    const allX: number[] = [];
    const allY: number[] = [];
    const allRight: number[] = [];
    const allBottom: number[] = [];

    for (const e of elements) {
        allBottom.push(e.y + e.height);
        if (e.type === 'state') {
            // The label hangs above and to the left of the shape.
            allX.push(e.x - STATE_LABEL_GAP - stateLabelWidth(e.id, e.label));
            allRight.push(e.x + e.width);
            allY.push(e.y - STATE_LABEL_BLOCK_H);
        } else {
            allX.push(e.x);
            allRight.push(e.x + e.width);
            allY.push(e.y);
        }
    }

    for (const sl of systemLimits) {
        allX.push(sl.x);
        allBottom.push(sl.y + sl.height);
        const slLabelW = measureText(sl.label || '', SYSTEM_LIMIT_LABEL_FONT_SIZE);
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
    const needed = measureLines(lines, defaultSize);
    if (needed <= maxWidthPx) return defaultSize;
    if (needed <= 0) return defaultSize;
    return Math.max(minSize, (defaultSize * maxWidthPx) / needed);
}
