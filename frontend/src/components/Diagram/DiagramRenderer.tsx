/** DiagramRenderer — Displays backend-rendered SVG with pan/zoom.
 *
 * Receives raw SVG markup from the backend, injects it into the DOM
 * using DOMParser (to preserve SVG namespace), and applies viewBox
 * manipulation for pan/zoom interaction.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DiagramBounds, Viewport } from "../../types/diagram";
import { colors, typography } from "../../theme/designTokens";

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
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export interface DiagramRendererRef {
  /** Returns the root SVG DOM element for export, or null if no diagram is rendered. */
  getSvgElement(): SVGSVGElement | null;
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

/** SVG-based VDI 3682 diagram renderer using backend SVG. */
export const DiagramRenderer = forwardRef<DiagramRendererRef, DiagramRendererProps>(
  function DiagramRenderer(
    {
      svgContent,
      viewport,
      onContentBounds,
      onWheel,
      onMouseDown,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    ref,
  ) {
    const vp = viewport ?? DEFAULT_VIEWPORT;
    const svgRef = useRef<SVGSVGElement>(null);
    const contentGroupRef = useRef<SVGGElement>(null);
    const contentBoundsRef = useRef<DiagramBounds | null>(null);

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

      const { viewBox, svgDoc, rootSvg } = parseSvgContent(svgContent);
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

    if (!svgContent) {
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

    return (
      <svg
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
        <g ref={contentGroupRef} />
      </svg>
    );
  },
);
