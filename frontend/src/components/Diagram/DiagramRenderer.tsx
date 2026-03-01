/** DiagramRenderer — Composes all SVG elements into a VDI 3682 diagram.
 *
 * Receives a ProcessModel, runs auto-layout, and renders:
 * - System limit boundary
 * - All element shapes (states, process operators, technical resources)
 * - All connections (flows, usages)
 * - SVG marker definitions
 * - Tooltip for element info on hover
 *
 * Uses viewBox manipulation for pan/zoom instead of inner <g> transform.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ProcessModel } from "../../types/fpb";
import type {
  DiagramData,
  DiagramElement,
  DiagramConnection,
  DiagramBounds,
  RoutedConnection,
  Viewport,
} from "../../types/diagram";
import { layoutProcessModel } from "./layout";
import { ElementShape, SystemLimitShape } from "./elements";
import { ConnectionDefs, RoutedConnectionLine } from "./connections";
import { computeRouting } from "./routing";
import { Tooltip } from "./Tooltip";
import { colors, typography } from "../../theme/designTokens";

interface DiagramRendererProps {
  model: ProcessModel | null;
  viewport?: Viewport;
  selectedElementId?: string | null;
  onElementClick?: (lineNumber: number) => void;
  /** Called when the content bounding box changes (e.g. after layout). */
  onContentBounds?: (bounds: DiagramBounds) => void;
  /** Event handlers forwarded to the SVG element for pan/zoom interaction. */
  onWheel?: React.WheelEventHandler<SVGSVGElement>;
  onMouseDown?: React.MouseEventHandler<SVGSVGElement>;
  onTouchStart?: React.TouchEventHandler<SVGSVGElement>;
  onTouchMove?: React.TouchEventHandler<SVGSVGElement>;
  onTouchEnd?: React.TouchEventHandler<SVGSVGElement>;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export interface DiagramRendererRef {
  /** Returns the root SVG DOM element for export, or null if no diagram is rendered. */
  getSvgElement(): SVGSVGElement | null;
}

/** Compute a lightweight fingerprint from model element IDs to detect structural changes. */
function modelFingerprint(model: ProcessModel | null): string {
  if (!model) return "";
  const ids = [
    ...model.states.map((s) => s.id),
    ...model.process_operators.map((p) => p.id),
    ...model.technical_resources.map((t) => t.id),
    ...model.flows.map((f) => f.id),
  ];
  return ids.join(",");
}

