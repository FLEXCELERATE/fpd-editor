/** SVG connection components for VDI 3682 flow and usage links.
 *
 * Connection types:
 * - Flow: Solid arrow (black)
 * - AlternativeFlow: Solid arrow (orange, #f5a623) — direct/diagonal
 * - ParallelFlow: Solid arrow (blue, #4a90d9)
 * - Usage: Dashed bidirectional line (gray, #888889)
 *
 * All connections except AlternativeFlow are routed orthogonally.
 * Waypoints are pre-computed by routing.ts.
 */

import type { RoutedConnection, Point } from "../../types/diagram";
import { FlowType } from "../../types/fpb";
import { colors } from "../../theme/designTokens";

/* ---------- Arrow marker definitions ---------- */

/** SVG <defs> containing all arrowhead markers and filters. Include once in the SVG root. */
export function ConnectionDefs() {
  return (
    <defs>
      <marker
        id="arrow-flow"
        viewBox="0 0 10 10"
        refX={10}
        refY={5}
        markerWidth={8}
        markerHeight={8}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={colors.connections.flow} />
      </marker>
      <marker
        id="arrow-alternative"
        viewBox="0 0 10 10"
        refX={10}
        refY={5}
        markerWidth={8}
        markerHeight={8}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={colors.connections.alternativeFlow} />
      </marker>
      <marker
        id="arrow-parallel"
        viewBox="0 0 10 10"
        refX={10}
        refY={5}
        markerWidth={8}
        markerHeight={8}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={colors.connections.parallelFlow} />
      </marker>
      <marker
        id="arrow-usage"
        viewBox="0 0 10 10"
        refX={10}
        refY={5}
        markerWidth={6}
        markerHeight={6}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={colors.connections.usage} />
      </marker>
      <filter id="highlight-glow">
        <feGaussianBlur stdDeviation={2} result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/* ---------- Helpers ---------- */

/** Convert an array of points into an SVG path `d` attribute. */
function pointsToPathD(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x},${first.y}` + rest.map((p) => ` L ${p.x},${p.y}`).join("");
}

/* ---------- Path components ---------- */

interface RoutedPathProps {
  points: Point[];
  onClick?: () => void;
}

/** Flow: Solid black orthogonal path */
function FlowPath({ points, onClick }: RoutedPathProps) {
  return (
    <path
      d={pointsToPathD(points)}
      fill="none"
      stroke={colors.connections.flow}
      strokeWidth={1.5}
      markerEnd="url(#arrow-flow)"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    />
  );
}

/** AlternativeFlow: Solid orange direct line */
function AlternativeFlowPath({ points, onClick }: RoutedPathProps) {
  return (
    <path
      d={pointsToPathD(points)}
      fill="none"
      stroke={colors.connections.flow}
      strokeWidth={1.5}
      markerEnd="url(#arrow-flow)"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    />
  );
}

/** ParallelFlow: Solid blue orthogonal path */
function ParallelFlowPath({ points, onClick }: RoutedPathProps) {
  return (
    <path
      d={pointsToPathD(points)}
      fill="none"
      stroke={colors.connections.flow}
      strokeWidth={1.5}
      markerEnd="url(#arrow-flow)"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    />
  );
}

/** Usage: Dashed gray bidirectional orthogonal path */
function UsagePath({ points, onClick }: RoutedPathProps) {
  return (
    <path
      d={pointsToPathD(points)}
      fill="none"
      stroke={colors.connections.usage}
      strokeWidth={1.5}
      strokeDasharray="6,4"
      markerStart="url(#arrow-usage)"
      markerEnd="url(#arrow-usage)"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    />
  );
}

/* ---------- Connection dispatcher ---------- */

/** Renders the correct SVG path for a pre-routed connection. */
export function RoutedConnectionLine({
  routed,
  onClick,
}: {
  routed: RoutedConnection;
  onClick?: () => void;
}) {
  const { connection, points } = routed;

  if (points.length < 2) return null;

  const pathProps: RoutedPathProps = { points, onClick };

  if (connection.isUsage) {
    return <UsagePath {...pathProps} />;
  }

  switch (connection.flowType) {
    case FlowType.ALTERNATIVE_FLOW:
      return <AlternativeFlowPath {...pathProps} />;
    case FlowType.PARALLEL_FLOW:
      return <ParallelFlowPath {...pathProps} />;
    case FlowType.FLOW:
    default:
      return <FlowPath {...pathProps} />;
  }
}
