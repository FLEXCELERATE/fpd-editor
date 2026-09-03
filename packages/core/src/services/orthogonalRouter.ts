/**
 * Obstacle-aware orthogonal edge router.
 *
 * The previous router placed the bend of every edge at the midpoint between its
 * two ports without looking at what was in between, so an edge spanning several
 * ranks was drawn straight through every box on the way, and horizontal runs
 * landed inside a row of operators instead of in the gap between rows.
 *
 * This router searches a Hanan grid — the lines through every obstacle edge plus
 * every port coordinate — for a shortest orthogonal path that crosses no
 * obstacle. Obstacles are the element boxes *and* the state label blocks, so a
 * connection is not drawn across a label either.
 *
 * Costs: length, plus a penalty per bend so routes stay simple, plus a
 * congestion penalty for grid segments already used by earlier edges, which
 * spreads parallel connections onto neighbouring lanes instead of stacking them
 * on top of each other.
 */

export type Point = [number, number];

export interface Obstacle {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Distance routes keep from an obstacle. */
const CLEARANCE = 7;

/** Extra lanes reserved outside the content, for edges that must detour. */
const OUTER_LANES = 4;
const OUTER_LANE_STEP = 22;

const BEND_COST = 90;
const CONGESTION_COST = 55;

/**
 * Penalty for running through a point another connection already passes through
 * at right angles. Crossings are what make a dense diagram hard to follow, and
 * unlike overlap they cost nothing to the router unless they are priced in.
 */
const CROSSING_COST = 400;

interface Axis {
    /** Sorted, de-duplicated coordinates. */
    values: number[];
    index: Map<number, number>;
}

export interface RouterGrid {
    xAxis: Axis;
    yAxis: Axis;
    /** Segment from (x[i], y[j]) to (x[i+1], y[j]) is free. */
    freeH: Uint8Array;
    /** Segment from (x[i], y[j]) to (x[i], y[j+1]) is free. */
    freeV: Uint8Array;
    /** Segments already carrying a connection, per direction. */
    useH: Uint16Array;
    useV: Uint16Array;
    /** Nodes a connection already runs through, per direction. */
    nodeH: Uint16Array;
    nodeV: Uint16Array;
    obstacles: Obstacle[];
    /**
     * Search scratch, reused across routes. Every entry is stamped with the
     * search that wrote it, so a new search starts clean without clearing
     * megabytes of arrays per edge.
     */
    scratch: {
        dist: Float64Array;
        prev: Int32Array;
        stamp: Int32Array;
        closed: Int32Array;
        generation: number;
    };
}

/**
 * Grid coordinates are rounded so near-identical values collapse to one line.
 * Obstacle bounds go through the same rounding, so a line lying on an edge
 * compares exactly equal to it instead of missing by a rounding error.
 */
function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function makeAxis(raw: number[]): Axis {
    const values = Array.from(new Set(raw.map(round2))).sort((a, b) => a - b);
    const index = new Map<number, number>();
    for (let i = 0; i < values.length; i++) {
        index.set(values[i], i);
    }
    return { values, index };
}

function nearestIndex(axis: Axis, value: number): number {
    const v = Math.round(value * 100) / 100;
    const hit = axis.index.get(v);
    if (hit !== undefined) {
        return hit;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < axis.values.length; i++) {
        const d = Math.abs(axis.values[i] - v);
        if (d < bestDist) {
            bestDist = d;
            best = i;
        }
    }
    return best;
}

/** An obstacle's edges, rounded onto the grid. */
interface Bounds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

function toBounds(obstacles: Obstacle[]): Bounds[] {
    return obstacles.map((o) => ({
        x1: round2(o.x),
        y1: round2(o.y),
        x2: round2(o.x + o.width),
        y2: round2(o.y + o.height),
    }));
}

/** Does the horizontal segment at `y` from `x1` to `x2` enter any obstacle? */
function horizontalBlocked(bounds: Bounds[], y: number, x1: number, x2: number): boolean {
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    for (const b of bounds) {
        if (y <= b.y1 || y >= b.y2) continue;
        if (hi <= b.x1 || lo >= b.x2) continue;
        return true;
    }
    return false;
}

/** Does the vertical segment at `x` from `y1` to `y2` touch any obstacle? */
function verticalBlocked(bounds: Bounds[], x: number, y1: number, y2: number): boolean {
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    for (const b of bounds) {
        if (x <= b.x1 || x >= b.x2) continue;
        if (hi <= b.y1 || lo >= b.y2) continue;
        return true;
    }
    return false;
}

export function createRouterGrid(
    obstacles: Obstacle[],
    portXs: number[],
    portYs: number[],
): RouterGrid {
    const xs: number[] = [...portXs];
    const ys: number[] = [...portYs];

    for (const o of obstacles) {
        xs.push(o.x - CLEARANCE, o.x + o.width + CLEARANCE);
        ys.push(o.y - CLEARANCE, o.y + o.height + CLEARANCE);
    }

    if (obstacles.length > 0) {
        const minX = Math.min(...obstacles.map((o) => o.x));
        const maxX = Math.max(...obstacles.map((o) => o.x + o.width));
        const minY = Math.min(...obstacles.map((o) => o.y));
        const maxY = Math.max(...obstacles.map((o) => o.y + o.height));
        for (let k = 1; k <= OUTER_LANES; k++) {
            xs.push(minX - CLEARANCE - k * OUTER_LANE_STEP);
            xs.push(maxX + CLEARANCE + k * OUTER_LANE_STEP);
            ys.push(minY - CLEARANCE - k * OUTER_LANE_STEP);
            ys.push(maxY + CLEARANCE + k * OUTER_LANE_STEP);
        }
    }

    const xAxis = makeAxis(xs);
    const yAxis = makeAxis(ys);
    const nx = xAxis.values.length;
    const ny = yAxis.values.length;

    const freeH = new Uint8Array(nx * ny);
    const freeV = new Uint8Array(nx * ny);
    const bounds = toBounds(obstacles);

    for (let j = 0; j < ny; j++) {
        const y = yAxis.values[j];
        for (let i = 0; i + 1 < nx; i++) {
            if (!horizontalBlocked(bounds, y, xAxis.values[i], xAxis.values[i + 1])) {
                freeH[j * nx + i] = 1;
            }
        }
    }
    for (let i = 0; i < nx; i++) {
        const x = xAxis.values[i];
        for (let j = 0; j + 1 < ny; j++) {
            if (!verticalBlocked(bounds, x, yAxis.values[j], yAxis.values[j + 1])) {
                freeV[j * nx + i] = 1;
            }
        }
    }

    const stateCount = nx * ny * 4;
    return {
        xAxis,
        yAxis,
        freeH,
        freeV,
        useH: new Uint16Array(nx * ny),
        useV: new Uint16Array(nx * ny),
        nodeH: new Uint16Array(nx * ny),
        nodeV: new Uint16Array(nx * ny),
        obstacles,
        scratch: {
            dist: new Float64Array(stateCount),
            prev: new Int32Array(stateCount),
            stamp: new Int32Array(stateCount),
            closed: new Int32Array(stateCount),
            generation: 0,
        },
    };
}

/**
 * Record that a connection runs along `points`, so later routes can be steered
 * away from overlapping or crossing it.
 *
 * Called for every accepted route, including the plain ones that never went
 * through the search. Without that the router would only know about the edges it
 * routed itself — barely half of them on a real diagram — and would happily lay
 * new lines across the rest.
 */
export function markPathOccupancy(grid: RouterGrid, points: Point[]): void {
    const { xAxis, yAxis, useH, useV, nodeH, nodeV } = grid;
    const nx = xAxis.values.length;
    const bump = (arr: Uint16Array, index: number) => {
        if (arr[index] < 0xffff) arr[index] += 1;
    };

    for (let k = 0; k + 1 < points.length; k++) {
        const [x1, y1] = points[k];
        const [x2, y2] = points[k + 1];
        const horizontal = Math.abs(y1 - y2) < 0.01;
        const vertical = Math.abs(x1 - x2) < 0.01;
        // A diagonal (an alternative flow runs straight) occupies no lane.
        if (horizontal === vertical) {
            continue;
        }

        if (horizontal) {
            const j = nearestIndex(yAxis, y1);
            const from = nearestIndex(xAxis, Math.min(x1, x2));
            const to = nearestIndex(xAxis, Math.max(x1, x2));
            for (let i = from; i <= to; i++) {
                bump(nodeH, j * nx + i);
                if (i < to) bump(useH, j * nx + i);
            }
        } else {
            const i = nearestIndex(xAxis, x1);
            const from = nearestIndex(yAxis, Math.min(y1, y2));
            const to = nearestIndex(yAxis, Math.max(y1, y2));
            for (let j = from; j <= to; j++) {
                bump(nodeV, j * nx + i);
                if (j < to) bump(useV, j * nx + i);
            }
        }
    }
}

/** Minimal binary heap over (priority, state) pairs. */
class Heap {
    private prio: number[] = [];
    private item: number[] = [];

