/** Orthogonal connection routing for VDI 3682 diagrams.
 *
 * Computes waypoints for all connections in a single pass so that
 * ports can be distributed along element edges when multiple
 * connections share the same side.
 *
 * Routing rules:
 * - Flow / ParallelFlow / Usage: orthogonal (horizontal + vertical segments)
 * - AlternativeFlow: direct diagonal line
 * - All Alternative flows on the same (element, side) share one port
 * - All Parallel flows on the same (element, side) share one port
 * - Each regular Flow / Usage gets its own port
 */

import { FlowType } from "../../types/fpb";
import type {
  DiagramElement,
  DiagramConnection,
  RoutedConnection,
  Side,
  Point,
} from "../../types/diagram";

/* ---------- Helpers ---------- */

function centerOf(el: DiagramElement): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

function buildLookup(elements: DiagramElement[]): Map<string, DiagramElement> {
  const map = new Map<string, DiagramElement>();
  for (const el of elements) {
    map.set(el.id, el);
  }
  return map;
}

/** Determine which side of `from` the connection should exit toward `to`. */
function determineSide(from: DiagramElement, to: DiagramElement): Side {
  const fc = centerOf(from);
  const tc = centerOf(to);
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;

  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? "bottom" : "top";
  }
  return dx >= 0 ? "right" : "left";
}

/** Compute a port position on a given side of an element.
 *  `index` is 0-based, `count` is the total number of ports on that side. */
function portPosition(
  el: DiagramElement,
  side: Side,
  index: number,
  count: number,
): Point {
  switch (side) {
    case "top": {
      const spacing = el.width / (count + 1);
      return { x: el.x + spacing * (index + 1), y: el.y };
    }
    case "bottom": {
      const spacing = el.width / (count + 1);
      return { x: el.x + spacing * (index + 1), y: el.y + el.height };
    }
    case "left": {
      const spacing = el.height / (count + 1);
      return { x: el.x, y: el.y + spacing * (index + 1) };
    }
    case "right": {
      const spacing = el.height / (count + 1);
      return { x: el.x + el.width, y: el.y + spacing * (index + 1) };
    }
  }
}

/** Build orthogonal waypoints between two ports.
 *  Returns a Z-shaped path (or straight line if aligned). */
function orthogonalWaypoints(
  source: Point,
  target: Point,
  sourceSide: Side,
  targetSide: Side,
): Point[] {
  // Vertical connection (top/bottom to top/bottom)
  if (
    (sourceSide === "bottom" || sourceSide === "top") &&
    (targetSide === "top" || targetSide === "bottom")
  ) {
    if (source.x === target.x) {
      return [source, target];
    }
    const midY = (source.y + target.y) / 2;
    return [
      source,
      { x: source.x, y: midY },
      { x: target.x, y: midY },
      target,
    ];
  }

  // Horizontal connection (left/right to left/right)
  if (
    (sourceSide === "left" || sourceSide === "right") &&
    (targetSide === "left" || targetSide === "right")
  ) {
    if (source.y === target.y) {
      return [source, target];
    }
    const midX = (source.x + target.x) / 2;
    return [
      source,
      { x: midX, y: source.y },
      { x: midX, y: target.y },
      target,
    ];
  }

  // Mixed (e.g., bottom → left): L-shaped
  if (sourceSide === "bottom" || sourceSide === "top") {
    return [source, { x: source.x, y: target.y }, target];
  }
  return [source, { x: target.x, y: source.y }, target];
}

/* ---------- Main routing function ---------- */

/** Compute routed connections with port assignments and waypoints.
 *
 *  Must be called with ALL connections at once so ports can be
 *  distributed properly when multiple connections share an element side.
 *
 *  Port sharing on each (element, side):
 *  - All ALTERNATIVE_FLOW connections share one port
 *  - All PARALLEL_FLOW connections share one port
 *  - Each regular FLOW / Usage gets its own port */
