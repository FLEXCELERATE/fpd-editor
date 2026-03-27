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

import {
    State,
    ProcessOperator,
    TechnicalResource,
    Flow,
    Usage,
} from '../models/fpdModel';
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
    const poIds = new Set(processOperators.map(p => p.id));
    const stateIds = new Set(states.map(s => s.id));
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
    const poIds = new Set(processOperators.map(p => p.id));

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
    const remaining = new Set(processOperators.map(p => p.id));
    let currentRank = 0;

    while (remaining.size > 0) {
        let ready = Array.from(remaining)
            .filter(pid => (inDegree[pid] ?? 0) === 0)
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
            // Each PO gets its own rank so it receives a unique row position.
            currentRank += 1;
        }
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
            const minRank = Math.min(...connectedPos.map(pid => poRank[pid] ?? 0));
            if (minRank > 0) {
                return 'boundary-left';
            }
        }
        return 'boundary-top';
    } else {
        if (poRank && connectedPos.length > 0 && maxRank > 0) {
            const maxSrcRank = Math.max(...connectedPos.map(pid => poRank[pid] ?? 0));
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
        let sourceRank: number | undefined = undefined;
        let targetRank: number | undefined = undefined;

        if (category === 'boundary-left') {
            if (targetPos.length > 0) {
                affiliatedRank = Math.min(...targetPos.map(pid => poRank[pid] ?? 0));
            }
        } else if (category === 'boundary-right') {
            if (sourcePos.length > 0) {
                affiliatedRank = Math.max(...sourcePos.map(pid => poRank[pid] ?? 0));
            }
        } else if (category === 'internal') {
            if (sourcePos.length > 0) {
                sourceRank = Math.max(...sourcePos.map(pid => poRank[pid] ?? 0));
            }
            if (targetPos.length > 0) {
                targetRank = Math.min(...targetPos.map(pid => poRank[pid] ?? 0));
            }
            affiliatedRank = sourceRank !== undefined ? sourceRank : (targetRank ?? 0);
        }

        affinities[state.id] = {
            category,
            affiliatedRank,
            sourceRank,
            targetRank,
        };
    }

    return affinities;
}

// ---------- Helpers ----------

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