    get size(): number {
        return this.prio.length;
    }

    push(priority: number, value: number): void {
        this.prio.push(priority);
        this.item.push(value);
        let i = this.prio.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.prio[parent] <= this.prio[i]) break;
            this.swap(i, parent);
            i = parent;
        }
    }

    pop(): number {
        const top = this.item[0];
        const lastPrio = this.prio.pop() as number;
        const lastItem = this.item.pop() as number;
        if (this.prio.length > 0) {
            this.prio[0] = lastPrio;
            this.item[0] = lastItem;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let small = i;
                if (l < this.prio.length && this.prio[l] < this.prio[small]) small = l;
                if (r < this.prio.length && this.prio[r] < this.prio[small]) small = r;
                if (small === i) break;
                this.swap(i, small);
                i = small;
            }
        }
        return top;
    }

    private swap(a: number, b: number): void {
        const p = this.prio[a];
        this.prio[a] = this.prio[b];
        this.prio[b] = p;
        const it = this.item[a];
        this.item[a] = this.item[b];
        this.item[b] = it;
    }
}

// Directions: 0 = +x, 1 = -x, 2 = +y, 3 = -y
const DIRS: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

function outwardDir(side: string): number {
    if (side === 'right') return 0;
    if (side === 'left') return 1;
    if (side === 'bottom') return 2;
    return 3; // top
}

