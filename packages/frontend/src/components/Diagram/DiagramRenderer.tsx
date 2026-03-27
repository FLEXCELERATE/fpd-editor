/** DiagramRenderer — Displays backend-rendered SVG with pan/zoom and hover tooltips.
 *
 * Receives raw SVG markup from the backend, injects it into the DOM
 * using DOMParser (to preserve SVG namespace), and applies viewBox
 * manipulation for pan/zoom interaction.
 *
 * Uses event delegation on data-* attributes for hover tooltips.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DiagramBounds, Viewport } from "../../types/diagram";
import { colors, typography } from "../../theme/designTokens";

/** Pan step in SVG units when using arrow keys. */
const KEYBOARD_PAN_STEP = 30;

interface DiagramRendererProps {
  svgContent: string | null;
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
  /** Viewport manipulation callbacks for keyboard support. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSetViewport?: (viewport: Viewport) => void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export interface DiagramRendererRef {
  /** Returns the root SVG DOM element for export, or null if no diagram is rendered. */
  getSvgElement(): SVGSVGElement | null;
}

/** Info extracted from data-* attributes on hovered SVG elements. */
interface HoveredElementInfo {
  elementId: string;
  elementType: string;
  stateType?: string;
  /** Position in SVG coordinates. */
  svgX: number;
  svgY: number;
}

/** Parse the backend SVG string and extract the viewBox and inner content nodes. */
function parseSvgContent(svgString: string): {
  viewBox: DiagramBounds | null;
  svgDoc: Document;
  rootSvg: SVGSVGElement | null;
} {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const rootSvg = svgDoc.querySelector("svg");

  let viewBox: DiagramBounds | null = null;
  if (rootSvg) {
    const vb = rootSvg.getAttribute("viewBox");
    if (vb) {
      const parts = vb.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
        viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
      }
    }
  }

  return { viewBox, svgDoc, rootSvg };
}

/** Maps element type data attributes to human-readable labels. */
function getTypeLabel(elementType: string, stateType?: string): string {
  if (elementType === "state" && stateType) {
    return stateType.charAt(0).toUpperCase() + stateType.slice(1);
  }
  switch (elementType) {
    case "processOperator":
      return "Process Operator";
    case "technicalResource":
      return "Technical Resource";
    case "state":
      return "State";
    default:
      return elementType;
  }
}