// ---------- Single-system layout ----------

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
    const elements: LayoutElement[] = [];
    const connections: LayoutConnection[] = [];

    if (states.length === 0 && processOperators.length === 0) {
        return [elements, connections, null];
    }

    // --- Phase 0 ---
    const graph = _buildConnectivityGraph(states, processOperators, flows, usages);

    // --- Phase 1 ---
    const [poOrder, poRank] = _topologicalSortPos(processOperators, states, graph);
    const rankValues = Object.values(poRank);
    const maxRank = rankValues.length > 0 ? Math.max(...rankValues) : -1;

    // --- Phase 2 + 3 ---
    const affinities = _assignStateAffinities(states, graph, poRank, maxRank);

    // Group states by category
    const boundaryTop: State[] = [];
    const boundaryBottom: State[] = [];
    const boundaryLeft: Record<number, State[]> = {};
    const boundaryRight: Record<number, State[]> = {};
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
            const rank = aff.affiliatedRank;
            if (!boundaryLeft[rank]) { boundaryLeft[rank] = []; }
            boundaryLeft[rank].push(state);
        } else if (cat === 'boundary-right') {
            const rank = aff.affiliatedRank;
            if (!boundaryRight[rank]) { boundaryRight[rank] = []; }
            boundaryRight[rank].push(state);
        } else if (cat === 'internal') {
            internalStates.push(state);
        } else {
            disconnectedStates.push(state);
        }
    }

    // Group internal states by gap (forward-edge only; backward = feedback)
    const internalsByGap: Record<string, State[]> = {};
    const backwardInternals: State[] = [];
    for (const state of internalStates) {
        const aff = affinities[state.id];
        const sRank = aff.sourceRank !== undefined ? aff.sourceRank : aff.affiliatedRank;
        const tRank = aff.targetRank !== undefined ? aff.targetRank : sRank + 1;
        if (sRank < tRank) {
            const key = `${sRank}-${tRank}`;
            if (!internalsByGap[key]) { internalsByGap[key] = []; }
            internalsByGap[key].push(state);
        } else {
            backwardInternals.push(state);
        }
    }

    const hasIntermediatesBelow = new Set<number>();
    for (const key of Object.keys(internalsByGap)) {
        const sRank = parseInt(key.split('-')[0], 10);
        hasIntermediatesBelow.add(sRank);
    }

    // --- Phase 4: Compute coordinates ---

    const startX = offsetX + config.padding;
    const startY = offsetY + config.padding;

    const topBoundaryHeight = boundaryTop.length > 0 ? (STATE_H + config.vGap) : 0;
    let currentY = startY + topBoundaryHeight;

    const poRowY: Record<number, number> = {};
    for (let rank = 0; rank <= maxRank; rank++) {
        const leftCount = (boundaryLeft[rank] || []).length;
        const rightCount = (boundaryRight[rank] || []).length;
        const maxSideCount = Math.max(leftCount, rightCount);
        const sideHeight = maxSideCount > 0 ? maxSideCount * (STATE_H + config.hGap) - config.hGap : 0;
        const rowHeight = Math.max(PROCESS_H, sideHeight);

        poRowY[rank] = currentY + (rowHeight - PROCESS_H) / 2;
        currentY += rowHeight;

        if (hasIntermediatesBelow.has(rank)) {
            currentY += INTERNAL_V_GAP + STATE_H + INTERNAL_V_GAP;
        } else if (rank < maxRank) {
            currentY += config.vGap;
        }
    }

    // Position POs (reserve left space for boundary-left states and feedback lane)
    let leftSpace = 0;
    if (Object.keys(boundaryLeft).length > 0) {
        leftSpace += STATE_MAX_W + config.hGap;
    }
    if (backwardInternals.length > 0) {
        leftSpace += STATE_MAX_W + config.hGap;
    }
    const coreLeftX = startX + leftSpace;
    const poCenterX = coreLeftX + PROCESS_W / 2;

    const poElements: Record<string, LayoutElement> = {};
    for (const poId of poOrder) {
        const po = processOperators.find(p => p.id === poId)!;
        const rank = poRank[poId] ?? 0;
        const y = poRowY[rank] ?? startY;

        const el: LayoutElement = {
            id: po.id,
            type: 'processOperator',
            label: po.label,
            x: coreLeftX,
            y: y,
            width: PROCESS_W,
            height: PROCESS_H,
            lineNumber: po.lineNumber,
        };
        elements.push(el);
        poElements[po.id] = el;
    }

    const disconnectedPos = processOperators.filter(p => !graph.allFlowRefs.has(p.id));

    // Position forward-edge internal states (between PO rows)
    for (const [key, gapStates] of Object.entries(internalsByGap)) {
        const parts = key.split('-');
        const sRank = parseInt(parts[0], 10);
        const tRank = parseInt(parts[1], 10);
        const sourcePOY = poRowY[sRank] ?? startY;
        const nextRowY = poRowY[Math.min(sRank + 1, tRank)] ?? (poRowY[tRank] ?? startY);
        const midY = (sourcePOY + PROCESS_H + nextRowY) / 2 - STATE_H / 2;

        const xs = _distributeCentered(gapStates.length, STATE_MAX_W, config.hGap, poCenterX);

        for (let i = 0; i < gapStates.length; i++) {
            const s = gapStates[i];
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

    // 4d) Position backward-edge (feedback) internal states LEFT of POs, inside the SL
    const backwardIds = new Set(backwardInternals.map(s => s.id));
    if (backwardInternals.length > 0) {
        const feedbackX = coreLeftX - STATE_MAX_W - config.hGap;
        for (const state of backwardInternals) {
            const aff = affinities[state.id];
            const sRankVal = aff.sourceRank !== undefined ? aff.sourceRank : 0;
            const tRankVal = aff.targetRank !== undefined ? aff.targetRank : 0;
            const minR = Math.min(sRankVal, tRankVal);
            const maxR = Math.max(sRankVal, tRankVal);
            const upperY = poRowY[minR] ?? startY;
            const lowerY = poRowY[maxR] ?? startY;
            const midY = (upperY + PROCESS_H + lowerY) / 2 - STATE_H / 2;

            elements.push({
                id: state.id,
                type: 'state',
                label: state.label,
                x: feedbackX,
                y: midY,
                width: STATE_MAX_W,
                height: STATE_H,
                stateType: state.stateType,
                lineNumber: state.lineNumber,
            });
        }
    }

    // --- Phase 5: Compute system limit ---

    const internalIds = new Set(internalStates.map(s => s.id));
    const coreElements = elements.filter(
        e => e.type === 'processOperator' || (e.type === 'state' && internalIds.has(e.id)),
    );

    let systemLimit: BoundsRect | null = null;

    if (coreElements.length > 0 || boundaryTop.length > 0 || boundaryBottom.length > 0) {
        let slMinX: number;
        let slMinY: number;
        let slMaxX: number;
        let slMaxY: number;

        if (coreElements.length > 0) {
            slMinX = Math.min(...coreElements.map(e => e.x));
            slMinY = Math.min(...coreElements.map(e => e.y));
            slMaxX = Math.max(...coreElements.map(e => e.x + e.width));
            slMaxY = Math.max(...coreElements.map(e => e.y + e.height));
        } else {
            slMinX = coreLeftX;
            slMinY = startY;
            slMaxX = coreLeftX + PROCESS_W;
            slMaxY = startY + PROCESS_H;
        }

        const leftValues = Object.values(boundaryLeft);
        const rightValues = Object.values(boundaryRight);
        const maxLeftCount = leftValues.length > 0 ? Math.max(...leftValues.map(v => v.length)) : 0;
        const maxRightCount = rightValues.length > 0 ? Math.max(...rightValues.map(v => v.length)) : 0;
        if (maxLeftCount > 0) {
            slMinX -= STATE_MAX_W / 2 + config.hGap;
        }
        if (maxRightCount > 0) {
            slMaxX += STATE_MAX_W / 2 + config.hGap;
        }

        const topW = boundaryTop.length > 0
            ? boundaryTop.length * (STATE_MAX_W + config.hGap) - config.hGap
            : 0;
        const botW = boundaryBottom.length > 0
            ? boundaryBottom.length * (STATE_MAX_W + config.hGap) - config.hGap
            : 0;
        const maxBw = Math.max(topW, botW);
        const coreW = slMaxX - slMinX;
        if (maxBw > coreW) {
            const extra = (maxBw - coreW) / 2;
            slMinX -= extra;
            slMaxX += extra;
        }

        // Extra vertical space when boundary states sit on top/bottom edges
        if (boundaryTop.length > 0) {
            slMinY -= BOUNDARY_EXTRA_V;
        }
        if (boundaryBottom.length > 0) {
            slMaxY += BOUNDARY_EXTRA_V;
        }

        const slp = config.systemLimitPadding;
        systemLimit = {
            x: slMinX - slp,
            y: slMinY - slp,
            width: slMaxX - slMinX + slp * 2,
            height: slMaxY - slMinY + slp * 2,
        };
    }

    // Position boundary states on system limit edges
    if (systemLimit) {
        const slLeft = systemLimit.x;
        const slRight = systemLimit.x + systemLimit.width;
        const slTop = systemLimit.y;
        const slBottom = systemLimit.y + systemLimit.height;
        const slCenterX = slLeft + systemLimit.width / 2;

        if (boundaryTop.length > 0) {
            const bTopY = slTop - STATE_H / 2;
            const bTopXs = _distributeCentered(boundaryTop.length, STATE_MAX_W, config.hGap, slCenterX);
            for (let i = 0; i < boundaryTop.length; i++) {
                const s = boundaryTop[i];
                elements.push({
                    id: s.id,
                    type: 'state',
                    label: s.label,
                    x: bTopXs[i],
                    y: bTopY,
                    width: STATE_MAX_W,
                    height: STATE_H,
                    stateType: s.stateType,
                    lineNumber: s.lineNumber,
                });
            }
        }

        if (boundaryBottom.length > 0) {
            const bBotY = slBottom - STATE_H / 2;
            const bBotXs = _distributeCentered(boundaryBottom.length, STATE_MAX_W, config.hGap, slCenterX);
            for (let i = 0; i < boundaryBottom.length; i++) {
                const s = boundaryBottom[i];
                elements.push({
                    id: s.id,
                    type: 'state',
                    label: s.label,
                    x: bBotXs[i],
                    y: bBotY,
                    width: STATE_MAX_W,
                    height: STATE_H,
                    stateType: s.stateType,
                    lineNumber: s.lineNumber,
                });
            }
        }

        for (const rankStr of Object.keys(boundaryLeft)) {
            const rank = parseInt(rankStr, 10);
            const leftStates = boundaryLeft[rank];
            const poY = poRowY[rank] ?? startY;
            const rowCenterY = poY + PROCESS_H / 2;
            const ys = _distributeCentered(leftStates.length, STATE_H, config.hGap, rowCenterY);
            const bLeftX = slLeft - STATE_MAX_W / 2;

            for (let i = 0; i < leftStates.length; i++) {
                const s = leftStates[i];
                elements.push({
                    id: s.id,
                    type: 'state',
                    label: s.label,
                    x: bLeftX,
                    y: ys[i],
                    width: STATE_MAX_W,
                    height: STATE_H,
                    stateType: s.stateType,
                    lineNumber: s.lineNumber,
                });
            }
        }

        for (const rankStr of Object.keys(boundaryRight)) {
            const rank = parseInt(rankStr, 10);
            const rightStates = boundaryRight[rank];
            const poY = poRowY[rank] ?? startY;
            const rowCenterY = poY + PROCESS_H / 2;
            const ys = _distributeCentered(rightStates.length, STATE_H, config.hGap, rowCenterY);
            const bRightX = slRight - STATE_MAX_W / 2;

            for (let i = 0; i < rightStates.length; i++) {
                const s = rightStates[i];
                elements.push({
                    id: s.id,
                    type: 'state',
                    label: s.label,
                    x: bRightX,
                    y: ys[i],
                    width: STATE_MAX_W,
                    height: STATE_H,
                    stateType: s.stateType,
                    lineNumber: s.lineNumber,
                });
            }
        }
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
    if (disconnectedStates.length > 0 || disconnectedPos.length > 0) {
        const maxElY = elements.length > 0
            ? Math.max(...elements.map(e => e.y + e.height))
            : startY;
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

    // Connections
    const boundaryTopIds = new Set(boundaryTop.map(s => s.id));
    const boundaryBottomIds = new Set(boundaryBottom.map(s => s.id));

    for (const flow of flows) {
        const conn: LayoutConnection = {
            id: flow.id,
            sourceId: flow.sourceRef,
            targetId: flow.targetRef,
            flowType: flow.flowType,
            isUsage: false,
            lineNumber: flow.lineNumber,
        };

        // Routing hints for boundary-top states: outgoing arrows always from bottom
        if (boundaryTopIds.has(flow.sourceRef)) {
            conn.sourceSide = 'bottom';
        }
        // Routing hints for boundary-bottom states: incoming arrows always from top
        if (boundaryBottomIds.has(flow.targetRef)) {
            conn.targetSide = 'top';
        }

        // Routing hints for feedback connections
        if (backwardIds.has(flow.targetRef)) {
            // PO -> feedback state: exit PO left, enter state bottom
            conn.sourceSide = 'left';
            conn.targetSide = 'bottom';
        } else if (backwardIds.has(flow.sourceRef)) {
            // feedback state -> PO: exit state top, enter PO left
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

export function computeLayout(
    model: ProcessModel,
    config?: LayoutConfig,
): DiagramLayout {
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
        if (hasNone) { break; }
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
        return items.filter(item => item.systemId === sid);
    }

    const systemGap = config.hGap * 3;

    // Cross-system flows (State -> State between different systems)
    const crossSystemFlows = model.flows.filter(f => f.systemId === undefined);

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
        const minX = Math.min(...elems.map(e => e.x + dx));
        const minY = Math.min(...elems.map(e => e.y + dy));
        const maxX = Math.max(...elems.map(e => e.x + dx + e.width));
        const maxY = Math.max(...elems.map(e => e.y + dy + e.height));
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
                const localEl = sr.elements.find(e => e.id === pair.tgtId);
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
                const localEl = sr.elements.find(e => e.id === pair.tgtId);
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
            let rightEdge = placedBoxes.length > 0
                ? Math.max(...placedBoxes.map(b => b.x + b.width)) + systemGap
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
            let rightEdge = placedBoxes.length > 0
                ? Math.max(...placedBoxes.map(b => b.x + b.width)) + systemGap
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