/**
 * Route one connection. Returns the polyline including both ports, or null when
 * no obstacle-free orthogonal path exists on the grid.
 */
export function routeConnection(
    grid: RouterGrid,
    source: Point,
    sourceSide: string,
    target: Point,
    targetSide: string,
): Point[] | null {
    const { xAxis, yAxis, freeH, freeV, useH, useV } = grid;
    const nx = xAxis.values.length;
    const ny = yAxis.values.length;
    if (nx < 2 || ny < 2) return null;

    const sDir = outwardDir(sourceSide);
    const tDir = outwardDir(targetSide);

    // The first grid node outside the source box, reached by a straight stub.
    const startNode = stubNode(grid, source, sDir);
    const goalNode = stubNode(grid, target, tDir);
    if (startNode === null || goalNode === null) return null;

    const [si, sj] = startNode;
    const [gi, gj] = goalNode;

    const { dist, prev, stamp, closed } = grid.scratch;
    const generation = ++grid.scratch.generation;
    const distanceOf = (state: number) => (stamp[state] === generation ? dist[state] : Infinity);

    const heuristic = (i: number, j: number) =>
        Math.abs(xAxis.values[i] - xAxis.values[gi]) + Math.abs(yAxis.values[j] - yAxis.values[gj]);

    const startState = (sj * nx + si) * 4 + sDir;
    dist[startState] = 0;
    stamp[startState] = generation;
    prev[startState] = -1;
    const heap = new Heap();
    heap.push(heuristic(si, sj), startState);

    let goalState = -1;
    while (heap.size > 0) {
        const state = heap.pop();
        if (closed[state] === generation) continue;
        closed[state] = generation;

        const dir = state & 3;
        const node = state >> 2;
        const i = node % nx;
        const j = (node - i) / nx;

        if (i === gi && j === gj) {
            goalState = state;
            break;
        }

        for (let nd = 0; nd < 4; nd++) {
            // No reversing: an orthogonal route never doubles back on itself.
            if ((nd ^ 1) === dir) continue;
            const [dx, dy] = DIRS[nd];
            const ni = i + dx;
            const nj = j + dy;
            if (ni < 0 || ni >= nx || nj < 0 || nj >= ny) continue;

            const nextNode = nj * nx + ni;
            let ok: boolean;
            let step: number;
            let congestion: number;
            let crossings: number;
            if (dx !== 0) {
                const cell = j * nx + Math.min(i, ni);
                ok = freeH[cell] === 1;
                step = Math.abs(xAxis.values[ni] - xAxis.values[i]);
                congestion = useH[cell];
                // Moving horizontally crosses whatever runs vertically there.
                crossings = grid.nodeV[nextNode];
            } else {
                const cell = Math.min(j, nj) * nx + i;
                ok = freeV[cell] === 1;
                step = Math.abs(yAxis.values[nj] - yAxis.values[j]);
                congestion = useV[cell];
                crossings = grid.nodeH[nextNode];
            }
            if (!ok) continue;

            const cost =
                step +
                (nd === dir ? 0 : BEND_COST) +
                congestion * CONGESTION_COST +
                crossings * CROSSING_COST;
            const nextState = (nj * nx + ni) * 4 + nd;
            const nextDist = distanceOf(state) + cost;
            if (nextDist < distanceOf(nextState)) {
                dist[nextState] = nextDist;
                stamp[nextState] = generation;
                prev[nextState] = state;
                heap.push(nextDist + heuristic(ni, nj), nextState);
            }
        }
    }

    if (goalState < 0) return null;

    const nodes: Point[] = [];
    let cur = goalState;
    while (cur >= 0) {
        const node = cur >> 2;
        const i = node % nx;
        const j = (node - i) / nx;
        nodes.push([xAxis.values[i], yAxis.values[j]]);
        cur = stamp[cur] === generation ? prev[cur] : -1;
    }
    nodes.reverse();

    const points = simplify([source, ...nodes, target]);
    markPathOccupancy(grid, points);
    return points;
}

