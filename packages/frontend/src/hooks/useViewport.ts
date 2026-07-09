/** Hook that manages viewport state (pan offset, zoom level) and provides controls for zoom operations. */

import { useCallback, useRef, useState } from 'react';
import type { DiagramBounds, Viewport } from '../types/diagram';

/** Minimum zoom level (10%) */
const MIN_ZOOM = 0.1;

/** Maximum zoom level (400%) */
const MAX_ZOOM = 4.0;

/** Default zoom step for zoom in/out operations (10%) */
const ZOOM_STEP = 0.1;

/** Zoom sensitivity for scroll wheel (smaller = less sensitive) */
const WHEEL_ZOOM_SENSITIVITY = 0.001;

/** Padding (in SVG units) added around the diagram for zoom-to-fit */
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
    /**
     * Provide the current diagram bounds (the backend SVG viewBox). Required for
     * pan/zoom to translate screen pixels into diagram coordinates correctly.
     */
    setBounds: (bounds: DiagramBounds | null) => void;
    /** Whether the user is currently panning */
    isPanning: boolean;
}

/**
 * Map a screen point to diagram (SVG viewBox) coordinates, mirroring how the
 * renderer draws the SVG: viewBox = (bounds.x + vp.x, bounds.y + vp.y,
 * bounds.width / zoom, bounds.height / zoom) with preserveAspectRatio
 * "xMidYMid meet" (uniform scale, centered / letterboxed).
 */
function screenToSvg(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
    bounds: DiagramBounds,
    vp: Viewport,
): { x: number; y: number; scale: number } {
    const viewBoxW = bounds.width / vp.zoom;
    const viewBoxH = bounds.height / vp.zoom;
    const scale = Math.min(rect.width / viewBoxW, rect.height / viewBoxH);
    const offsetX = (rect.width - viewBoxW * scale) / 2;
    const offsetY = (rect.height - viewBoxH * scale) / 2;
    return {
        x: bounds.x + vp.x + (clientX - rect.left - offsetX) / scale,
        y: bounds.y + vp.y + (clientY - rect.top - offsetY) / scale,
        scale,
    };
}

