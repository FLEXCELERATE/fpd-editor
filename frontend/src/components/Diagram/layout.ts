/** Client-side auto-layout utility for VDI 3682 diagram elements.
 *
 * Layout strategy (top-to-bottom, multi-PO):
 * Phase 0: Build connectivity graph
 * Phase 1: Topological sort of POs (vertical stacking order)
 * Phase 2: Classify states into 6 categories (boundary-top/bottom/left/right, internal, disconnected)
 * Phase 3: Assign states to PO rows (Y-level affinity)
 * Phase 4: Compute coordinates (POs, boundary states, internal states, TRs)
 * Phase 5: Compute system limit
 * Phase 6: Layout disconnected elements
 * Phase 7: Create connections
 *
 * Multi-system: each system is laid out independently and placed side-by-side horizontally.
 */

import { FlowType } from "../../types/fpb";
import type { ProcessModel, State, ProcessOperator, TechnicalResource, Flow, Usage } from "../../types/fpb";
import type {
  DiagramData,
  DiagramElement,
  DiagramConnection,
  SystemLimitBounds,
  LayoutConfig,
} from "../../types/diagram";
import { shapes, STATE_MAX_W, STATE_H, PROCESS_SIZE, RESOURCE_SIZE } from "./elements";
import { typography } from "../../theme/designTokens";

/* ---------- Layout constants ---------- */

const DEFAULT_CONFIG: LayoutConfig = {
  padding: 40,
  hGap: 40,
  vGap: 80,
  systemLimitPadding: 50,
  resourceOffsetX: 40,
};

/** Vertical gap between PO rows when intermediate states sit between them. */
const INTERNAL_V_GAP = 40;

/** Extra vertical space between boundary-top/bottom states and the first/last PO. */
const BOUNDARY_EXTRA_V = 40;

/** Approximate height of a two-line state label above the shape (for bounding-box calculations). */
const STATE_LABEL_ABOVE = 35;

/* ---------- Types ---------- */

type StateCategory =
  | "boundary-top"
  | "boundary-bottom"
  | "boundary-left"
  | "boundary-right"
  | "internal"
  | "disconnected";

/* ---------- Phase 0: Build connectivity graph ---------- */

interface ConnectivityGraph {
  stateToTargetPOs: Map<string, string[]>;
  stateToSourcePOs: Map<string, string[]>;
  poToInputStates: Map<string, string[]>;
  poToOutputStates: Map<string, string[]>;
  trToPo: Map<string, string>;
  allFlowRefs: Set<string>;
  poIds: Set<string>;
  /** States where ALL incoming PO→State flows are ALTERNATIVE_FLOW. */
  altFlowOnlySinks: Set<string>;
}

function buildConnectivityGraph(
  states: State[],
  processOperators: ProcessOperator[],
  flows: Flow[],
  usages: Usage[],
): ConnectivityGraph {
  const poIds = new Set(processOperators.map((p) => p.id));
  const stateIds = new Set(states.map((s) => s.id));
  const allFlowRefs = new Set<string>();

  const stateToTargetPOs = new Map<string, string[]>();
  const stateToSourcePOs = new Map<string, string[]>();
  const poToInputStates = new Map<string, string[]>();
  const poToOutputStates = new Map<string, string[]>();

  for (const s of states) {
    stateToTargetPOs.set(s.id, []);
    stateToSourcePOs.set(s.id, []);
  }
  for (const p of processOperators) {
    poToInputStates.set(p.id, []);
    poToOutputStates.set(p.id, []);
  }

  // Track flow types for PO→State flows to detect alt-flow-only sinks
  const stateHasRegularFromPo = new Set<string>();
  const stateHasAltFromPo = new Set<string>();

  for (const flow of flows) {
    allFlowRefs.add(flow.source_ref);
    allFlowRefs.add(flow.target_ref);

    if (stateIds.has(flow.source_ref) && poIds.has(flow.target_ref)) {
      // State → PO
      stateToTargetPOs.get(flow.source_ref)?.push(flow.target_ref);
      poToInputStates.get(flow.target_ref)?.push(flow.source_ref);
    } else if (poIds.has(flow.source_ref) && stateIds.has(flow.target_ref)) {
      // PO → State
      stateToSourcePOs.get(flow.target_ref)?.push(flow.source_ref);
      poToOutputStates.get(flow.source_ref)?.push(flow.target_ref);

      if (flow.flow_type === FlowType.ALTERNATIVE_FLOW) {
        stateHasAltFromPo.add(flow.target_ref);
      } else {
        stateHasRegularFromPo.add(flow.target_ref);
      }
    }
  }

  // Alt-flow-only sinks: states that receive ONLY alternative flows from POs
  const altFlowOnlySinks = new Set<string>();
  for (const id of stateHasAltFromPo) {
    if (!stateHasRegularFromPo.has(id)) {
      altFlowOnlySinks.add(id);
    }
  }

  const trToPo = new Map<string, string>();
  for (const usage of usages) {
    trToPo.set(usage.technical_resource_ref, usage.process_operator_ref);
  }

  return { stateToTargetPOs, stateToSourcePOs, poToInputStates, poToOutputStates, trToPo, allFlowRefs, poIds, altFlowOnlySinks };
}