/** SVG-based VDI 3682 diagram renderer using backend SVG. */
export const DiagramRenderer = forwardRef<DiagramRendererRef, DiagramRendererProps>(
  function DiagramRenderer(
    {
      svgContent,
      viewport,
      onElementClick,
      onContentBounds,
      onWheel,
      onMouseDown,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onZoomIn,
      onZoomOut,
      onSetViewport,
    },
    ref,
  ) {
    const vp = viewport ?? DEFAULT_VIEWPORT;
    const svgRef = useRef<SVGSVGElement>(null);
    const contentGroupRef = useRef<SVGGElement>(null);
    const contentBoundsRef = useRef<DiagramBounds | null>(null);
    const [hovered, setHovered] = useState<HoveredElementInfo | null>(null);

    useImperativeHandle(ref, () => ({
      getSvgElement: () => svgRef.current,
    }));

    // Store onWheel in a ref so native listener always calls the latest handler.
    const onWheelRef = useRef(onWheel);
    onWheelRef.current = onWheel;

    // Attach native wheel listener with { passive: false } so preventDefault() works.
    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;

      const handler = (e: WheelEvent) => {
        onWheelRef.current?.(e as unknown as React.WheelEvent<SVGSVGElement>);
      };

      svg.addEventListener("wheel", handler, { passive: false });
      return () => svg.removeEventListener("wheel", handler);
    }, []);

    // Inject backend SVG content into the <g> element via DOMParser.
    useEffect(() => {
      const g = contentGroupRef.current;
      if (!g || !svgContent) {
        if (g) g.innerHTML = "";
        return;
      }

      const { viewBox, rootSvg } = parseSvgContent(svgContent);
      if (!rootSvg) return;

      // Clear previous content
      while (g.firstChild) g.removeChild(g.firstChild);

      // Import and append all children from the parsed SVG
      const ownerDoc = g.ownerDocument;
      for (const child of Array.from(rootSvg.childNodes)) {
        const imported = ownerDoc.importNode(child, true);
        g.appendChild(imported);
      }

      // Notify parent of content bounds
      if (viewBox && onContentBounds) {
        const prev = contentBoundsRef.current;
        if (
          !prev ||
          prev.x !== viewBox.x ||
          prev.y !== viewBox.y ||
          prev.width !== viewBox.width ||
          prev.height !== viewBox.height
        ) {
          contentBoundsRef.current = viewBox;
          onContentBounds(viewBox);
        }
      }
    }, [svgContent, onContentBounds]);

    /** Convert screen coordinates to SVG coordinates. */
    const screenToSvg = useCallback(
      (clientX: number, clientY: number): { x: number; y: number } | null => {
        const svg = svgRef.current;
        if (!svg) return null;
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        const svgPt = pt.matrixTransform(ctm.inverse());
        return { x: svgPt.x, y: svgPt.y };
      },
      [],
    );

    /** Handle mouse move for hover tooltip via event delegation. */
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        const target = e.target as Element;
        const elementGroup = target.closest("[data-element-id]");
        const connectionPath = target.closest("[data-connection-id]");
        const isClickable = !!(elementGroup || connectionPath);

        // Toggle cursor between pointer (clickable element) and grab (pan)
        const svg = svgRef.current;
        if (svg) {
          svg.style.cursor = isClickable ? "pointer" : "grab";
        }

        if (elementGroup) {
          const elementId = elementGroup.getAttribute("data-element-id") ?? "";
          const elementType = elementGroup.getAttribute("data-element-type") ?? "";
          const stateType = elementGroup.getAttribute("data-state-type") ?? undefined;
          const svgPos = screenToSvg(e.clientX, e.clientY);
          if (svgPos) {
            setHovered({ elementId, elementType, stateType, svgX: svgPos.x, svgY: svgPos.y });
          }
        } else {
          if (hovered) setHovered(null);
        }
      },
      [screenToSvg, hovered],
    );

    const handleMouseLeave = useCallback(() => {
      setHovered(null);
    }, []);

    /** Handle double-click to jump to source line via event delegation. */
    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        if (!onElementClick) return;
        const target = e.target as Element;
        // Check elements first, then connections
        const elementGroup = target.closest("[data-element-id]");
        const connectionPath = target.closest("[data-connection-id]");
        const match = elementGroup ?? connectionPath;
        if (match) {
          const lineNum = match.getAttribute("data-line-number");
          if (lineNum) {
            onElementClick(Number(lineNum));
          }
        }
      },
      [onElementClick],
    );

    /** Handle keyboard events for pan (arrow keys) and zoom (+/-). */
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const key = e.key;
        switch (key) {
          case "ArrowLeft":
            e.preventDefault();
            onSetViewport?.({ ...vp, x: vp.x - KEYBOARD_PAN_STEP / vp.zoom });
            break;
          case "ArrowRight":
            e.preventDefault();
            onSetViewport?.({ ...vp, x: vp.x + KEYBOARD_PAN_STEP / vp.zoom });
            break;
          case "ArrowUp":
            e.preventDefault();
            onSetViewport?.({ ...vp, y: vp.y - KEYBOARD_PAN_STEP / vp.zoom });
            break;
          case "ArrowDown":
            e.preventDefault();
            onSetViewport?.({ ...vp, y: vp.y + KEYBOARD_PAN_STEP / vp.zoom });
            break;
          case "+":
          case "=":
            e.preventDefault();
            onZoomIn?.();
            break;
          case "-":
            e.preventDefault();
            onZoomOut?.();
            break;
          default:
            break;
        }
      },
      [vp, onSetViewport, onZoomIn, onZoomOut],
    );

    if (!svgContent) {
      return (
        <div
          aria-label="FPD diagram preview"
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
          No diagram to display. Write FPD text on the left to get started.
        </div>
      );
    }

    // Extract viewBox from backend SVG for pan/zoom calculation.
    const { viewBox: backendBounds } = parseSvgContent(svgContent);
    const bounds = backendBounds ?? { x: 0, y: 0, width: 800, height: 600 };

    const viewBoxX = bounds.x + vp.x;
    const viewBoxY = bounds.y + vp.y;
    const viewBoxW = bounds.width / vp.zoom;
    const viewBoxH = bounds.height / vp.zoom;
    const viewBox = `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`;

    // Tooltip dimensions in SVG coordinates
    const ttPadding = 8;
    const ttLineHeight = 16;
    const ttWidth = 200;
    const ttHeight = ttPadding * 2 + ttLineHeight * 2;
    const ttFontSize = 12;
    const ttOffset = 10;

    return (
      <div
        aria-label="FPD diagram preview"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ width: "100%", height: "100%", outline: "none" }}
      >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="FPD process diagram"
        style={{ background: colors.ui.background, cursor: "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <g ref={contentGroupRef} />

        {/* Hover tooltip */}
        {hovered && (
          <g
            transform={`translate(${hovered.svgX + ttOffset},${hovered.svgY + ttOffset})`}
            style={{ pointerEvents: "none" }}
          >
            <rect
              x={0}
              y={0}
              width={ttWidth}
              height={ttHeight}
              rx={4}
              ry={4}
              fill="#333"
              fillOpacity={0.95}
              stroke="#666"
              strokeWidth={1}
            />
            <text
              x={ttPadding}
              y={ttPadding + ttLineHeight}
              fontSize={ttFontSize}
              fontWeight="bold"
              fill="#fff"
              fontFamily="sans-serif"
            >
              {getTypeLabel(hovered.elementType, hovered.stateType)}
            </text>
            <text
              x={ttPadding}
              y={ttPadding + ttLineHeight * 2}
              fontSize={ttFontSize}
              fill="#ccc"
              fontFamily="monospace"
            >
              ID: {hovered.elementId}
            </text>
          </g>
        )}
      </svg>
      </div>
    );
  },
);
