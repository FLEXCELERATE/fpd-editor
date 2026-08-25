/**
 * Layout engine that computes x,y positions for VDI 3682 process diagrams.
 *
 * Layout strategy (top-to-bottom, multi-PO):
 * Phase 0: Build connectivity graph
 * Phase 1: Topological sort of POs (vertical stacking order)
 * Phase 2: Classify states into 6 categories (boundary-top/bottom/left/right, internal, disconnected)
 * Phase 3: Assign states to PO rows (Y-level affinity)
 * Phase 4: Compute coordinates
 * Phase 5: Compute system limit
 * Phase 6: Layout disconnected elements
 * Phase 7: Create connections
 */

import { State, ProcessOperator, TechnicalResource, Flow, Usage } from '../models/fpdModel';
import { ProcessModel } from '../models/processModel';

// ---------- Public interfaces ----------

export interface LayoutConfig {
    padding: number;
    hGap: number;
    vGap: number;
    systemLimitPadding: number;
    resourceOffsetX: number;
}

const DEFAULT_PADDING = 40;
const DEFAULT_H_GAP = 40;
const DEFAULT_V_GAP = 80;
const DEFAULT_SYSTEM_LIMIT_PADDING = 50;
const DEFAULT_RESOURCE_OFFSET_X = 40;

export function createLayoutConfig(): LayoutConfig {
    return {
        padding: DEFAULT_PADDING,
        hGap: DEFAULT_H_GAP,
        vGap: DEFAULT_V_GAP,
        systemLimitPadding: DEFAULT_SYSTEM_LIMIT_PADDING,
        resourceOffsetX: DEFAULT_RESOURCE_OFFSET_X,
    };
}

export interface LayoutElement {
    id: string;
    type: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    stateType?: string;
    lineNumber?: number;
}

export interface LayoutConnection {
    id: string;
    sourceId: string;
    targetId: string;
    flowType?: string;
    isUsage: boolean;
    isCrossSystem?: boolean;
    sourceSide?: string;
    targetSide?: string;
    lineNumber?: number;
}