/* ---------- Phase 1: Topological sort of POs ---------- */

function topologicalSortPOs(
  processOperators: ProcessOperator[],
  states: State[],
  graph: ConnectivityGraph,
): { poOrder: string[]; poRank: Map<string, number> } {
  const poIds = new Set(processOperators.map((p) => p.id));

  // Build PO precedence graph via intermediate states
  const poSuccessors = new Map<string, Set<string>>();
  const poPredecessors = new Map<string, Set<string>>();
  for (const po of processOperators) {
    poSuccessors.set(po.id, new Set());
    poPredecessors.set(po.id, new Set());
  }

  for (const state of states) {
    const sourcePOs = graph.stateToSourcePOs.get(state.id) ?? [];
    const targetPOs = graph.stateToTargetPOs.get(state.id) ?? [];
    if (sourcePOs.length > 0 && targetPOs.length > 0) {
      for (const srcPO of sourcePOs) {
        for (const tgtPO of targetPOs) {
          if (srcPO !== tgtPO && poIds.has(srcPO) && poIds.has(tgtPO)) {
            poSuccessors.get(srcPO)?.add(tgtPO);
            poPredecessors.get(tgtPO)?.add(srcPO);
          }
        }
      }
    }
  }

  // Kahn's algorithm with cycle breaking
  const inDegree = new Map<string, number>();
  for (const po of processOperators) {
    inDegree.set(po.id, poPredecessors.get(po.id)?.size ?? 0);
  }

  const poOrder: string[] = [];
  const poRank = new Map<string, number>();
  const remaining = new Set(processOperators.map((p) => p.id));
  let currentRank = 0;

  while (remaining.size > 0) {
    let ready = Array.from(remaining).filter((id) => (inDegree.get(id) ?? 0) === 0);

    if (ready.length === 0) {
      // Cycle detected: break by picking node with lowest inDegree
      const sorted = Array.from(remaining).sort((a, b) => {
        const da = inDegree.get(a) ?? 0;
        const db = inDegree.get(b) ?? 0;
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });
      ready = [sorted[0]];
    }

    ready.sort();
    for (const poId of ready) {
      poOrder.push(poId);
      poRank.set(poId, currentRank);
      remaining.delete(poId);
      for (const succ of poSuccessors.get(poId) ?? []) {
        if (remaining.has(succ)) {
          inDegree.set(succ, (inDegree.get(succ) ?? 1) - 1);
        }
      }
      // Each PO gets its own rank so it receives a unique row position.
      currentRank++;
    }
  }

  return { poOrder, poRank };
}

/* ---------- Phase 2: Classify states ---------- */

/**
 * Decide boundary side for a product state in multi-PO layouts.
 * Products feeding the first PO → top, products from the last PO → bottom.
 * All others → left (inputs) or right (outputs).
 */
function productBoundarySide(
  isInput: boolean,
  poRank: Map<string, number> | null,
  connectedPOs: string[],
  maxRank: number,
): StateCategory {
  if (isInput) {
    if (poRank && connectedPOs.length > 0 && maxRank > 0) {
      const minRank = Math.min(...connectedPOs.map((id) => poRank.get(id) ?? 0));
      if (minRank > 0) return "boundary-left";
    }
    return "boundary-top";
  } else {
    if (poRank && connectedPOs.length > 0 && maxRank > 0) {
      const maxSrcRank = Math.max(...connectedPOs.map((id) => poRank.get(id) ?? 0));
      if (maxSrcRank < maxRank) return "boundary-right";
    }
    return "boundary-bottom";
  }
}