/**
 * The grid node a port connects to: same coordinate on the axis parallel to the
 * box side, first grid line beyond the port in the outward direction.
 */
function stubNode(grid: RouterGrid, port: Point, dir: number): [number, number] | null {
    const { xAxis, yAxis } = grid;
    // The port's own coordinate is on the grid, and axis values are rounded, so a
    // plain inequality can pick a line that coincides with the port. The stub
    // would then have zero length, `simplify` would drop it, and the segment
    // before it would become the last one — an arrow entering a box's side while
    // running vertically along it. Require a real gap instead.
    const MIN_STUB = 1;
    if (dir === 2 || dir === 3) {
        const i = nearestIndex(xAxis, port[0]);
        const values = yAxis.values;
        if (dir === 2) {
            for (let j = 0; j < values.length; j++) {
                if (values[j] > port[1] + MIN_STUB) return [i, j];
            }
        } else {
            for (let j = values.length - 1; j >= 0; j--) {
                if (values[j] < port[1] - MIN_STUB) return [i, j];
            }
        }
        return null;
    }
    const j = nearestIndex(yAxis, port[1]);
    const values = xAxis.values;
    if (dir === 0) {
        for (let i = 0; i < values.length; i++) {
            if (values[i] > port[0] + MIN_STUB) return [i, j];
        }
    } else {
        for (let i = values.length - 1; i >= 0; i--) {
            if (values[i] < port[0] - MIN_STUB) return [i, j];
        }
    }
    return null;
}

/** Drop duplicate and collinear points. */
export function simplify(points: Point[]): Point[] {
    const out: Point[] = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (last && Math.abs(last[0] - p[0]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01) {
            continue;
        }
        out.push(p);
    }
    const result: Point[] = [];
    for (let i = 0; i < out.length; i++) {
        if (i > 0 && i < out.length - 1) {
            const [ax, ay] = out[i - 1];
            const [bx, by] = out[i];
            const [cx, cy] = out[i + 1];
            const collinearX = Math.abs(ax - bx) < 0.01 && Math.abs(bx - cx) < 0.01;
            const collinearY = Math.abs(ay - by) < 0.01 && Math.abs(by - cy) < 0.01;
            if (collinearX || collinearY) continue;
        }
        result.push(out[i]);
    }
    // Degenerate geometry (two elements at the same position) collapses to a
    // single point. Keep a drawable two-point segment so callers downstream
    // never have to special-case a polyline of length one.
    if (result.length < 2 && points.length >= 2) {
        return [points[0], points[points.length - 1]];
    }
    return result;
}
