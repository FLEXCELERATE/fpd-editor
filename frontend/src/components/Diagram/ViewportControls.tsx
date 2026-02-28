/** Viewport controls for zoom operations and zoom level display. */

interface ViewportControlsProps {
  /** Current zoom level (e.g., 1.0 for 100%) */
  zoom: number;
  /** Callback to zoom in */
  onZoomIn: () => void;
  /** Callback to zoom out */
  onZoomOut: () => void;
  /** Callback to zoom to fit the entire diagram */
  onZoomToFit: () => void;
}

export function ViewportControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
}: ViewportControlsProps) {
  // Format zoom as percentage (e.g., 1.0 -> "100%")
  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div className="viewport-controls">
      <div className="viewport-controls__zoom-display">
        {zoomPercentage}%
      </div>
      <button
        className="viewport-controls__button"
        onClick={onZoomIn}
        title="Zoom In (Ctrl++)"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        className="viewport-controls__button"
        onClick={onZoomOut}
        title="Zoom Out (Ctrl+-)"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        className="viewport-controls__button"
        onClick={onZoomToFit}
        title="Zoom to Fit"
        aria-label="Zoom to fit"
      >
        ⊡
      </button>
    </div>
  );
}