function classifyState(
  state: State,
  graph: ConnectivityGraph,
  poRank: Map<string, number> | null = null,
  maxRank: number = 0,
): StateCategory {
  if (!graph.allFlowRefs.has(state.id)) return "disconnected";

  const sourcePOs = graph.stateToSourcePOs.get(state.id) ?? [];
  const targetPOs = graph.stateToTargetPOs.get(state.id) ?? [];
  const isPureSource = targetPOs.length > 0 && sourcePOs.length === 0;
  const isPureSink = sourcePOs.length > 0 && targetPOs.length === 0;
  const isIntermediate = sourcePOs.length > 0 && targetPOs.length > 0;

  // 1. Explicit directional override
  if (state.placement === "boundary-top") return "boundary-top";
  if (state.placement === "boundary-bottom") return "boundary-bottom";
  if (state.placement === "boundary-left") return "boundary-left";
  if (state.placement === "boundary-right") return "boundary-right";
  if (state.placement === "internal") return "internal";

  // 2. @boundary (auto-detect side)
  if (state.placement === "boundary") {
    if (isPureSource) {
      if (state.state_type === "product") return productBoundarySide(true, poRank, targetPOs, maxRank);
      return "boundary-left";
    }
    if (isPureSink) {
      if (state.state_type === "product") return productBoundarySide(false, poRank, sourcePOs, maxRank);
      return "boundary-right";
    }
    if (state.state_type === "product") return "boundary-top";
    return "boundary-left";
  }

  // 3. Fully automatic (placement == null)
  if (isIntermediate) return "internal";

  if (isPureSource) {
    if (state.state_type === "product") return productBoundarySide(true, poRank, targetPOs, maxRank);
    return "boundary-left";
  }

  if (isPureSink) {
    if (state.state_type === "product") return productBoundarySide(false, poRank, sourcePOs, maxRank);
    return "boundary-right";
  }

  // Fallback
  return "boundary-top";
}

/* ---------- Phase 3: Assign states to PO rows ---------- */

interface StateAffinity {
  category: StateCategory;
  affiliatedRank: number;
  sourceRank?: number;
  targetRank?: number;
}

function assignStateAffinities(
  states: State[],
  graph: ConnectivityGraph,
  poRank: Map<string, number>,
  maxRank: number = 0,
): Map<string, StateAffinity> {
  const affinities = new Map<string, StateAffinity>();

  for (const state of states) {
    const category = classifyState(state, graph, poRank, maxRank);
    const sourcePOs = graph.stateToSourcePOs.get(state.id) ?? [];
    const targetPOs = graph.stateToTargetPOs.get(state.id) ?? [];

    let affiliatedRank = 0;
    let sourceRank: number | undefined;
    let targetRank: number | undefined;

    if (category === "boundary-left") {
      if (targetPOs.length > 0) {
        affiliatedRank = Math.min(...targetPOs.map((id) => poRank.get(id) ?? 0));
      }
    } else if (category === "boundary-right") {
      if (sourcePOs.length > 0) {
        affiliatedRank = Math.max(...sourcePOs.map((id) => poRank.get(id) ?? 0));
      }
    } else if (category === "internal") {
      if (sourcePOs.length > 0) {
        sourceRank = Math.max(...sourcePOs.map((id) => poRank.get(id) ?? 0));
      }
      if (targetPOs.length > 0) {
        targetRank = Math.min(...targetPOs.map((id) => poRank.get(id) ?? 0));
      }
      affiliatedRank = sourceRank ?? targetRank ?? 0;
    }

    affinities.set(state.id, { category, affiliatedRank, sourceRank, targetRank });
  }

  return affinities;
}

/* ---------- Helpers ---------- */

function distributeAlongAxis(
  count: number,
  itemSize: number,
  gap: number,
  startPos: number,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(startPos + i * (itemSize + gap));
  }
  return positions;
}

function distributeCentered(
  count: number,
  itemSize: number,
  gap: number,
  centerPos: number,
): number[] {
  if (count === 0) return [];
  const totalSize = count * itemSize + (count - 1) * gap;
  const startPos = centerPos - totalSize / 2;
  return distributeAlongAxis(count, itemSize, gap, startPos);
}

