/** SVG shape components for all VDI 3682 element types.
 *
 * Colors and shapes follow the FPB.JS reference implementation:
 * - Product: Circle, #ed2028 (red)
 * - Energy: Diamond/Rhombus, #6e9ad1 (blue)
 * - Information: Hexagon, #3050a2 (dark blue)
 * - ProcessOperator: Rectangle (sharp corners), #13ae4d (green)
 * - TechnicalResource: Rectangle (sharp corners), #888889 (gray)
 * - SystemLimit: Dashed rectangular frame, no fill
 */

import type { DiagramElement } from "../../types/diagram";
import { StateType } from "../../types/fpb";
import { colors, typography, effects, shapes, STATE_MAX_W, STATE_H, PROCESS_SIZE, RESOURCE_SIZE } from "../../theme/designTokens";

/* Re-export shape dimension constants for layout */
export { shapes, STATE_MAX_W, STATE_H, PROCESS_SIZE, RESOURCE_SIZE };

/** Font family for all diagram text — explicit for consistent svg2pdf.js rendering. */
const FONT_FAMILY = "Helvetica, Arial, sans-serif";

/** Compute a font size that fits all given lines within maxWidthPx, shrinking from defaultSize if needed. */
function autoFontSize(lines: string[], maxWidthPx: number, defaultSize: number, minSize: number = 7): number {
  const longest = lines.reduce((a, b) => (a.length > b.length ? a : b), "");
  // Approximate character width as 0.6 × fontSize (Helvetica average)
  const neededWidth = longest.length * defaultSize * 0.6;
  if (neededWidth <= maxWidthPx) return defaultSize;
  const scaled = (maxWidthPx / longest.length) / 0.6;
  return Math.max(minSize, scaled);
}

/* ---------- Shape prop interfaces ---------- */

interface ShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  isSelected?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

interface SystemLimitShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

/* ---------- Individual shape components ---------- */

/** Product: Circle (red) */
export function ProductShape({ x, y, width, height, id, label, isSelected, onClick, onMouseEnter, onMouseLeave }: ShapeProps) {
  const r = Math.min(width, height) / 2;
  const hasName = label !== id;
  const labelX = width / 2 - 6;
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <circle
        cx={width / 2}
        cy={height / 2}
        r={r}
        fill={colors.vdi3682.product}
        fillOpacity={isSelected ? 0.3 : effects.fillOpacity}
        stroke={colors.common.black}
        strokeWidth={effects.strokeWidth.default}
        filter={isSelected ? "url(#highlight-glow)" : undefined}
      />
      <text
        x={labelX}
        y={hasName ? -22 : -8}
        textAnchor="end"
        fontSize={typography.fontSize.stateLabel}
        fontFamily={FONT_FAMILY}
        fill={colors.common.black}
      >
        <tspan x={labelX} dy={0}>{id}</tspan>
        {hasName && <tspan x={labelX} dy={14}>{label}</tspan>}
      </text>
    </g>
  );
}

/** Energy: Diamond / Rhombus (blue)  */
export function EnergyShape({ x, y, width, height, id, label, isSelected, onClick, onMouseEnter, onMouseLeave }: ShapeProps) {
  const hw = width / 2;
  const hh = height / 2;
  const points = `${hw},0 ${width},${hh} ${hw},${height} 0,${hh}`;
  const hasName = label !== id;
  const labelX = hw - 6;
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <polygon
        points={points}
        fill={colors.vdi3682.energy}
        fillOpacity={isSelected ? 0.3 : effects.fillOpacity}
        stroke={colors.common.black}
        strokeWidth={effects.strokeWidth.default}
        filter={isSelected ? "url(#highlight-glow)" : undefined}
      />
      <text
        x={labelX}
        y={hasName ? -22 : -8}
        textAnchor="end"
        fontSize={typography.fontSize.stateLabel}
        fontFamily={FONT_FAMILY}
        fill={colors.common.black}
      >
        <tspan x={labelX} dy={0}>{id}</tspan>
        {hasName && <tspan x={labelX} dy={14}>{label}</tspan>}
      </text>
    </g>
  );
}