/** Compute the pan offset (vp.x, vp.y) that puts the given diagram point under a screen point. */
function panToAnchor(
    svgX: number,
    svgY: number,
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
    bounds: DiagramBounds,
    zoom: number,
): { x: number; y: number } {
    const viewBoxW = bounds.width / zoom;
    const viewBoxH = bounds.height / zoom;
    const scale = Math.min(rect.width / viewBoxW, rect.height / viewBoxH);
    const offsetX = (rect.width - viewBoxW * scale) / 2;
    const offsetY = (rect.height - viewBoxH * scale) / 2;
    return {
        x: svgX - bounds.x - (clientX - rect.left - offsetX) / scale,
        y: svgY - bounds.y - (clientY - rect.top - offsetY) / scale,
    };
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
function getTouchDistance(
    t1: { clientX: number; clientY: number },
    t2: { clientX: number; clientY: number },
): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Get midpoint between two touch points */
function getTouchMidpoint(
    t1: { clientX: number; clientY: number },
    t2: { clientX: number; clientY: number },
): { x: number; y: number } {
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
    const boundsRef = useRef<DiagramBounds | null>(null);

    const setBounds = useCallback((bounds: DiagramBounds | null) => {
        boundsRef.current = bounds;
    }, []);

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
            if (
                bounds.width <= 0 ||
                bounds.height <= 0 ||
                containerWidth <= 0 ||
                containerHeight <= 0
            ) {
                setViewport(INITIAL_VIEWPORT);
                return;
            }

            // In the renderer's convention the viewBox size is bounds/zoom, and
            // preserveAspectRatio="meet" already scales that viewBox to fit the
            // container. So "fit" means enlarging the viewBox just enough to add a
            // uniform padding margin around the diagram; the container aspect ratio
            // is handled by the SVG itself. zoom < 1 → viewBox larger than bounds →
            // padding; capped at 1 so we never crop.
            const zoomW = bounds.width / (bounds.width + ZOOM_TO_FIT_PADDING * 2);
            const zoomH = bounds.height / (bounds.height + ZOOM_TO_FIT_PADDING * 2);
            const zoom = clampZoom(Math.min(zoomW, zoomH, ZOOM_TO_FIT_MAX));

            // Center the diagram within the padded viewBox.
            const viewBoxW = bounds.width / zoom;
            const viewBoxH = bounds.height / zoom;
            const x = (bounds.width - viewBoxW) / 2;
            const y = (bounds.height - viewBoxH) / 2;

            setViewport({ x, y, zoom });
        },
        [],
    );

    const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
        e.preventDefault();

        // Support both React synthetic events and native events (cast via passive listener workaround).
        const svgElement = (e.currentTarget ??
            (e as unknown as WheelEvent).target) as SVGSVGElement;
        // Walk up to the SVG element if the target is a child element.
        const svg = svgElement.closest?.('svg') ?? svgElement;
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const bounds = boundsRef.current;
        if (!bounds) return;

        setViewport((prev) => {
            const zoomDelta = -e.deltaY * WHEEL_ZOOM_SENSITIVITY;
            const newZoom = clampZoom(prev.zoom * (1 + zoomDelta));
            if (newZoom === prev.zoom) return prev;

            // Diagram point currently under the cursor…
            const anchor = screenToSvg(e.clientX, e.clientY, rect, bounds, prev);
            // …must stay under the cursor after the zoom change.
            const { x, y } = panToAnchor(
                anchor.x,
                anchor.y,
                e.clientX,
                e.clientY,
                rect,
                bounds,
                newZoom,
            );
            return { x, y, zoom: newZoom };
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
        const rect = e.currentTarget.getBoundingClientRect();
        const bounds = boundsRef.current;
        // SVG units per screen pixel under the current viewBox + preserveAspectRatio.
        const unitsPerPx = bounds
            ? 1 /
              Math.min(
                  (rect.width * startViewport.zoom) / bounds.width,
                  (rect.height * startViewport.zoom) / bounds.height,
              )
            : 1 / startViewport.zoom;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            // Convert pixel delta to diagram coordinate delta
            const diagramDx = dx * unitsPerPx;
            const diagramDy = dy * unitsPerPx;

            setViewport({
                x: startViewport.x - diagramDx,
                y: startViewport.y - diagramDy,
                zoom: startViewport.zoom,
            });
        };

        const onMouseUp = () => {
            setIsPanning(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
        if (e.touches.length === 1) {
            // Single finger: pan
            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            const startViewport = viewportRef.current;
            const rect = e.currentTarget.getBoundingClientRect();
            const bounds = boundsRef.current;
            const unitsPerPx = bounds
                ? 1 /
                  Math.min(
                      (rect.width * startViewport.zoom) / bounds.width,
                      (rect.height * startViewport.zoom) / bounds.height,
                  )
                : 1 / startViewport.zoom;

            const onTouchMove = (moveEvent: TouchEvent) => {
                if (moveEvent.touches.length !== 1) return;
                moveEvent.preventDefault();

                const t = moveEvent.touches[0];
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;

                const diagramDx = dx * unitsPerPx;
                const diagramDy = dy * unitsPerPx;

                setViewport({
                    x: startViewport.x - diagramDx,
                    y: startViewport.y - diagramDy,
                    zoom: startViewport.zoom,
                });
            };

            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchEnd);
            };

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
            document.addEventListener('touchcancel', onTouchEnd);
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

                const bounds = boundsRef.current;
                let updated: Viewport;
                if (bounds) {
                    // Keep the diagram point under the pinch midpoint fixed.
                    const anchor = screenToSvg(newMidpoint.x, newMidpoint.y, rect, bounds, prev);
                    const panned = panToAnchor(
                        anchor.x,
                        anchor.y,
                        newMidpoint.x,
                        newMidpoint.y,
                        rect,
                        bounds,
                        newZoom,
                    );
                    updated = { x: panned.x, y: panned.y, zoom: newZoom };
                } else {
                    updated = { x: prev.x, y: prev.y, zoom: newZoom };
                }
                currentViewport = updated;
                setViewport(updated);

                lastDistance = newDistance;
            };

            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchEnd);
            };

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
            document.addEventListener('touchcancel', onTouchEnd);
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
        setBounds,
        isPanning,
    };
}