/* ---------- Single-system layout ---------- */

function layoutSingleSystem(
  states: State[],
  processOperators: ProcessOperator[],
  technicalResources: TechnicalResource[],
  flows: Flow[],
  usages: Usage[],
  layoutConfig: LayoutConfig,
  offsetX: number = 0,
  offsetY: number = 0,
): {
  elements: DiagramElement[];
  connections: DiagramConnection[];
  systemLimitBounds: Omit<SystemLimitBounds, "id" | "label"> | null;
} {
  const { padding, hGap, vGap, systemLimitPadding, resourceOffsetX } = layoutConfig;

  const elements: DiagramElement[] = [];
  const connections: DiagramConnection[] = [];

  if (states.length === 0 && processOperators.length === 0) {
    return { elements, connections, systemLimitBounds: null };
  }

  // --- Phase 0: Build connectivity graph ---
  const graph = buildConnectivityGraph(states, processOperators, flows, usages);

  // --- Phase 1: Topological sort of POs ---
  const { poOrder, poRank } = topologicalSortPOs(processOperators, states, graph);
  const maxRank = poOrder.length > 0 ? Math.max(...poRank.values()) : -1;

  // --- Phase 2 + 3: Classify states and assign affinities ---
  const affinities = assignStateAffinities(states, graph, poRank, maxRank);

  // Group states by category
  const boundaryTop: State[] = [];
  const boundaryBottom: State[] = [];
  const boundaryLeft = new Map<number, State[]>();
  const boundaryRight = new Map<number, State[]>();
  const internalStates: State[] = [];
  const disconnectedStates: State[] = [];

  for (const state of states) {
    const aff = affinities.get(state.id);
    if (!aff) { disconnectedStates.push(state); continue; }

    switch (aff.category) {
      case "boundary-top": boundaryTop.push(state); break;
      case "boundary-bottom": boundaryBottom.push(state); break;
      case "boundary-left": {
        const rank = aff.affiliatedRank;
        if (!boundaryLeft.has(rank)) boundaryLeft.set(rank, []);
        boundaryLeft.get(rank)!.push(state);
        break;
      }
      case "boundary-right": {
        const rank = aff.affiliatedRank;
        if (!boundaryRight.has(rank)) boundaryRight.set(rank, []);
        boundaryRight.get(rank)!.push(state);
        break;
      }
      case "internal": internalStates.push(state); break;
      case "disconnected": disconnectedStates.push(state); break;
    }
  }

  // Group internal states by gap (forward-edge only; backward = feedback)
  const internalsByGap = new Map<string, State[]>();
  const backwardInternals: State[] = [];
  for (const state of internalStates) {
    const aff = affinities.get(state.id)!;
    const sRank = aff.sourceRank ?? aff.affiliatedRank;
    const tRank = aff.targetRank ?? sRank + 1;
    if (sRank < tRank) {
      const key = `${sRank}-${tRank}`;
      if (!internalsByGap.has(key)) internalsByGap.set(key, []);
      internalsByGap.get(key)!.push(state);
    } else {
      backwardInternals.push(state);
    }
  }

  // Determine which ranks have intermediate states below them
  const hasIntermediatesBelow = new Set<number>();
  for (const key of internalsByGap.keys()) {
    const sRank = parseInt(key.split("-")[0]);
    hasIntermediatesBelow.add(sRank);
  }

  // --- Phase 4: Compute coordinates ---

  const startX = offsetX + padding;
  const startY = offsetY + padding;

  // 4a) Compute PO row Y-positions
  const topBoundaryHeight = boundaryTop.length > 0 ? STATE_H + vGap : 0;
  let currentY = startY + topBoundaryHeight;

  const poRowY = new Map<number, number>();
  for (let rank = 0; rank <= maxRank; rank++) {
    const leftCount = boundaryLeft.get(rank)?.length ?? 0;
    const rightCount = boundaryRight.get(rank)?.length ?? 0;
    const maxSideCount = Math.max(leftCount, rightCount);
    const sideHeight = maxSideCount > 0 ? maxSideCount * (STATE_H + hGap) - hGap : 0;
    const rowHeight = Math.max(PROCESS_SIZE.h, sideHeight);

    poRowY.set(rank, currentY + (rowHeight - PROCESS_SIZE.h) / 2);

    currentY += rowHeight;

    if (hasIntermediatesBelow.has(rank)) {
      currentY += INTERNAL_V_GAP + STATE_H + INTERNAL_V_GAP;
    } else if (rank < maxRank) {
      currentY += vGap;
    }
  }

  // 4b) Position POs horizontally (reserve left space for boundary-left + feedback lane)
  let leftSpace = 0;
  if (boundaryLeft.size > 0) leftSpace += STATE_MAX_W + hGap;
  if (backwardInternals.length > 0) leftSpace += STATE_MAX_W + hGap;
  const coreLeftX = startX + leftSpace;
  const poCenterX = coreLeftX + PROCESS_SIZE.w / 2;

  const poElements = new Map<string, DiagramElement>();
  for (const poId of poOrder) {
    const po = processOperators.find((p) => p.id === poId)!;
    const rank = poRank.get(poId) ?? 0;
    const y = poRowY.get(rank) ?? startY;

    const el: DiagramElement = {
      id: po.id, type: "processOperator", label: po.label,
      x: coreLeftX, y,
      width: PROCESS_SIZE.w, height: PROCESS_SIZE.h,
      line_number: po.line_number,
    };
    elements.push(el);
    poElements.set(po.id, el);
  }

  const disconnectedPOs = processOperators.filter((p) => !graph.allFlowRefs.has(p.id));

  // 4c) Position forward-edge internal states (between PO rows)
  for (const [key, gapStates] of internalsByGap.entries()) {
    const [sRankStr, tRankStr] = key.split("-");
    const sRank = parseInt(sRankStr);
    const tRank = parseInt(tRankStr);

    const sourcePoY = poRowY.get(sRank) ?? startY;
    // For spans crossing intermediate PO ranks, place the state in the gap
    // directly below the source PO (between sRank and sRank+1) to avoid
    // overlapping with POs at intermediate ranks.
    const nextRowY = poRowY.get(Math.min(sRank + 1, tRank)) ?? (poRowY.get(tRank) ?? startY);
    const midY = (sourcePoY + PROCESS_SIZE.h + nextRowY) / 2 - STATE_H / 2;

    const xs = distributeCentered(gapStates.length, STATE_MAX_W, hGap, poCenterX);

    for (let i = 0; i < gapStates.length; i++) {
      const s = gapStates[i];
      const stateSize = shapes.state[s.state_type];
      // Center actual width within the STATE_MAX_W slot for port alignment
      const centeredX = xs[i] + (STATE_MAX_W - stateSize.width) / 2;
      elements.push({
        id: s.id, type: "state", label: s.label,
        x: centeredX, y: midY,
        width: stateSize.width, height: stateSize.height,
        stateType: s.state_type, line_number: s.line_number,
      });
    }
  }

  // 4d) Position backward-edge (feedback) internal states LEFT of POs, inside the SL
  const backwardInternalIds = new Set(backwardInternals.map((s) => s.id));
  if (backwardInternals.length > 0) {
    const feedbackX = coreLeftX - STATE_MAX_W - hGap;

    for (const state of backwardInternals) {
      const aff = affinities.get(state.id)!;
      const sRankVal = aff.sourceRank ?? 0;
      const tRankVal = aff.targetRank ?? 0;
      const minR = Math.min(sRankVal, tRankVal);
      const maxR = Math.max(sRankVal, tRankVal);
      const upperY = poRowY.get(minR) ?? startY;
      const lowerY = poRowY.get(maxR) ?? startY;
      const midY = (upperY + PROCESS_SIZE.h + lowerY) / 2 - STATE_H / 2;

      const stateSize = shapes.state[state.state_type];
      const centeredFeedbackX = feedbackX + (STATE_MAX_W - stateSize.width) / 2;
      elements.push({
        id: state.id, type: "state", label: state.label,
        x: centeredFeedbackX, y: midY,
        width: stateSize.width, height: stateSize.height,
        stateType: state.state_type, line_number: state.line_number,
      });
    }
  }

  // --- Phase 5: Compute system limit around core elements ---

  const coreElements = elements.filter((e) =>
    e.type === "processOperator" ||
    (e.type === "state" && internalStates.some((s) => s.id === e.id))
  );

  let systemLimitBounds: Omit<SystemLimitBounds, "id" | "label"> | null = null;

  if (coreElements.length > 0 || boundaryTop.length > 0 || boundaryBottom.length > 0) {
    let slMinX: number, slMinY: number, slMaxX: number, slMaxY: number;

    if (coreElements.length > 0) {
      // Compute bounding box including label extents for state elements.
      // State labels are rendered above/left of the shape (textAnchor="end").
      const charW = typography.fontSize.stateLabel * 0.6;
      slMinX = Infinity; slMinY = Infinity; slMaxX = -Infinity; slMaxY = -Infinity;
      for (const e of coreElements) {
        if (e.type === "state") {
          const longestLine = Math.max(e.id.length, e.label.length);
          const labelWidth = longestLine * charW;
          const labelAnchorX = e.x + e.width / 2 - 6;
          slMinX = Math.min(slMinX, labelAnchorX - labelWidth, e.x);
          slMinY = Math.min(slMinY, e.y - STATE_LABEL_ABOVE);
        } else {
          slMinX = Math.min(slMinX, e.x);
          slMinY = Math.min(slMinY, e.y);
        }
        slMaxX = Math.max(slMaxX, e.x + e.width);
        slMaxY = Math.max(slMaxY, e.y + e.height);
      }
    } else {
      slMinX = coreLeftX;
      slMinY = startY;
      slMaxX = coreLeftX + PROCESS_SIZE.w;
      slMaxY = startY + PROCESS_SIZE.h;
    }

    // Expand for left/right boundary states
    const maxLeftCount = Math.max(0, ...Array.from(boundaryLeft.values()).map((a) => a.length));
    const maxRightCount = Math.max(0, ...Array.from(boundaryRight.values()).map((a) => a.length));
    if (maxLeftCount > 0) {
      slMinX -= STATE_MAX_W / 2 + hGap;
    }
    if (maxRightCount > 0) {
      slMaxX += STATE_MAX_W / 2 + hGap;
    }

    // Expand for top/bottom boundary width
    const topWidth = boundaryTop.length > 0 ? boundaryTop.length * (STATE_MAX_W + hGap) - hGap : 0;
    const bottomWidth = boundaryBottom.length > 0 ? boundaryBottom.length * (STATE_MAX_W + hGap) - hGap : 0;
    const maxBoundaryWidth = Math.max(topWidth, bottomWidth);
    const coreWidth = slMaxX - slMinX;
    if (maxBoundaryWidth > coreWidth) {
      const extra = (maxBoundaryWidth - coreWidth) / 2;
      slMinX -= extra;
      slMaxX += extra;
    }

    // Extra vertical space when boundary states sit on top/bottom edges
    if (boundaryTop.length > 0) slMinY -= BOUNDARY_EXTRA_V;
    if (boundaryBottom.length > 0) slMaxY += BOUNDARY_EXTRA_V;

    systemLimitBounds = {
      x: slMinX - systemLimitPadding,
      y: slMinY - systemLimitPadding,
      width: slMaxX - slMinX + systemLimitPadding * 2,
      height: slMaxY - slMinY + systemLimitPadding * 2,
    };
  }

  // --- Position boundary states on system limit edges ---

  if (systemLimitBounds) {
    const slLeft = systemLimitBounds.x;
    const slRight = systemLimitBounds.x + systemLimitBounds.width;
    const slTop = systemLimitBounds.y;
    const slBottom = systemLimitBounds.y + systemLimitBounds.height;
    const slCenterX = slLeft + systemLimitBounds.width / 2;

    // Top boundary states: straddle top edge
    if (boundaryTop.length > 0) {
      const bTopY = slTop - STATE_H / 2;
      const bTopXs = distributeCentered(boundaryTop.length, STATE_MAX_W, hGap, slCenterX);
      for (let i = 0; i < boundaryTop.length; i++) {
        const s = boundaryTop[i];
        const stateSize = shapes.state[s.state_type];
        elements.push({
          id: s.id, type: "state", label: s.label,
          x: bTopXs[i], y: bTopY,
          width: stateSize.width, height: stateSize.height,
          stateType: s.state_type, line_number: s.line_number,
        });
      }
    }

    // Bottom boundary states: straddle bottom edge
    if (boundaryBottom.length > 0) {
      const bBotY = slBottom - STATE_H / 2;
      const bBotXs = distributeCentered(boundaryBottom.length, STATE_MAX_W, hGap, slCenterX);
      for (let i = 0; i < boundaryBottom.length; i++) {
        const s = boundaryBottom[i];
        const stateSize = shapes.state[s.state_type];
        elements.push({
          id: s.id, type: "state", label: s.label,
          x: bBotXs[i], y: bBotY,
          width: stateSize.width, height: stateSize.height,
          stateType: s.state_type, line_number: s.line_number,
        });
      }
    }

    // Left boundary states: straddle left edge, at PO row Y-level
    for (const [rank, leftStates] of boundaryLeft.entries()) {
      const poY = poRowY.get(rank) ?? startY;
      const rowCenterY = poY + PROCESS_SIZE.h / 2;
      const ys = distributeCentered(leftStates.length, STATE_H, hGap, rowCenterY);
      const bLeftX = slLeft - STATE_MAX_W / 2;

      for (let i = 0; i < leftStates.length; i++) {
        const s = leftStates[i];
        const stateSize = shapes.state[s.state_type];
        elements.push({
          id: s.id, type: "state", label: s.label,
          x: bLeftX, y: ys[i],
          width: stateSize.width, height: stateSize.height,
          stateType: s.state_type, line_number: s.line_number,
        });
      }
    }

    // Right boundary states: straddle right edge, at PO row Y-level
    for (const [rank, rightStates] of boundaryRight.entries()) {
      const poY = poRowY.get(rank) ?? startY;
      const rowCenterY = poY + PROCESS_SIZE.h / 2;
      const ys = distributeCentered(rightStates.length, STATE_H, hGap, rowCenterY);
      const bRightX = slRight - STATE_MAX_W / 2;

      for (let i = 0; i < rightStates.length; i++) {
        const s = rightStates[i];
        const stateSize = shapes.state[s.state_type];
        elements.push({
          id: s.id, type: "state", label: s.label,
          x: bRightX, y: ys[i],
          width: stateSize.width, height: stateSize.height,
          stateType: s.state_type, line_number: s.line_number,
        });
      }
    }
  }

  // --- Technical resources outside system limit ---

  const trStartX = systemLimitBounds
    ? systemLimitBounds.x + systemLimitBounds.width + resourceOffsetX
    : coreLeftX + PROCESS_SIZE.w + resourceOffsetX * 2;

  for (let i = 0; i < technicalResources.length; i++) {
    const tr = technicalResources[i];
    const connectedPoId = graph.trToPo.get(tr.id);
    const poEl = connectedPoId ? poElements.get(connectedPoId) : null;

    const trY = poEl
      ? poEl.y + (poEl.height - RESOURCE_SIZE.h) / 2
      : (poRowY.get(0) ?? startY) + i * (RESOURCE_SIZE.h + hGap);

    elements.push({
      id: tr.id, type: "technicalResource", label: tr.label,
      x: trStartX, y: trY,
      width: RESOURCE_SIZE.w, height: RESOURCE_SIZE.h,
      line_number: tr.line_number,
    });
  }

  // --- Phase 6: Disconnected elements ---

  if (disconnectedStates.length > 0 || disconnectedPOs.length > 0) {
    let maxElY = startY;
    if (elements.length > 0) {
      maxElY = Math.max(...elements.map((e) => e.y + e.height));
    }

    const disconnectedStartY = maxElY + vGap;
    let currentDisconnectedX = startX;

    for (const s of disconnectedStates) {
      const stateSize = shapes.state[s.state_type];
      elements.push({
        id: s.id, type: "state", label: s.label,
        x: currentDisconnectedX, y: disconnectedStartY,
        width: stateSize.width, height: stateSize.height,
        stateType: s.state_type,
      });
      currentDisconnectedX += stateSize.width + hGap;
    }

    for (const p of disconnectedPOs) {
      elements.push({
        id: p.id, type: "processOperator", label: p.label,
        x: currentDisconnectedX, y: disconnectedStartY,
        width: PROCESS_SIZE.w, height: PROCESS_SIZE.h,
      });
      currentDisconnectedX += PROCESS_SIZE.w + hGap;
    }
  }

  // --- Phase 7: Create connections ---

  const boundaryTopIds = new Set(boundaryTop.map((s) => s.id));
  const boundaryBottomIds = new Set(boundaryBottom.map((s) => s.id));

  for (const flow of flows) {
    const conn: DiagramConnection = {
      id: flow.id,
      sourceId: flow.source_ref,
      targetId: flow.target_ref,
      flowType: flow.flow_type,
      isUsage: false,
      line_number: flow.line_number,
    };

    // Routing hints for boundary-top states: outgoing arrows always from bottom
    if (boundaryTopIds.has(flow.source_ref)) {
      conn.sourceSide = "bottom";
    }
    // Routing hints for boundary-bottom states: incoming arrows always from top
    if (boundaryBottomIds.has(flow.target_ref)) {
      conn.targetSide = "top";
    }

    // Routing hints for feedback connections
    if (backwardInternalIds.has(flow.target_ref)) {
      // PO → feedback state: exit PO left, enter state bottom
      conn.sourceSide = "left";
      conn.targetSide = "bottom";
    } else if (backwardInternalIds.has(flow.source_ref)) {
      // feedback state → PO: exit state top, enter PO left
      conn.sourceSide = "top";
      conn.targetSide = "left";
    }

    connections.push(conn);
  }

  for (const usage of usages) {
    connections.push({
      id: usage.id,
      sourceId: usage.process_operator_ref,
      targetId: usage.technical_resource_ref,
      isUsage: true,
      line_number: usage.line_number,
    });
  }

  return { elements, connections, systemLimitBounds };
}