export function computeRouting(
  elements: DiagramElement[],
  connections: DiagramConnection[],
): RoutedConnection[] {
  const lookup = buildLookup(elements);

  // --- Step 1: For each connection determine source/target sides ---

  interface ConnectionMeta {
    conn: DiagramConnection;
    source: DiagramElement;
    target: DiagramElement;
    sourceSide: Side;
    targetSide: Side;
    isDirect: boolean;
  }

  const metas: ConnectionMeta[] = [];
  for (const conn of connections) {
    const source = lookup.get(conn.sourceId);
    const target = lookup.get(conn.targetId);
    if (!source || !target) continue;

    const sourceSide = conn.sourceSide ?? determineSide(source, target);
    const targetSide = conn.targetSide ?? determineSide(target, source);
    const isDirect = conn.flowType === FlowType.ALTERNATIVE_FLOW;

    metas.push({ conn, source, target, sourceSide, targetSide, isDirect });
  }

  // --- Step 1b: Align sides for alternative/parallel flows from the same element ---
  // Alternative flows from the same source must share one sourceSide so they
  // end up in the same port group and share a single port.
  // Same logic applies to target sides and to parallel flows.

  for (const flowType of [FlowType.ALTERNATIVE_FLOW, FlowType.PARALLEL_FLOW]) {
    // Group by source element
    const bySource = new Map<string, number[]>();
    for (let i = 0; i < metas.length; i++) {
      if (metas[i].conn.flowType === flowType) {
        const key = metas[i].source.id;
        if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key)!.push(i);
      }
    }
    for (const indices of bySource.values()) {
      if (indices.length > 1) {
        // Use the first connection's sourceSide for all
        const side = metas[indices[0]].sourceSide;
        for (const i of indices) {
          metas[i].sourceSide = side;
        }
      }
    }

    // Group by target element
    const byTarget = new Map<string, number[]>();
    for (let i = 0; i < metas.length; i++) {
      if (metas[i].conn.flowType === flowType) {
        const key = metas[i].target.id;
        if (!byTarget.has(key)) byTarget.set(key, []);
        byTarget.get(key)!.push(i);
      }
    }
    for (const indices of byTarget.values()) {
      if (indices.length > 1) {
        const side = metas[indices[0]].targetSide;
        for (const i of indices) {
          metas[i].targetSide = side;
        }
      }
    }
  }

  // --- Step 2: Group connections by (elementId, side) for port assignment ---

  type PortEntry = { metaIndex: number; role: "source" | "target" };
  type PortGroup = {
    element: DiagramElement;
    side: Side;
    entries: PortEntry[];
  };

  const portGroups = new Map<string, PortGroup>();

  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];

    const sourceKey = `${m.source.id}:${m.sourceSide}`;
    if (!portGroups.has(sourceKey)) {
      portGroups.set(sourceKey, {
        element: m.source,
        side: m.sourceSide,
        entries: [],
      });
    }
    portGroups.get(sourceKey)!.entries.push({ metaIndex: i, role: "source" });

    const targetKey = `${m.target.id}:${m.targetSide}`;
    if (!portGroups.has(targetKey)) {
      portGroups.set(targetKey, {
        element: m.target,
        side: m.targetSide,
        entries: [],
      });
    }
    portGroups.get(targetKey)!.entries.push({ metaIndex: i, role: "target" });
  }

  // --- Step 3: Assign port positions ---
  //
  // Build "anchor slots" per group. Each slot gets one port position.
  // Multiple connections can share a slot if they have the same
  // special flow type (alternative or parallel).

  const sourcePorts: Point[] = new Array(metas.length);
  const targetPorts: Point[] = new Array(metas.length);

  /** Average position of connected elements for a slot (for sorting). */
  function avgConnectedPos(
    slot: number[],
    entries: PortEntry[],
    allMetas: ConnectionMeta[],
    useY: boolean,
  ): number {
    let total = 0;
    let count = 0;
    for (const mi of slot) {
      const entry = entries.find((e) => e.metaIndex === mi)!;
      const m = allMetas[mi];
      // The "connected" element is the one on the other end of the connection
      const connected = entry.role === "source" ? m.target : m.source;
      const c = centerOf(connected);
      total += useY ? c.y : c.x;
      count++;
    }
    return count > 0 ? total / count : 0;
  }

  for (const group of portGroups.values()) {
    const { element, side, entries } = group;

    // Anchor slots: each slot is a list of metaIndices sharing one port
    const slots: number[][] = [];

    const alternativeIndices: number[] = [];
    const parallelIndices: number[] = [];

    for (const entry of entries) {
      const m = metas[entry.metaIndex];
      const flowType = m.conn.flowType;

      if (flowType === FlowType.ALTERNATIVE_FLOW) {
        alternativeIndices.push(entry.metaIndex);
      } else if (flowType === FlowType.PARALLEL_FLOW) {
        parallelIndices.push(entry.metaIndex);
      } else {
        // Regular flow or usage — own slot
        slots.push([entry.metaIndex]);
      }
    }

    // All alternative flows on this (element, side) share one slot
    if (alternativeIndices.length > 0) {
      slots.push(alternativeIndices);
    }
    // All parallel flows on this (element, side) share one slot
    if (parallelIndices.length > 0) {
      slots.push(parallelIndices);
    }

    // Sort slots by position of connected elements so ports follow a
    // natural spatial order (top-to-bottom for left/right sides,
    // left-to-right for top/bottom sides).
    const useY = side === "left" || side === "right";
    slots.sort((a, b) => {
      const posA = avgConnectedPos(a, entries, metas, useY);
      const posB = avgConnectedPos(b, entries, metas, useY);
      return posA - posB;
    });

    // Distribute ports evenly across slots
    const portCount = slots.length;
    for (let slotIdx = 0; slotIdx < portCount; slotIdx++) {
      const port = portPosition(element, side, slotIdx, portCount);
      for (const mi of slots[slotIdx]) {
        const entry = entries.find((e) => e.metaIndex === mi)!;
        if (entry.role === "source") {
          sourcePorts[mi] = port;
        } else {
          targetPorts[mi] = port;
        }
      }
    }
  }

  // --- Step 4: Compute waypoints ---

  const routed: RoutedConnection[] = [];

  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    const sp = sourcePorts[i];
    const tp = targetPorts[i];

    if (!sp || !tp) continue;

    let points: Point[];
    if (m.isDirect) {
      // Alternative flow: straight diagonal line
      points = [sp, tp];
    } else {
      // Orthogonal routing
      points = orthogonalWaypoints(sp, tp, m.sourceSide, m.targetSide);
    }

    routed.push({
      connection: m.conn,
      points,
      isDirect: m.isDirect,
    });
  }

  return routed;
}