/** Information: Hexagon (dark blue) */
export function InformationShape({ x, y, width, height, id, label, isSelected, onClick, onMouseEnter, onMouseLeave }: ShapeProps) {
  const qw = width * 0.25;
  const hh = height / 2;
  const points = `${qw},0 ${width - qw},0 ${width},${hh} ${width - qw},${height} ${qw},${height} 0,${hh}`;
  const hasName = label !== id;
  const labelX = width / 2 - 6;
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <polygon
        points={points}
        fill={colors.vdi3682.information}
        fillOpacity={isSelected ? 0.3 : effects.fillOpacity}
        stroke={colors.common.black}
        strokeWidth={effects.strokeWidth.default}
        filter={isSelected ? "url(#highlight-glow)" : undefined}
      />
      <text
        x={labelX}
        y={hasName ? -22 : -8}
        textAnchor="end"
        fontSize={typography.fontSize.stateLabel}
        fontFamily={FONT_FAMILY}
        fill={colors.common.black}
      >
        <tspan x={labelX} dy={0}>{id}</tspan>
        {hasName && <tspan x={labelX} dy={14}>{label}</tspan>}
      </text>
    </g>
  );
}

/** ProcessOperator: Rectangle with sharp corners (green) — FPB.JS color #13ae4d */
export function ProcessOperatorShape({ x, y, width, height, id, label, isSelected, onClick, onMouseEnter, onMouseLeave }: ShapeProps) {
  const hasName = label !== id;
  const maxTextW = width - 12;
  const lines = hasName ? [id, label] : [id];
  const fs = autoFontSize(lines, maxTextW, typography.fontSize.processLabel);
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <rect
        width={width}
        height={height}
        rx={0}
        ry={0}
        fill={colors.vdi3682.processOperator}
        fillOpacity={isSelected ? 0.3 : effects.fillOpacity}
        stroke={colors.common.black}
        strokeWidth={effects.strokeWidth.default}
        filter={isSelected ? "url(#highlight-glow)" : undefined}
      />
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline={hasName ? undefined : "middle"}
        fontSize={fs}
        fontFamily={FONT_FAMILY}
        fill={colors.common.black}
      >
        <tspan x={width / 2} dy={hasName ? -fs * 0.6 : 0}>{id}</tspan>
        {hasName && <tspan x={width / 2} dy={fs * 1.2}>{label}</tspan>}
      </text>
    </g>
  );
}

/** TechnicalResource: Rectangle with sharp corners (gray) — FPB.JS color #888889 */
export function TechnicalResourceShape({ x, y, width, height, id, label, isSelected, onClick, onMouseEnter, onMouseLeave }: ShapeProps) {
  const hasName = label !== id;
  const maxTextW = width - 24;
  const lines = hasName ? [id, label] : [id];
  const fs = autoFontSize(lines, maxTextW, typography.fontSize.processLabel);
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <rect
        width={width}
        height={height}
        rx={40}
        ry={40}
        fill={colors.vdi3682.technicalResource}
        fillOpacity={isSelected ? 0.3 : effects.fillOpacity}
        stroke={colors.common.black}
        strokeWidth={effects.strokeWidth.default}
        filter={isSelected ? "url(#highlight-glow)" : undefined}
      />
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline={hasName ? undefined : "middle"}
        fontSize={fs}
        fontFamily={FONT_FAMILY}
        fill={colors.common.black}
      >
        <tspan x={width / 2} dy={hasName ? -fs * 0.6 : 0}>{id}</tspan>
        {hasName && <tspan x={width / 2} dy={fs * 1.2}>{label}</tspan>}
      </text>
    </g>
  );
}

/** SystemLimit: Dashed rectangular frame (no fill) — dash pattern 10,12 */
export function SystemLimitShape({ x, y, width, height, label }: SystemLimitShapeProps) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        width={width}
        height={height}
        fill="none"
        stroke={colors.common.black}
        strokeWidth={effects.strokeWidth.systemLimit}
        strokeDasharray={effects.dashPattern.systemLimit}
      />
      {label && (
        <text
          x={width}
          y={-5}
          fontSize={typography.fontSize.systemLimitLabel}
          fontFamily={FONT_FAMILY}
          fontWeight="bold"
          textAnchor="start"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/* ---------- Element dispatcher ---------- */

/** Renders the correct SVG shape for a given DiagramElement. */
export function ElementShape({
  element,
  isSelected,
  onClick,
  onMouseEnter,
  onMouseLeave
}: {
  element: DiagramElement;
  isSelected?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const props: ShapeProps = {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    id: element.id,
    label: element.label,
    isSelected,
    onClick,
    onMouseEnter,
    onMouseLeave,
  };

  switch (element.type) {
    case "state":
      switch (element.stateType) {
        case StateType.ENERGY:
          return <EnergyShape {...props} />;
        case StateType.INFORMATION:
          return <InformationShape {...props} />;
        case StateType.PRODUCT:
        default:
          return <ProductShape {...props} />;
      }
    case "processOperator":
      return <ProcessOperatorShape {...props} />;
    case "technicalResource":
      return <TechnicalResourceShape {...props} />;
    default:
      return null;
  }
}