/* ---------- Main layout function ---------- */

/** Remove duplicate elements by ID, keeping the first occurrence. */
function deduplicateElements(elements: DiagramElement[]): DiagramElement[] {
  const seen = new Set<string>();
  return elements.filter((el) => {
    if (seen.has(el.id)) return false;
    seen.add(el.id);
    return true;
  });
}

export function layoutProcessModel(
  model: ProcessModel,
  config: Partial<LayoutConfig> = {},
): DiagramData {
  const layoutConfig: LayoutConfig = { ...DEFAULT_CONFIG, ...config };
  const systemGap = layoutConfig.hGap * 3;

  const hasSystems = model.system_limits && model.system_limits.length > 0;

  if (!hasSystems) {
    const result = layoutSingleSystem(
      model.states,
      model.process_operators,
      model.technical_resources,
      model.flows,
      model.usages,
      layoutConfig,
    );

    const systemLimits: SystemLimitBounds[] = [];
    if (result.systemLimitBounds) {
      systemLimits.push({
        ...result.systemLimitBounds,
        id: "default",
        label: model.title || "Untitled Process",
      });
    }

    return {
      elements: deduplicateElements(result.elements),
      connections: result.connections,
      systemLimits,
    };
  }

  const allElements: DiagramElement[] = [];
  const allConnections: DiagramConnection[] = [];
  const systemLimits: SystemLimitBounds[] = [];
  let currentOffsetX = 0;

  for (const sl of model.system_limits) {
    const sysStates = model.states.filter((s) => s.system_id === sl.id);
    const sysPOs = model.process_operators.filter((p) => p.system_id === sl.id);
    const sysTRs = model.technical_resources.filter((r) => r.system_id === sl.id);
    const sysFlows = model.flows.filter((f) => f.system_id === sl.id);
    const sysUsages = model.usages.filter((u) => u.system_id === sl.id);

    if (sysStates.length === 0 && sysPOs.length === 0 && sysTRs.length === 0) {
      continue;
    }

    const result = layoutSingleSystem(
      sysStates, sysPOs, sysTRs, sysFlows, sysUsages,
      layoutConfig, currentOffsetX, 0,
    );

    if (result.systemLimitBounds) {
      systemLimits.push({
        ...result.systemLimitBounds,
        id: sl.id,
        label: sl.label,
      });
      currentOffsetX = result.systemLimitBounds.x + result.systemLimitBounds.width + systemGap;
    } else if (result.elements.length > 0) {
      const maxElemX = Math.max(...result.elements.map((e) => e.x + e.width));
      currentOffsetX = maxElemX + systemGap;
    }

    allElements.push(...result.elements);
    allConnections.push(...result.connections);
  }

  return {
    elements: deduplicateElements(allElements),
    connections: allConnections,
    systemLimits,
  };
}
