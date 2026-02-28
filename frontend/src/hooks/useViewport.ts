/** Hook that manages viewport state (pan offset, zoom level) and provides controls for zoom operations. */

import { useCallback, useRef, useState } from "react";
import type { DiagramBounds, Viewport } from "../types/diagram";

/** Minimum zoom level (10%) */
const MIN_ZOOM = 0.1;

/** Maximum zoom level (400%) */
const MAX_ZOOM = 4.0;

/** Default zoom step for zoom in/out operations (10%) */
const ZOOM_STEP = 0.1;

/** Zoom sensitivity for scroll wheel (smaller = less sensitive) */
const WHEEL_ZOOM_SENSITIVITY = 0.001;

/** Padding ratio for zoom-to-fit (fraction of container size) */
const ZOOM_TO_FIT_PADDING = 30;

/** Maximum zoom for zoom-to-fit to avoid over-magnification */
const ZOOM_TO_FIT_MAX = 1.0;

interface UseViewportResult {
  /** Current viewport state */
  viewport: Viewport;
  /** Set the viewport state directly */
  setViewport: (viewport: Viewport) => void;
  /** Zoom in by the default step amount */
  zoomIn: () => void;
  /** Zoom out by the default step amount */
  zoomOut: () => void;
  /** Reset viewport to initial state (centered, 100% zoom) */
  resetViewport: () => void;
  /** Zoom to fit the diagram within the viewport */
  zoomToFit: (bounds: DiagramBounds, containerWidth: number, containerHeight: number) => void;
  /** Handler for mouse wheel zoom events — attach to SVG container */
  handleWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
  /** Handler for mouse down to start panning — attach to SVG container */
  handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  /** Handler for touch start (pan + pinch) — attach to SVG container */
  handleTouchStart: (e: React.TouchEvent<SVGSVGElement>) => void;
  /** Whether the user is currently panning */
  isPanning: boolean;
}

/** Initial viewport state: centered at origin with 100% zoom */
const INITIAL_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  zoom: 1.0,
};

/** Clamp zoom to allowed range */
function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