/** SVG-based VDI 3682 diagram renderer. */
export const DiagramRenderer = forwardRef<DiagramRendererRef, DiagramRendererProps>(
  function DiagramRenderer({
    model,
    viewport,
    selectedElementId,
    onElementClick,
    onContentBounds,
    onWheel,
    onMouseDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }, ref) {
  const vp = viewport ?? DEFAULT_VIEWPORT;
  const svgRef = useRef<SVGSVGElement>(null);

  useImperativeHandle(ref, () => ({
    getSvgElement: () => svgRef.current,
  }));

  const [hoveredElement, setHoveredElement] = useState<DiagramElement | null>(null);
  const prevBoundsRef = useRef<DiagramBounds | null>(null);

  // Fingerprint forces React to unmount/remount SVG when model structure changes,
  // preventing stale DOM elements from persisting across edits.
  const fingerprint = useMemo(() => modelFingerprint(model), [model]);

  const diagramData: DiagramData | null = useMemo(() => {
    if (!model) return null;
    return layoutProcessModel(model);
  }, [model]);

  const routedConnections: RoutedConnection[] = useMemo(() => {
    if (!diagramData) return [];
    return computeRouting(diagramData.elements, diagramData.connections);
  }, [diagramData]);

  /** Compute the natural content bounding box including label extents. */
  const contentBounds: DiagramBounds | null = useMemo(() => {
    if (!diagramData || diagramData.elements.length === 0) return null;

    const { elements, systemLimits } = diagramData;
    const charW = typography.fontSize.stateLabel * 0.6;

    const allX: number[] = [];
    const allY: number[] = [];
    const allRight: number[] = [];
    const allBottom: number[] = [];

    for (const e of elements) {
      allRight.push(e.x + e.width);
      allBottom.push(e.y + e.height);
      if (e.type === "state") {
        const longestLine = Math.max(e.id.length, e.label.length);
        const labelWidth = longestLine * charW;
        const labelAnchorX = e.x + e.width / 2 - 6;
        allX.push(labelAnchorX - labelWidth);
        allY.push(e.y - 35);
      } else {
        allX.push(e.x);
        allY.push(e.y);
      }
    }

    const slCharW = typography.fontSize.systemLimitLabel * 0.6;
    for (const sl of systemLimits) {
      allX.push(sl.x);
      allBottom.push(sl.y + sl.height);
      const slLabelWidth = sl.label.length * slCharW;
      allRight.push(sl.x + sl.width + slLabelWidth);
      allY.push(sl.y - typography.fontSize.systemLimitLabel - 5);
    }

    const margin = 50;
    const minX = Math.min(...allX) - margin;
    const minY = Math.min(...allY) - margin;
    const maxX = Math.max(...allRight) + margin;
    const maxY = Math.max(...allBottom) + margin;

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [diagramData]);

  // Store onWheel in a ref so native listener always calls the latest handler.
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;

  // Attach native wheel listener with { passive: false } so preventDefault() works.
  // React's onWheel is passive by default and cannot prevent page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onWheelRef.current) return;

    const handler = (e: WheelEvent) => {
      // Create a synthetic-like event object React's handler expects
      onWheelRef.current?.(e as unknown as React.WheelEvent<SVGSVGElement>);
    };

    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  // Notify parent when content bounds change.
  useEffect(() => {
    if (!contentBounds || !onContentBounds) return;
    const prev = prevBoundsRef.current;
    if (
      !prev ||
      prev.x !== contentBounds.x ||
      prev.y !== contentBounds.y ||
      prev.width !== contentBounds.width ||
      prev.height !== contentBounds.height
    ) {
      prevBoundsRef.current = contentBounds;
      onContentBounds(contentBounds);
    }
  }, [contentBounds, onContentBounds]);

  const handleElementClick = (element: DiagramElement) => {
    if (element.line_number != null && onElementClick) {
      onElementClick(element.line_number);
    }
  };

  const handleConnectionClick = (connection: DiagramConnection) => {
    if (connection.line_number != null && onElementClick) {
      onElementClick(connection.line_number);
    }
  };

  const handleElementMouseEnter = (element: DiagramElement) => {
    setHoveredElement(element);
  };

  const handleElementMouseLeave = () => {
    setHoveredElement(null);
  };

  if (!diagramData || !contentBounds) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: colors.ui.placeholderText,
          fontFamily: "sans-serif",
          fontSize: typography.fontSize.editor,
        }}
      >
        No diagram to display. Write FPB text on the left to get started.
      </div>
    );
  }

  const { elements, systemLimits } = diagramData;

  // Compute viewBox from viewport state + content bounds.
  // At default viewport (x=0, y=0, zoom=1): viewBox = content bounds.
  // Pan shifts the origin; zoom scales the visible area.
  const viewBoxX = contentBounds.x + vp.x;
  const viewBoxY = contentBounds.y + vp.y;
  const viewBoxW = contentBounds.width / vp.zoom;
  const viewBoxH = contentBounds.height / vp.zoom;
  const viewBox = `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`;

  return (
    <svg
      key={fingerprint}
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: colors.ui.background, cursor: "grab" }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <ConnectionDefs />

      {/* System limit boundaries */}
      {systemLimits.map(({ id, x, y, width, height, label }) => (
        <SystemLimitShape key={id} x={x} y={y} width={width} height={height} label={label} />
      ))}

      {/* Connections (rendered below elements) */}
      {routedConnections.map((rc) => (
        <RoutedConnectionLine
          key={rc.connection.id}
          routed={rc}
          onClick={() => handleConnectionClick(rc.connection)}
        />
      ))}

      {/* Element shapes */}
      {elements.map((el) => (
        <ElementShape
          key={el.id}
          element={el}
          isSelected={el.id === selectedElementId}
          onClick={() => handleElementClick(el)}
          onMouseEnter={() => handleElementMouseEnter(el)}
          onMouseLeave={handleElementMouseLeave}
        />
      ))}

      {/* Tooltip */}
      {hoveredElement && (
        <Tooltip
          element={hoveredElement}
          x={hoveredElement.x + hoveredElement.width}
          y={hoveredElement.y}
        />
      )}
    </svg>
  );
});
