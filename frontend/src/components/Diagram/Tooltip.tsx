/** Tooltip component for showing element info on hover.
 *
 * Displays element type, ID, and label in a styled tooltip box
 * positioned near the hovered SVG element.
 */

import type { DiagramElement } from "../../types/diagram";

interface TooltipProps {
  /** The element to show info for. If null, tooltip is hidden. */
  element: DiagramElement | null;
  /** X position in SVG coordinates */
  x: number;
  /** Y position in SVG coordinates */
  y: number;
}

/** Maps element types to human-readable labels */
function getElementTypeLabel(element: DiagramElement): string {
  if (element.type === "state" && element.stateType) {
    return element.stateType.charAt(0).toUpperCase() + element.stateType.slice(1);
  }

  switch (element.type) {
    case "processOperator":
      return "Process Operator";
    case "technicalResource":
      return "Technical Resource";
    case "state":
      return "State";
    default:
      return element.type;
  }
}

/** Tooltip component for displaying element information on hover */
export function Tooltip({ element, x, y }: TooltipProps) {
  if (!element) return null;

  const typeLabel = getElementTypeLabel(element);
  const padding = 8;
  const lineHeight = 16;
  const fontSize = 12;

  // Offset tooltip slightly from cursor position
  const offsetX = 10;
  const offsetY = 10;

  return (
    <g
      transform={`translate(${x + offsetX},${y + offsetY})`}
      style={{ pointerEvents: "none" }}
    >
      {/* Background box */}
      <rect
        x={0}
        y={0}
        width={200}
        height={padding * 2 + lineHeight * 3}
        rx={4}
        ry={4}
        fill="#333"
        fillOpacity={0.95}
        stroke="#666"
        strokeWidth={1}
      />

      {/* Type label */}
      <text
        x={padding}
        y={padding + lineHeight}
        fontSize={fontSize}
        fontWeight="bold"
        fill="#fff"
        fontFamily="sans-serif"
      >
        {typeLabel}
      </text>

      {/* ID */}
      <text
        x={padding}
        y={padding + lineHeight * 2}
        fontSize={fontSize}
        fill="#ccc"
        fontFamily="monospace"
      >
        ID: {element.id}
      </text>

      {/* Label */}
      <text
        x={padding}
        y={padding + lineHeight * 3}
        fontSize={fontSize}
        fill="#fff"
        fontFamily="sans-serif"
      >
        {element.label}
      </text>
    </g>
  );
}