/** Get distance between two touch points */
function getTouchDistance(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Get midpoint between two touch points */
function getTouchMidpoint(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): { x: number; y: number } {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

/**
 * Custom hook for managing viewport pan and zoom state.
 *
 * Provides state for the current viewport position and zoom level,
 * along with functions to control zoom operations and event handlers
 * for mouse drag panning, wheel zoom, and touch gestures.
 * Enforces zoom constraints (10% to 400%).
 */
export function useViewport(): UseViewportResult {
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const zoomIn = useCallback(() => {
    setViewport((prev) => ({
      ...prev,
      zoom: clampZoom(prev.zoom + ZOOM_STEP),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((prev) => ({
      ...prev,
      zoom: clampZoom(prev.zoom - ZOOM_STEP),
    }));
  }, []);

  const resetViewport = useCallback(() => {
    setViewport(INITIAL_VIEWPORT);
  }, []);

  const zoomToFit = useCallback(
    (bounds: DiagramBounds, containerWidth: number, containerHeight: number) => {
      if (bounds.width <= 0 || bounds.height <= 0 || containerWidth <= 0 || containerHeight <= 0) {
        setViewport(INITIAL_VIEWPORT);
        return;
      }

      const paddedWidth = bounds.width + ZOOM_TO_FIT_PADDING * 2;
      const paddedHeight = bounds.height + ZOOM_TO_FIT_PADDING * 2;

      const scaleX = containerWidth / paddedWidth;
      const scaleY = containerHeight / paddedHeight;
      const zoom = clampZoom(Math.min(scaleX, scaleY, ZOOM_TO_FIT_MAX));

      // Center the diagram content in the viewport
      const viewWidth = containerWidth / zoom;
      const viewHeight = containerHeight / zoom;
      const x = bounds.x + bounds.width / 2 - viewWidth / 2;
      const y = bounds.y + bounds.height / 2 - viewHeight / 2;

      setViewport({ x, y, zoom });
    },
    [],
  );

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();

    // Support both React synthetic events and native events (cast via passive listener workaround).
    const svgElement = (e.currentTarget ?? (e as unknown as WheelEvent).target) as SVGSVGElement;
    // Walk up to the SVG element if the target is a child element.
    const svg = svgElement.closest?.("svg") ?? svgElement;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Cursor position relative to SVG element (0..1)
    const cursorFractionX = (e.clientX - rect.left) / rect.width;
    const cursorFractionY = (e.clientY - rect.top) / rect.height;

    setViewport((prev) => {
      const zoomDelta = -e.deltaY * WHEEL_ZOOM_SENSITIVITY;
      const newZoom = clampZoom(prev.zoom * (1 + zoomDelta));
      // Current view dimensions in diagram coordinates
      const viewWidth = rect.width / prev.zoom;
      const viewHeight = rect.height / prev.zoom;

      // Point under cursor in diagram coordinates
      const cursorDiagramX = prev.x + cursorFractionX * viewWidth;
      const cursorDiagramY = prev.y + cursorFractionY * viewHeight;

      // New view dimensions
      const newViewWidth = rect.width / newZoom;
      const newViewHeight = rect.height / newZoom;

      // Adjust pan so cursor point stays fixed
      const newX = cursorDiagramX - cursorFractionX * newViewWidth;
      const newY = cursorDiagramY - cursorFractionY * newViewHeight;

      return { x: newX, y: newY, zoom: newZoom };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only pan on left mouse button and on the SVG background (not elements)
    if (e.button !== 0) return;
    if ((e.target as Element) !== e.currentTarget) return;

    e.preventDefault();
    setIsPanning(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startViewport = viewportRef.current;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      // Convert pixel delta to diagram coordinate delta
      const diagramDx = dx / startViewport.zoom;
      const diagramDy = dy / startViewport.zoom;

      setViewport({
        x: startViewport.x - diagramDx,
        y: startViewport.y - diagramDy,
        zoom: startViewport.zoom,
      });
    };

    const onMouseUp = () => {
      setIsPanning(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      // Single finger: pan
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const startViewport = viewportRef.current;

      const onTouchMove = (moveEvent: TouchEvent) => {
        if (moveEvent.touches.length !== 1) return;
        moveEvent.preventDefault();

        const t = moveEvent.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        const diagramDx = dx / startViewport.zoom;
        const diagramDy = dy / startViewport.zoom;

        setViewport({
          x: startViewport.x - diagramDx,
          y: startViewport.y - diagramDy,
          zoom: startViewport.zoom,
        });
      };

      const onTouchEnd = () => {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
      };

      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
      document.addEventListener("touchcancel", onTouchEnd);
    } else if (e.touches.length === 2) {
      // Two fingers: pinch zoom
      e.preventDefault();
      let lastDistance = getTouchDistance(e.touches[0], e.touches[1]);
      let currentViewport = viewportRef.current;

      const rect = e.currentTarget.getBoundingClientRect();

      const onTouchMove = (moveEvent: TouchEvent) => {
        if (moveEvent.touches.length !== 2) return;
        moveEvent.preventDefault();

        const newDistance = getTouchDistance(moveEvent.touches[0], moveEvent.touches[1]);
        const newMidpoint = getTouchMidpoint(moveEvent.touches[0], moveEvent.touches[1]);

        const scaleFactor = newDistance / lastDistance;
        const prev = currentViewport;
        const newZoom = clampZoom(prev.zoom * scaleFactor);

        // Midpoint position as fraction of SVG element
        const midFractionX = (newMidpoint.x - rect.left) / rect.width;
        const midFractionY = (newMidpoint.y - rect.top) / rect.height;

        // Current view size
        const viewWidth = rect.width / prev.zoom;
        const viewHeight = rect.height / prev.zoom;

        // Point under midpoint in diagram coords
        const midDiagramX = prev.x + midFractionX * viewWidth;
        const midDiagramY = prev.y + midFractionY * viewHeight;

        // New view size
        const newViewWidth = rect.width / newZoom;
        const newViewHeight = rect.height / newZoom;

        const newX = midDiagramX - midFractionX * newViewWidth;
        const newY = midDiagramY - midFractionY * newViewHeight;

        const updated = { x: newX, y: newY, zoom: newZoom };
        currentViewport = updated;
        setViewport(updated);

        lastDistance = newDistance;
      };

      const onTouchEnd = () => {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
      };

      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
      document.addEventListener("touchcancel", onTouchEnd);
    }
  }, []);

  return {
    viewport,
    setViewport,
    zoomIn,
    zoomOut,
    resetViewport,
    zoomToFit,
    handleWheel,
    handleMouseDown,
    handleTouchStart,
    isPanning,
  };
}