export interface SystemLimitRect {
    id?: string;
    label?: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DiagramLayout {
    elements: LayoutElement[];
    connections: LayoutConnection[];
    systemLimits: SystemLimitRect[];
    systemLimit: SystemLimitRect | null;
}

// ---------- Element sizes (match frontend designTokens) ----------

const STATE_MAX_W = 55;
const STATE_H = 50;
const PROCESS_W = 150;
const PROCESS_H = 80;
const RESOURCE_W = 150;
const RESOURCE_H = 80;

// Internal gap between PO rows with intermediate states
const INTERNAL_V_GAP = 40;

// Extra vertical space when boundary states sit on top/bottom edges
const BOUNDARY_EXTRA_V = 40;

// ---------- Internal types ----------

interface ConnectivityGraph {
    stateToTargetPos: Record<string, string[]>;
    stateToSourcePos: Record<string, string[]>;
    poToInputStates: Record<string, string[]>;
    poToOutputStates: Record<string, string[]>;
    trToPo: Record<string, string>;
    allFlowRefs: Set<string>;
    poIds: Set<string>;
    altFlowOnlySinks: Set<string>;
}

interface StateAffinity {
    category: string;
    affiliatedRank: number;
    /** PO a boundary-left/right state hangs off; undefined for other categories. */
    affiliatedPoId: string | undefined;
    sourceRank: number | undefined;
    targetRank: number | undefined;
}

interface ElementPos {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface BoundsRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SystemResult {
    sid: string | undefined;
    label: string;
    elements: LayoutElement[];
    connections: LayoutConnection[];
    bounds: BoundsRect | null;
}

// ---------- Phase 0: Build connectivity graph ----------

function _buildConnectivityGraph(
    states: State[],
    processOperators: ProcessOperator[],
    flows: Flow[],
    usages: Usage[],
): ConnectivityGraph {
    const poIds = new Set(processOperators.map((p) => p.id));
    const stateIds = new Set(states.map((s) => s.id));
    const allFlowRefs = new Set<string>();

    const stateToTargetPos: Record<string, string[]> = {};
    const stateToSourcePos: Record<string, string[]> = {};
    const poToInputStates: Record<string, string[]> = {};
    const poToOutputStates: Record<string, string[]> = {};

    for (const s of states) {
        stateToTargetPos[s.id] = [];
        stateToSourcePos[s.id] = [];
    }
    for (const p of processOperators) {
        poToInputStates[p.id] = [];
        poToOutputStates[p.id] = [];
    }

    // Track flow types for PO->State flows to detect alt-flow-only sinks
    const stateHasRegularFromPo = new Set<string>();
    const stateHasAltFromPo = new Set<string>();

    for (const flow of flows) {
        allFlowRefs.add(flow.sourceRef);
        allFlowRefs.add(flow.targetRef);

        if (stateIds.has(flow.sourceRef) && poIds.has(flow.targetRef)) {
            stateToTargetPos[flow.sourceRef].push(flow.targetRef);
            poToInputStates[flow.targetRef].push(flow.sourceRef);
        } else if (poIds.has(flow.sourceRef) && stateIds.has(flow.targetRef)) {
            stateToSourcePos[flow.targetRef].push(flow.sourceRef);
            poToOutputStates[flow.sourceRef].push(flow.targetRef);

            if (flow.flowType === 'alternativeFlow') {
                stateHasAltFromPo.add(flow.targetRef);
            } else {
                stateHasRegularFromPo.add(flow.targetRef);
            }
        }
    }

    // Alt-flow-only sinks: states that receive ONLY alternative flows from POs
    const altFlowOnlySinks = new Set<string>();
    for (const sid of stateHasAltFromPo) {
        if (!stateHasRegularFromPo.has(sid)) {
            altFlowOnlySinks.add(sid);
        }
    }

    const trToPo: Record<string, string> = {};
    for (const usage of usages) {
        trToPo[usage.technicalResourceRef] = usage.processOperatorRef;
    }

    return {
        stateToTargetPos,
        stateToSourcePos,
        poToInputStates,
        poToOutputStates,
        trToPo,
        allFlowRefs,
        poIds,
        altFlowOnlySinks,
    };
}

// ---------- Phase 1: Topological sort of POs ----------

function _topologicalSortPos(
    processOperators: ProcessOperator[],
    states: State[],
    graph: ConnectivityGraph,
): [string[], Record<string, number>] {
    const poIds = new Set(processOperators.map((p) => p.id));

    // Build PO precedence graph
    const poSuccessors: Record<string, Set<string>> = {};
    const poPredecessors: Record<string, Set<string>> = {};
    for (const p of processOperators) {
        poSuccessors[p.id] = new Set();
        poPredecessors[p.id] = new Set();
    }

    for (const state of states) {
        const sourcePos = graph.stateToSourcePos[state.id] || [];
        const targetPos = graph.stateToTargetPos[state.id] || [];
        if (sourcePos.length > 0 && targetPos.length > 0) {
            for (const srcPo of sourcePos) {
                for (const tgtPo of targetPos) {
                    if (srcPo !== tgtPo && poIds.has(srcPo) && poIds.has(tgtPo)) {
                        poSuccessors[srcPo].add(tgtPo);
                        poPredecessors[tgtPo].add(srcPo);
                    }
                }
            }
        }
    }

    // Kahn's algorithm with cycle breaking
    const inDegree: Record<string, number> = {};
    for (const p of processOperators) {
        inDegree[p.id] = poPredecessors[p.id].size;
    }

    const poOrder: string[] = [];
    const poRank: Record<string, number> = {};
    const remaining = new Set(processOperators.map((p) => p.id));
    let currentRank = 0;

    while (remaining.size > 0) {
        let ready = Array.from(remaining)
            .filter((pid) => (inDegree[pid] ?? 0) === 0)
            .sort();

        if (ready.length === 0) {
            // Cycle: pick node with lowest in_degree
            const byDegree = Array.from(remaining).sort(
                (a, b) => (inDegree[a] ?? 0) - (inDegree[b] ?? 0) || a.localeCompare(b),
            );
            ready = [byDegree[0]];
        }

        for (const poId of ready) {
            poOrder.push(poId);
            poRank[poId] = currentRank;
            remaining.delete(poId);
            for (const succ of poSuccessors[poId] ?? []) {
                if (remaining.has(succ)) {
                    inDegree[succ] = (inDegree[succ] ?? 1) - 1;
                }
            }
        }

        // One rank per topological wave, not per operator: every PO in `ready`
        // shares a rank so parallel branches can be laid out side by side.
        currentRank += 1;
    }

    return [poOrder, poRank];
}

// ---------- Phase 2: Classify states ----------

function _productBoundarySide(
    isInput: boolean,
    poRank: Record<string, number> | undefined,
    connectedPos: string[],
    maxRank: number,
): string {
    if (isInput) {
        if (poRank && connectedPos.length > 0 && maxRank > 0) {
            const minRank = Math.min(...connectedPos.map((pid) => poRank[pid] ?? 0));
            if (minRank > 0) {
                return 'boundary-left';
            }
        }
        return 'boundary-top';
    } else {
        if (poRank && connectedPos.length > 0 && maxRank > 0) {
            const maxSrcRank = Math.max(...connectedPos.map((pid) => poRank[pid] ?? 0));
            if (maxSrcRank < maxRank) {
                return 'boundary-right';
            }
        }
        return 'boundary-bottom';
    }
}

function _classifyState(
    state: State,
    graph: ConnectivityGraph,
    poRank?: Record<string, number>,
    maxRank: number = 0,
): string {
    if (!graph.allFlowRefs.has(state.id)) {
        return 'disconnected';
    }

    const sourcePos = graph.stateToSourcePos[state.id] || [];
    const targetPos = graph.stateToTargetPos[state.id] || [];
    const isPureSource = targetPos.length > 0 && sourcePos.length === 0;
    const isPureSink = sourcePos.length > 0 && targetPos.length === 0;
    const isIntermediate = sourcePos.length > 0 && targetPos.length > 0;

    // 1. Explicit directional override
    if (state.placement === 'boundary-top') {
        return 'boundary-top';
    }
    if (state.placement === 'boundary-bottom') {
        return 'boundary-bottom';
    }
    if (state.placement === 'boundary-left') {
        return 'boundary-left';
    }
    if (state.placement === 'boundary-right') {
        return 'boundary-right';
    }
    if (state.placement === 'internal') {
        return 'internal';
    }

    // 2. @boundary (auto-detect side)
    if (state.placement === 'boundary') {
        if (isPureSource) {
            if (state.stateType === 'product') {
                return _productBoundarySide(true, poRank, targetPos, maxRank);
            }
            return 'boundary-left';
        }
        if (isPureSink) {
            if (state.stateType === 'product') {
                return _productBoundarySide(false, poRank, sourcePos, maxRank);
            }
            return 'boundary-right';
        }
        if (state.stateType === 'product') {
            return 'boundary-top';
        }
        return 'boundary-left';
    }

    // 3. Fully automatic (placement is undefined)
    if (isIntermediate) {
        return 'internal';
    }

    if (isPureSource) {
        if (state.stateType === 'product') {
            return _productBoundarySide(true, poRank, targetPos, maxRank);
        }
        return 'boundary-left';
    }

    if (isPureSink) {
        if (state.stateType === 'product') {
            return _productBoundarySide(false, poRank, sourcePos, maxRank);
        }
        return 'boundary-right';
    }

    return 'boundary-top';
}

// ---------- Phase 3: Assign state affinities ----------

function _assignStateAffinities(
    states: State[],
    graph: ConnectivityGraph,
    poRank: Record<string, number>,
    maxRank: number = 0,
): Record<string, StateAffinity> {
    const affinities: Record<string, StateAffinity> = {};

    for (const state of states) {
        const category = _classifyState(state, graph, poRank, maxRank);
        const sourcePos = graph.stateToSourcePos[state.id] || [];
        const targetPos = graph.stateToTargetPos[state.id] || [];

        let affiliatedRank = 0;
        let affiliatedPoId: string | undefined = undefined;
        let sourceRank: number | undefined = undefined;
        let targetRank: number | undefined = undefined;

        if (category === 'boundary-left') {
            if (targetPos.length > 0) {
                // Attach to the earliest consuming PO, not just to its rank: a rank
                // can hold several POs once parallel branches are laid out.
                const earliest = _minBy(targetPos, (pid) => poRank[pid] ?? 0);
                affiliatedPoId = earliest;
                affiliatedRank = poRank[earliest] ?? 0;
            }
        } else if (category === 'boundary-right') {
            if (sourcePos.length > 0) {
                const latest = _maxBy(sourcePos, (pid) => poRank[pid] ?? 0);
                affiliatedPoId = latest;
                affiliatedRank = poRank[latest] ?? 0;
            }
        } else if (category === 'internal') {
            if (sourcePos.length > 0) {
                sourceRank = Math.max(...sourcePos.map((pid) => poRank[pid] ?? 0));
            }
            if (targetPos.length > 0) {
                targetRank = Math.min(...targetPos.map((pid) => poRank[pid] ?? 0));
            }
            affiliatedRank = sourceRank !== undefined ? sourceRank : (targetRank ?? 0);
        }

        affinities[state.id] = {
            category,
            affiliatedRank,
            affiliatedPoId,
            sourceRank,
            targetRank,
        };
    }

    return affinities;
}

// ---------- Helpers ----------

function _minBy<T>(items: T[], score: (item: T) => number): T {
    let best = items[0];
    let bestScore = score(best);
    for (const item of items) {
        const s = score(item);
        if (s < bestScore) {
            best = item;
            bestScore = s;
        }
    }
    return best;
}

function _maxBy<T>(items: T[], score: (item: T) => number): T {
    let best = items[0];
    let bestScore = score(best);
    for (const item of items) {
        const s = score(item);
        if (s > bestScore) {
            best = item;
            bestScore = s;
        }
    }
    return best;
}

/**
 * Place `desiredCenters.length` equally sized items as close to their desired
 * centers as possible without overlapping, keeping their relative order.
 *
 * Items are swept in ascending desired order and pushed away from the previous
 * one when they would collide. With `recenter` the packed run is shifted back
 * so it stays centered on the mean desired position (the sweep itself only ever
 * pushes in the positive direction). Returns leading edges in input order.
 */
function _packRow(
    desiredCenters: number[],
    itemSize: number,
    gap: number,
    recenter: boolean = true,
): number[] {
    const n = desiredCenters.length;
    if (n === 0) {
        return [];
    }

    const order = desiredCenters
        .map((_, i) => i)
        .sort((a, b) => desiredCenters[a] - desiredCenters[b] || a - b);

    const leading = new Array<number>(n);
    let cursor = Number.NEGATIVE_INFINITY;
    for (const i of order) {
        const pos = Math.max(desiredCenters[i] - itemSize / 2, cursor);
        leading[i] = pos;
        cursor = pos + itemSize + gap;
    }

    if (!recenter) {
        return leading;
    }

    const meanDesired = desiredCenters.reduce((a, b) => a + b, 0) / n;
    const runStart = leading[order[0]];
    const runEnd = leading[order[n - 1]] + itemSize;
    const shift = meanDesired - (runStart + runEnd) / 2;
    return leading.map((pos) => pos + shift);
}

function _distributeCentered(
    count: number,
    itemSize: number,
    gap: number,
    centerPos: number,
): number[] {
    if (count === 0) {
        return [];
    }
    const total = count * itemSize + (count - 1) * gap;
    const start = centerPos - total / 2;
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
        result.push(start + i * (itemSize + gap));
    }
    return result;
}

// ---------- Phase 4a: Group classified states by category ----------

interface ClassifiedStates {
    boundaryTop: State[];
    boundaryBottom: State[];
    /** boundary-left states keyed by the PO they hang off. */
    boundaryLeft: Record<string, State[]>;
    /** boundary-right states keyed by the PO they hang off. */
    boundaryRight: Record<string, State[]>;
    /**
     * Forward-edge internal states keyed by the rank of their source PO: every
     * such state is drawn in the single intermediate band below that rank, so the
     * band — not the source/target rank pair — is what decides placement.
     */
    internalsByBand: Record<number, State[]>;
    backwardInternals: State[];
    disconnectedStates: State[];
    hasIntermediatesBelow: Set<number>;
}

function _groupStatesByCategory(
    states: State[],
    affinities: Record<string, StateAffinity>,
): ClassifiedStates {
    const boundaryTop: State[] = [];
    const boundaryBottom: State[] = [];
    const boundaryLeft: Record<string, State[]> = {};
    const boundaryRight: Record<string, State[]> = {};
    const internalStates: State[] = [];
    const disconnectedStates: State[] = [];

    for (const state of states) {
        const aff = affinities[state.id];
        if (!aff) {
            disconnectedStates.push(state);
            continue;
        }
        const cat = aff.category;
        if (cat === 'boundary-top') {
            boundaryTop.push(state);
        } else if (cat === 'boundary-bottom') {
            boundaryBottom.push(state);
        } else if (cat === 'boundary-left') {
            const key = aff.affiliatedPoId;
            if (key === undefined) {
                disconnectedStates.push(state);
                continue;
            }
            if (!boundaryLeft[key]) {
                boundaryLeft[key] = [];
            }
            boundaryLeft[key].push(state);
        } else if (cat === 'boundary-right') {
            const key = aff.affiliatedPoId;
            if (key === undefined) {
                disconnectedStates.push(state);
                continue;
            }
            if (!boundaryRight[key]) {
                boundaryRight[key] = [];
            }
            boundaryRight[key].push(state);
        } else if (cat === 'internal') {
            internalStates.push(state);
        } else {
            disconnectedStates.push(state);
        }
    }

    const internalsByBand: Record<number, State[]> = {};
    const backwardInternals: State[] = [];
    for (const state of internalStates) {
        const aff = affinities[state.id];
        const sRank = aff.sourceRank !== undefined ? aff.sourceRank : aff.affiliatedRank;
        const tRank = aff.targetRank !== undefined ? aff.targetRank : sRank + 1;
        if (sRank < tRank) {
            if (!internalsByBand[sRank]) {
                internalsByBand[sRank] = [];
            }
            internalsByBand[sRank].push(state);
        } else {
            backwardInternals.push(state);
        }
    }

    const hasIntermediatesBelow = new Set<number>(
        Object.keys(internalsByBand).map((rank) => parseInt(rank, 10)),
    );

    return {
        boundaryTop,
        boundaryBottom,
        boundaryLeft,
        boundaryRight,
        internalsByBand,
        backwardInternals,
        disconnectedStates,
        hasIntermediatesBelow,
    };
}

// ---------- Phase 5: System limit computation and boundary placement ----------

function _computeSystemLimitAndPlaceBoundaries(
    coreElements: LayoutElement[],
    classified: ClassifiedStates,
    config: LayoutConfig,
    sideStateY: Record<string, number>,
    startY: number,
    coreLeftX: number,
): { systemLimit: BoundsRect; boundaryElements: LayoutElement[] } | null {
    const { boundaryTop, boundaryBottom, boundaryLeft, boundaryRight } = classified;
    const hasBoundaries =
        coreElements.length > 0 || boundaryTop.length > 0 || boundaryBottom.length > 0;
    if (!hasBoundaries) {
        return null;
    }

    const slp = config.systemLimitPadding;
    let slMinX: number, slMinY: number, slMaxX: number, slMaxY: number;

    if (coreElements.length > 0) {
        slMinX = Math.min(...coreElements.map((e) => e.x));
        slMinY = Math.min(...coreElements.map((e) => e.y));
        slMaxX = Math.max(...coreElements.map((e) => e.x + e.width));
        slMaxY = Math.max(...coreElements.map((e) => e.y + e.height));
    } else {
        slMinX = coreLeftX;
        slMinY = startY;
        slMaxX = coreLeftX + PROCESS_W;
        slMaxY = startY + PROCESS_H;
    }

    // Horizontal space for left/right boundaries
    const hasLeft = Object.values(boundaryLeft).some((v) => v.length > 0);
    const hasRight = Object.values(boundaryRight).some((v) => v.length > 0);
    if (hasLeft) {
        slMinX -= STATE_MAX_W / 2 + config.hGap;
    }
    if (hasRight) {
        slMaxX += STATE_MAX_W / 2 + config.hGap;
    }

    // Horizontal space for top/bottom boundaries
    const topW =
        boundaryTop.length > 0 ? boundaryTop.length * (STATE_MAX_W + config.hGap) - config.hGap : 0;
    const botW =
        boundaryBottom.length > 0
            ? boundaryBottom.length * (STATE_MAX_W + config.hGap) - config.hGap
            : 0;
    const maxBw = Math.max(topW, botW);
    const coreW = slMaxX - slMinX;
    if (maxBw > coreW) {
        const extra = (maxBw - coreW) / 2;
        slMinX -= extra;
        slMaxX += extra;
    }

    // Vertical space for top/bottom boundaries
    if (boundaryTop.length > 0) {
        slMinY -= BOUNDARY_EXTRA_V;
    }
    if (boundaryBottom.length > 0) {
        slMaxY += BOUNDARY_EXTRA_V;
    }

    // Expand for left/right boundary state positions
    const allSideStates: State[] = [
        ...Object.values(boundaryLeft).flat(),
        ...Object.values(boundaryRight).flat(),
    ];
    for (const state of allSideStates) {
        const y = sideStateY[state.id];
        if (y === undefined) {
            continue;
        }
        slMinY = Math.min(slMinY, y);
        slMaxY = Math.max(slMaxY, y + STATE_H);
    }

    const systemLimit: BoundsRect = {
        x: slMinX - slp,
        y: slMinY - slp,
        width: slMaxX - slMinX + slp * 2,
        height: slMaxY - slMinY + slp * 2,
    };

    // Place boundary states on system limit edges
    const boundaryElements: LayoutElement[] = [];
    const slLeft = systemLimit.x;
    const slRight = systemLimit.x + systemLimit.width;
    const slTop = systemLimit.y;
    const slBottom = systemLimit.y + systemLimit.height;
    const slCenterX = slLeft + systemLimit.width / 2;

    function pushStateElements(states: State[], xs: number[], y: number) {
        for (let i = 0; i < states.length; i++) {
            const s = states[i];
            boundaryElements.push({
                id: s.id,
                type: 'state',
                label: s.label,
                x: xs[i],
                y,
                width: STATE_MAX_W,
                height: STATE_H,
                stateType: s.stateType,
                lineNumber: s.lineNumber,
            });
        }
    }

    if (boundaryTop.length > 0) {
        pushStateElements(
            boundaryTop,
            _distributeCentered(boundaryTop.length, STATE_MAX_W, config.hGap, slCenterX),
            slTop - STATE_H / 2,
        );
    }
    if (boundaryBottom.length > 0) {
        pushStateElements(
            boundaryBottom,
            _distributeCentered(boundaryBottom.length, STATE_MAX_W, config.hGap, slCenterX),
            slBottom - STATE_H / 2,
        );
    }

    function pushSideStates(byPo: Record<string, State[]>, x: number) {
        for (const sideStates of Object.values(byPo)) {
            for (const s of sideStates) {
                boundaryElements.push({
                    id: s.id,
                    type: 'state',
                    label: s.label,
                    x,
                    y: sideStateY[s.id] ?? startY,
                    width: STATE_MAX_W,
                    height: STATE_H,
                    stateType: s.stateType,
                    lineNumber: s.lineNumber,
                });
            }
        }
    }

    pushSideStates(boundaryLeft, slLeft - STATE_MAX_W / 2);
    pushSideStates(boundaryRight, slRight - STATE_MAX_W / 2);

    return { systemLimit, boundaryElements };
}

// ---------- Phase 6: Create connections with routing hints ----------

function _createConnections(
    flows: Flow[],
    usages: Usage[],
    boundaryTopIds: Set<string>,
    boundaryBottomIds: Set<string>,
    backwardIds: Set<string>,
): LayoutConnection[] {
    const connections: LayoutConnection[] = [];

    for (const flow of flows) {
        const conn: LayoutConnection = {
            id: flow.id,
            sourceId: flow.sourceRef,
            targetId: flow.targetRef,
            flowType: flow.flowType,
            isUsage: false,
            lineNumber: flow.lineNumber,
        };

        if (boundaryTopIds.has(flow.sourceRef)) {
            conn.sourceSide = 'bottom';
        }
        if (boundaryBottomIds.has(flow.targetRef)) {
            conn.targetSide = 'top';
        }

        if (backwardIds.has(flow.targetRef)) {
            conn.sourceSide = 'left';
            conn.targetSide = 'bottom';
        } else if (backwardIds.has(flow.sourceRef)) {
            conn.sourceSide = 'top';
            conn.targetSide = 'left';
        }

        connections.push(conn);
    }

    for (const usage of usages) {
        connections.push({
            id: usage.id,
            sourceId: usage.processOperatorRef,
            targetId: usage.technicalResourceRef,
            isUsage: true,
            lineNumber: usage.lineNumber,
        });
    }

    return connections;
}

// ---------- Single-system layout (orchestrator) ----------

/**
 * Layout for a system that contains only technical resources (no states and
 * no process operators): stack the resources vertically and wrap them in a
 * system limit box so the system still renders.
 */
function _computeResourceOnlyLayout(
    technicalResources: TechnicalResource[],
    flows: Flow[],
    usages: Usage[],
    config: LayoutConfig,
    offsetX: number,
    offsetY: number,
): [LayoutElement[], LayoutConnection[], BoundsRect | null] {
    const startX = offsetX + config.padding;
    const startY = offsetY + config.padding;
    const slp = config.systemLimitPadding;

    const elements: LayoutElement[] = [];
    for (let i = 0; i < technicalResources.length; i++) {
        const tr = technicalResources[i];
        elements.push({
            id: tr.id,
            type: 'technicalResource',
            label: tr.label,
            x: startX + slp,
            y: startY + slp + i * (RESOURCE_H + config.hGap),
            width: RESOURCE_W,
            height: RESOURCE_H,
            lineNumber: tr.lineNumber,
        });
    }

    const systemLimit: BoundsRect = {
        x: startX,
        y: startY,
        width: RESOURCE_W + 2 * slp,
        height: technicalResources.length * (RESOURCE_H + config.hGap) - config.hGap + 2 * slp,
    };

    const connections = _createConnections(
        flows,
        usages,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
    );

    return [elements, connections, systemLimit];
}

function _computeSingleSystemLayout(
    states: State[],
    processOperators: ProcessOperator[],
    technicalResources: TechnicalResource[],
    flows: Flow[],
    usages: Usage[],
    config: LayoutConfig,
    offsetX: number = 0,
    offsetY: number = 0,
): [LayoutElement[], LayoutConnection[], BoundsRect | null] {
    if (states.length === 0 && processOperators.length === 0) {
        if (technicalResources.length === 0) {
            return [[], [], null];
        }
        return _computeResourceOnlyLayout(
            technicalResources,
            flows,
            usages,
            config,
            offsetX,
            offsetY,
        );
    }

    // Phase 0–3: Build graph, topological sort, classify states
    const graph = _buildConnectivityGraph(states, processOperators, flows, usages);
    // POs with no flow and no usage get their own row below the graph further down;
    // keeping them out of the ranks stops them from being pulled into rank 0 (they
    // have no predecessors) and sitting among unrelated connected operators.
    const usagePoIds = new Set(Object.values(graph.trToPo));
    const _isConnectedPo = (p: ProcessOperator): boolean =>
        graph.allFlowRefs.has(p.id) || usagePoIds.has(p.id);
    const rankedPos = processOperators.filter(_isConnectedPo);
    const [poOrder, poRank] = _topologicalSortPos(rankedPos, states, graph);
    const rankValues = Object.values(poRank);
    const maxRank = rankValues.length > 0 ? Math.max(...rankValues) : -1;
    const affinities = _assignStateAffinities(states, graph, poRank, maxRank);
    const classified = _groupStatesByCategory(states, affinities);

    const { boundaryLeft, internalsByBand, backwardInternals, disconnectedStates } = classified;
    const elements: LayoutElement[] = [];

    // Phase 4: Compute coordinates
    const startX = offsetX + config.padding;
    const startY = offsetY + config.padding;
    const topBoundaryHeight = classified.boundaryTop.length > 0 ? STATE_H + config.vGap : 0;
    let currentY = startY + topBoundaryHeight;

    // 4a) Group POs into topological ranks, then compute row Y positions.
    // A rank holds every PO of one topological wave; they are laid out side by
    // side in 4b, so anything derived per rank has to account for all of them.
    const posByRank: Record<number, string[]> = {};
    for (const poId of poOrder) {
        const rank = poRank[poId] ?? 0;
        if (!posByRank[rank]) {
            posByRank[rank] = [];
        }
        posByRank[rank].push(poId);
    }

    /** Total number of side-boundary states hanging off a whole rank. */
    function _sideCountOfRank(rank: number, byPo: Record<string, State[]>): number {
        let total = 0;
        for (const poId of posByRank[rank] ?? []) {
            total += (byPo[poId] ?? []).length;
        }
        return total;
    }

    const poRowY: Record<number, number> = {};
    for (let rank = 0; rank <= maxRank; rank++) {
        // Side states of every PO in the rank share the system limit edge, so
        // they stack instead of overlapping: the row must fit their sum.
        const leftCount = _sideCountOfRank(rank, boundaryLeft);
        const rightCount = _sideCountOfRank(rank, classified.boundaryRight);
        const maxSideCount = Math.max(leftCount, rightCount);
        const sideHeight =
            maxSideCount > 0 ? maxSideCount * (STATE_H + config.hGap) - config.hGap : 0;
        const rowHeight = Math.max(PROCESS_H, sideHeight);

        poRowY[rank] = currentY + (rowHeight - PROCESS_H) / 2;
        currentY += rowHeight;

        if (classified.hasIntermediatesBelow.has(rank)) {
            currentY += INTERNAL_V_GAP + STATE_H + INTERNAL_V_GAP;
        } else if (rank < maxRank) {
            currentY += config.vGap;
        }
    }

    // Side-boundary states sit on the left/right system limit edge, so their x is
    // fixed and only y distinguishes them. Walk the rank's POs in layout order and
    // give each PO's states a contiguous vertical block, so a rank with several
    // POs no longer piles all of their side states on one row center.
    const sideStateY: Record<string, number> = {};
    for (let rank = 0; rank <= maxRank; rank++) {
        const group = posByRank[rank] ?? [];
        const rowCenterY = (poRowY[rank] ?? startY) + PROCESS_H / 2;
        for (const byPo of [boundaryLeft, classified.boundaryRight]) {
            const ordered: State[] = [];
            for (const poId of group) {
                ordered.push(...(byPo[poId] ?? []));
            }
            const ys = _distributeCentered(ordered.length, STATE_H, config.hGap, rowCenterY);
            for (let i = 0; i < ordered.length; i++) {
                sideStateY[ordered[i].id] = ys[i];
            }
        }
    }

    // 4b) Position POs: one row per rank, POs of a rank spread horizontally
    let leftSpace = 0;
    if (Object.keys(boundaryLeft).length > 0) {
        leftSpace += STATE_MAX_W + config.hGap;
    }
    if (backwardInternals.length > 0) {
        leftSpace += STATE_MAX_W + config.hGap;
    }
    const coreLeftX = startX + leftSpace;

    // The core is as wide as its widest rank; every rank is centered in it.
    let maxRankWidth = PROCESS_W;
    for (let rank = 0; rank <= maxRank; rank++) {
        const count = (posByRank[rank] ?? []).length;
        if (count > 0) {
            const width = count * PROCESS_W + (count - 1) * config.hGap;
            maxRankWidth = Math.max(maxRankWidth, width);
        }
    }
    const poCenterX = coreLeftX + maxRankWidth / 2;

    const poById = new Map(rankedPos.map((p) => [p.id, p]));
    const poElements: Record<string, LayoutElement> = {};
    for (let rank = 0; rank <= maxRank; rank++) {
        const group = posByRank[rank] ?? [];
        const xs = _distributeCentered(group.length, PROCESS_W, config.hGap, poCenterX);
        for (let i = 0; i < group.length; i++) {
            const po = poById.get(group[i])!;
            const el: LayoutElement = {
                id: po.id,
                type: 'processOperator',
                label: po.label,
                x: xs[i],
                y: poRowY[rank] ?? startY,
                width: PROCESS_W,
                height: PROCESS_H,
                lineNumber: po.lineNumber,
            };
            elements.push(el);
            poElements[po.id] = el;
        }
    }

    /** Horizontal center of a set of POs, or undefined if none are placed. */
    function _centerOfPos(poIds: string[]): number | undefined {
        let sum = 0;
        let count = 0;
        for (const id of poIds) {
            const el = poElements[id];
            if (el) {
                sum += el.x + el.width / 2;
                count += 1;
            }
        }
        return count > 0 ? sum / count : undefined;
    }

    // 4c) Position forward-edge internal states.
    // All states of a band share one row, so they must be packed together —
    // packing per source/target rank pair would let states of different pairs
    // that happen to land in the same band overlap. Horizontally each state wants
    // to sit between its own source and target POs, wherever in their ranks those
    // sit, so states of unrelated parallel edges no longer share one center.
    for (const [bandStr, bandStates] of Object.entries(internalsByBand)) {
        const sRank = parseInt(bandStr, 10);
        const sourcePOY = poRowY[sRank] ?? startY;
        const nextRowY = poRowY[sRank + 1] ?? startY;
        const midY = (sourcePOY + PROCESS_H + nextRowY) / 2 - STATE_H / 2;

        const desired = bandStates.map((state) => {
            const srcCenter = _centerOfPos(graph.stateToSourcePos[state.id] ?? []);
            const tgtCenter = _centerOfPos(graph.stateToTargetPos[state.id] ?? []);
            if (srcCenter !== undefined && tgtCenter !== undefined) {
                return (srcCenter + tgtCenter) / 2;
            }
            return srcCenter ?? tgtCenter ?? poCenterX;
        });
        const xs = _packRow(desired, STATE_MAX_W, config.hGap);

        for (let i = 0; i < bandStates.length; i++) {
            const s = bandStates[i];
            elements.push({
                id: s.id,
                type: 'state',
                label: s.label,
                x: xs[i],
                y: midY,
                width: STATE_MAX_W,
                height: STATE_H,
                stateType: s.stateType,
                lineNumber: s.lineNumber,
            });
        }
    }

    // 4d) Position backward-edge (feedback) internal states.
    // They all share the single column left of the core, so several feedbacks
    // spanning the same rank interval would land on the same y — pack them.
    const backwardIds = new Set(backwardInternals.map((s) => s.id));
    if (backwardInternals.length > 0) {
        const feedbackX = coreLeftX - STATE_MAX_W - config.hGap;
        const desiredY = backwardInternals.map((state) => {
            const aff = affinities[state.id];
            const sRankVal = aff.sourceRank !== undefined ? aff.sourceRank : 0;
            const tRankVal = aff.targetRank !== undefined ? aff.targetRank : 0;
            const minR = Math.min(sRankVal, tRankVal);
            const maxR = Math.max(sRankVal, tRankVal);
            return ((poRowY[minR] ?? startY) + PROCESS_H + (poRowY[maxR] ?? startY)) / 2;
        });
        // No recentering: only push down where states would collide, so a
        // feedback state stays in the rank interval it belongs to.
        const ys = _packRow(desiredY, STATE_H, config.hGap, false);
        for (let i = 0; i < backwardInternals.length; i++) {
            const state = backwardInternals[i];
            elements.push({
                id: state.id,
                type: 'state',
                label: state.label,
                x: feedbackX,
                y: ys[i],
                width: STATE_MAX_W,
                height: STATE_H,
                stateType: state.stateType,
                lineNumber: state.lineNumber,
            });
        }
    }

    // Phase 5: System limit and boundary state placement
    const internalIds = new Set<string>();
    for (const bandStates of Object.values(internalsByBand)) {
        for (const s of bandStates) {
            internalIds.add(s.id);
        }
    }
    for (const s of backwardInternals) {
        internalIds.add(s.id);
    }

    const coreElements = elements.filter(
        (e) => e.type === 'processOperator' || (e.type === 'state' && internalIds.has(e.id)),
    );

    const slResult = _computeSystemLimitAndPlaceBoundaries(
        coreElements,
        classified,
        config,
        sideStateY,
        startY,
        coreLeftX,
    );
    const systemLimit = slResult?.systemLimit ?? null;
    if (slResult) {
        elements.push(...slResult.boundaryElements);
    }

    // Technical resources
    const trStartX = systemLimit
        ? systemLimit.x + systemLimit.width + config.resourceOffsetX
        : coreLeftX + PROCESS_W + config.resourceOffsetX * 2;

    for (let i = 0; i < technicalResources.length; i++) {
        const tr = technicalResources[i];
        const connectedPoId = graph.trToPo[tr.id];
        const poEl = connectedPoId ? poElements[connectedPoId] : undefined;
        const trY = poEl
            ? poEl.y + (poEl.height - RESOURCE_H) / 2
            : (poRowY[0] ?? startY) + i * (RESOURCE_H + config.hGap);
        elements.push({
            id: tr.id,
            type: 'technicalResource',
            label: tr.label,
            x: trStartX,
            y: trY,
            width: RESOURCE_W,
            height: RESOURCE_H,
            lineNumber: tr.lineNumber,
        });
    }

    // Disconnected elements
    const disconnectedPos = processOperators.filter((p) => !_isConnectedPo(p));
    if (disconnectedStates.length > 0 || disconnectedPos.length > 0) {
        const maxElY =
            elements.length > 0 ? Math.max(...elements.map((e) => e.y + e.height)) : startY;
        const dStartY = maxElY + config.vGap;
        let cx = startX;
        for (const s of disconnectedStates) {
            elements.push({
                id: s.id,
                type: 'state',
                label: s.label,
                x: cx,
                y: dStartY,
                width: STATE_MAX_W,
                height: STATE_H,
                stateType: s.stateType,
                lineNumber: s.lineNumber,
            });
            cx += STATE_MAX_W + config.hGap;
        }
        for (const p of disconnectedPos) {
            elements.push({
                id: p.id,
                type: 'processOperator',
                label: p.label,
                x: cx,
                y: dStartY,
                width: PROCESS_W,
                height: PROCESS_H,
                lineNumber: p.lineNumber,
            });
            cx += PROCESS_W + config.hGap;
        }
    }

    // Phase 6: Connections
    const connections = _createConnections(
        flows,
        usages,
        new Set(classified.boundaryTop.map((s) => s.id)),
        new Set(classified.boundaryBottom.map((s) => s.id)),
        backwardIds,
    );

    return [elements, connections, systemLimit];
}

function _deduplicateElements(elements: LayoutElement[]): LayoutElement[] {
    const seen = new Set<string>();
    const result: LayoutElement[] = [];
    for (const el of elements) {
        if (!seen.has(el.id)) {
            seen.add(el.id);
            result.push(el);
        }
    }
    return result;
}

// ---------- Main layout function ----------

export function computeLayout(model: ProcessModel, config?: LayoutConfig): DiagramLayout {
    if (!config) {
        config = createLayoutConfig();
    }

    // Determine unique system IDs
    const systemIds: (string | undefined)[] = [];
    const systemLabels = new Map<string | undefined, string>();

    for (const sl of model.systemLimits) {
        systemIds.push(sl.id);
        systemLabels.set(sl.id, sl.label);
    }

    const seenIds = new Set<string | undefined>(systemIds);
    const elemLists: Array<Array<State | ProcessOperator | TechnicalResource>> = [
        model.states,
        model.processOperators,
        model.technicalResources,
    ];
    for (const elemList of elemLists) {
        for (const elem of elemList) {
            const sid = elem.systemId;
            if (sid !== undefined && !seenIds.has(sid)) {
                systemIds.push(sid);
                systemLabels.set(sid, sid);
                seenIds.add(sid);
            }
        }
    }

    let hasNone = false;
    for (const elemList of elemLists) {
        for (const elem of elemList) {
            if (elem.systemId === undefined) {
                hasNone = true;
                break;
            }
        }
        if (hasNone) {
            break;
        }
    }
    if (hasNone && !seenIds.has(undefined)) {
        systemIds.push(undefined);
        systemLabels.set(undefined, 'System');
        seenIds.add(undefined);
    }

    if (systemIds.length === 0) {
        systemIds.push(undefined);
        systemLabels.set(undefined, 'System');
    }

    function _filterBySystem<T extends { systemId?: string }>(
        items: T[],
        sid: string | undefined,
    ): T[] {
        return items.filter((item) => item.systemId === sid);
    }

    const systemGap = config.hGap * 3;

    // Element-to-system lookup covering every element type. Used to decide which
    // flows genuinely cross a system boundary.
    const elementSystemMap: Record<string, string | undefined> = {};
    for (const e of model.states) {
        elementSystemMap[e.id] = e.systemId;
    }
    for (const e of model.processOperators) {
        elementSystemMap[e.id] = e.systemId;
    }
    for (const e of model.technicalResources) {
        elementSystemMap[e.id] = e.systemId;
    }

    // A flow is cross-system only when its endpoints belong to different systems.
    // (Previously this used `systemId === undefined`, which wrongly treated every
    // top-level flow as cross-system when the model had no `system` blocks at all,
    // causing each flow to be rendered twice.)
    const crossSystemFlows = model.flows.filter(
        (f) => elementSystemMap[f.sourceRef] !== elementSystemMap[f.targetRef],
    );

    // State-to-system lookup
    const stateSystemMap: Record<string, string> = {};
    for (const s of model.states) {
        if (s.systemId !== undefined) {
            stateSystemMap[s.id] = s.systemId;
        }
    }

    // --- Phase 1: Layout each system at origin (0,0) to get sizes ---

    const systemResults: SystemResult[] = [];

    for (const sid of systemIds) {
        const sysStates = _filterBySystem(model.states, sid);
        const sysProcesses = _filterBySystem(model.processOperators, sid);
        const sysResources = _filterBySystem(model.technicalResources, sid);
        const sysFlows = _filterBySystem(model.flows, sid);
        const sysUsages = _filterBySystem(model.usages, sid);

        if (sysStates.length === 0 && sysProcesses.length === 0 && sysResources.length === 0) {
            continue;
        }

        const [elems, conns, sl] = _computeSingleSystemLayout(
            sysStates,
            sysProcesses,
            sysResources,
            sysFlows,
            sysUsages,
            config,
            0,
            0,
        );

        systemResults.push({
            sid,
            label: systemLabels.get(sid) ?? 'System',
            elements: elems,
            connections: conns,
            bounds: sl,
        });
    }

    // --- Phase 2: Place systems with optimal (dx, dy) offsets ---

    function _getShiftedBounds(sr: SystemResult, dx: number, dy: number): BoundsRect | null {
        const sl = sr.bounds;
        if (sl !== null) {
            return { x: sl.x + dx, y: sl.y + dy, width: sl.width, height: sl.height };
        }
        const elems = sr.elements;
        if (elems.length === 0) {
            return null;
        }
        const minX = Math.min(...elems.map((e) => e.x + dx));
        const minY = Math.min(...elems.map((e) => e.y + dy));
        const maxX = Math.max(...elems.map((e) => e.x + dx + e.width));
        const maxY = Math.max(...elems.map((e) => e.y + dy + e.height));
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    function _boxesOverlap(a: BoundsRect, b: BoundsRect, gap: number): boolean {
        return (
            a.x < b.x + b.width + gap &&
            a.x + a.width + gap > b.x &&
            a.y < b.y + b.height + gap &&
            a.y + a.height + gap > b.y
        );
    }

    function _resolveOverlapsDown(
        sr: SystemResult,
        dx: number,
        dy: number,
        placed: BoundsRect[],
    ): number {
        let box = _getShiftedBounds(sr, dx, dy);
        if (!box) {
            return dy;
        }
        let maxIter = 50;
        let hasOverlap = true;
        while (hasOverlap && maxIter > 0) {
            hasOverlap = false;
            maxIter -= 1;
            for (const p of placed) {
                if (_boxesOverlap(box!, p, systemGap)) {
                    dy += p.y + p.height + systemGap - box!.y;
                    box = _getShiftedBounds(sr, dx, dy);
                    hasOverlap = true;
                    break;
                }
            }
        }
        return dy;
    }

    function _resolveOverlapsRight(
        sr: SystemResult,
        dx: number,
        dy: number,
        placed: BoundsRect[],
    ): number {
        let box = _getShiftedBounds(sr, dx, dy);
        if (!box) {
            return dx;
        }
        let maxIter = 50;
        let hasOverlap = true;
        while (hasOverlap && maxIter > 0) {
            hasOverlap = false;
            maxIter -= 1;
            for (const p of placed) {
                if (_boxesOverlap(box!, p, systemGap)) {
                    dx += p.x + p.width + systemGap - box!.x;
                    box = _getShiftedBounds(sr, dx, dy);
                    hasOverlap = true;
                    break;
                }
            }
        }
        return dx;
    }

    // Element position lookup (absolute positions including offsets)
    const elementPos: Record<string, ElementPos> = {};

    // Offsets per system
    const systemOffset = new Map<string | undefined, [number, number]>();
    const placedBoxes: BoundsRect[] = [];

    // Place first system at origin
    if (systemResults.length > 0) {
        const first = systemResults[0];
        systemOffset.set(first.sid, [0.0, 0.0]);
        for (const el of first.elements) {
            elementPos[el.id] = { x: el.x, y: el.y, w: el.width, h: el.height };
        }
        const box = _getShiftedBounds(first, 0, 0);
        if (box) {
            placedBoxes.push(box);
        }
    }

    for (let i = 1; i < systemResults.length; i++) {
        const sr = systemResults[i];
        const srSid = sr.sid;

        // Find cross-system flows connecting this system to already-placed systems
        const connectedPairs: Array<{ srcId: string; tgtId: string }> = [];
        for (const flow of crossSystemFlows) {
            const sSys = stateSystemMap[flow.sourceRef];
            const tSys = stateSystemMap[flow.targetRef];
            if (tSys === srSid && sSys !== srSid && systemOffset.has(sSys)) {
                connectedPairs.push({ srcId: flow.sourceRef, tgtId: flow.targetRef });
            }
            if (sSys === srSid && tSys !== srSid && systemOffset.has(tSys)) {
                connectedPairs.push({ srcId: flow.targetRef, tgtId: flow.sourceRef });
            }
        }

        function _computeAlignDeltaY(_dx: number): number {
            if (connectedPairs.length === 0) {
                return 0.0;
            }
            let total = 0.0;
            for (const pair of connectedPairs) {
                const placedEl = elementPos[pair.srcId];
                const localEl = sr.elements.find((e) => e.id === pair.tgtId);
                if (placedEl && localEl) {
                    const placedCy = placedEl.y + placedEl.h / 2;
                    const localCy = localEl.y + localEl.height / 2;
                    total += placedCy - localCy;
                }
            }
            return total / connectedPairs.length;
        }

        function _computeMeanDist(dx: number, dy: number): number {
            if (connectedPairs.length === 0) {
                return Infinity;
            }
            let total = 0.0;
            for (const pair of connectedPairs) {
                const placedEl = elementPos[pair.srcId];
                const localEl = sr.elements.find((e) => e.id === pair.tgtId);
                if (placedEl && localEl) {
                    const pcx = placedEl.x + placedEl.w / 2;
                    const pcy = placedEl.y + placedEl.h / 2;
                    const lcx = localEl.x + localEl.width / 2 + dx;
                    const lcy = localEl.y + localEl.height / 2 + dy;
                    total += Math.sqrt((pcx - lcx) ** 2 + (pcy - lcy) ** 2);
                }
            }
            return total / connectedPairs.length;
        }

        let bestDx = 0.0;
        let bestDy = 0.0;

        if (connectedPairs.length > 0) {
            // Find the connected neighbor's X offset
            let neighborDx = 0.0;
            for (const pair of connectedPairs) {
                const placedEl = elementPos[pair.srcId];
                if (placedEl) {
                    const neighborSys = stateSystemMap[pair.srcId];
                    if (neighborSys && systemOffset.has(neighborSys)) {
                        neighborDx = systemOffset.get(neighborSys)![0];
                        break;
                    }
                }
            }

            // Candidate A: Below (same X as neighbor, Y aligned + row offset)
            const alignDyA = _computeAlignDeltaY(neighborDx);
            const candADx = neighborDx;
            let candADy = alignDyA + STATE_H + config.vGap;
            candADy = _resolveOverlapsDown(sr, candADx, candADy, placedBoxes);

            // Candidate B: Right (X = right edge of all placed, Y aligned)
            let rightEdge =
                placedBoxes.length > 0
                    ? Math.max(...placedBoxes.map((b) => b.x + b.width)) + systemGap
                    : 0.0;
            const alignDyB = _computeAlignDeltaY(rightEdge);
            let candBDx = rightEdge;
            let candBDy = alignDyB;
            if (connectedPairs.length > 0) {
                candBDy += STATE_H + config.vGap;
            }
            candBDx = _resolveOverlapsRight(sr, candBDx, candBDy, placedBoxes);
            candBDy = _resolveOverlapsDown(sr, candBDx, candBDy, placedBoxes);

            const distA = _computeMeanDist(candADx, candADy);
            const distB = _computeMeanDist(candBDx, candBDy);

            if (distB < distA) {
                bestDx = candBDx;
                bestDy = candBDy;
            } else {
                bestDx = candADx;
                bestDy = candADy;
            }
        } else {
            // No cross-system connections: place side-by-side to the right
            let rightEdge =
                placedBoxes.length > 0
                    ? Math.max(...placedBoxes.map((b) => b.x + b.width)) + systemGap
                    : 0.0;
            bestDx = rightEdge;
            bestDy = 0.0;
            bestDx = _resolveOverlapsRight(sr, bestDx, bestDy, placedBoxes);
            bestDy = _resolveOverlapsDown(sr, bestDx, bestDy, placedBoxes);
        }

        systemOffset.set(srSid, [bestDx, bestDy]);
        for (const el of sr.elements) {
            elementPos[el.id] = {
                x: el.x + bestDx,
                y: el.y + bestDy,
                w: el.width,
                h: el.height,
            };
        }
        const box = _getShiftedBounds(sr, bestDx, bestDy);
        if (box) {
            placedBoxes.push(box);
        }
    }

    // --- Phase 3: Apply offsets and collect results ---

    const allElements: LayoutElement[] = [];
    const allConnections: LayoutConnection[] = [];
    const systemLimitsResult: SystemLimitRect[] = [];

    for (const sr of systemResults) {
        const offset = systemOffset.get(sr.sid) ?? [0.0, 0.0];
        const [dx, dy] = offset;

        for (const el of sr.elements) {
            const shifted: LayoutElement = { ...el, x: el.x + dx, y: el.y + dy };
            allElements.push(shifted);
        }

        allConnections.push(...sr.connections);

        const sl = sr.bounds;
        if (sl !== null) {
            const shiftedSl: SystemLimitRect = {
                x: sl.x + dx,
                y: sl.y + dy,
                width: sl.width,
                height: sl.height,
                id: sr.sid,
                label: sr.label,
            };
            systemLimitsResult.push(shiftedSl);
        }
    }

    // Build system bounds lookup for source-side detection
    const systemBoundsMap: Record<string, SystemLimitRect> = {};
    for (const slEntry of systemLimitsResult) {
        if (slEntry.id !== undefined) {
            systemBoundsMap[slEntry.id] = slEntry;
        }
    }

    function _crossSystemSourceSide(stateId: string): string {
        const sysId = stateSystemMap[stateId];
        if (!sysId) {
            return 'bottom';
        }
        const bounds = systemBoundsMap[sysId];
        const pos = elementPos[stateId];
        if (!bounds || !pos) {
            return 'bottom';
        }
        const elCx = pos.x + pos.w / 2;
        const thirdW = bounds.width / 3;
        if (elCx < bounds.x + thirdW) {
            return 'left';
        }
        if (elCx > bounds.x + bounds.width - thirdW) {
            return 'right';
        }
        return 'bottom';
    }

    // Cross-system connections
    for (const flow of crossSystemFlows) {
        allConnections.push({
            id: flow.id,
            sourceId: flow.sourceRef,
            targetId: flow.targetRef,
            flowType: flow.flowType,
            isUsage: false,
            isCrossSystem: true,
            sourceSide: _crossSystemSourceSide(flow.sourceRef),
            targetSide: 'top',
        });
    }

    return {
        elements: _deduplicateElements(allElements),
        connections: allConnections,
        systemLimits: systemLimitsResult,
        systemLimit: systemLimitsResult.length > 0 ? systemLimitsResult[0] : null,
    };
}
