/**
 * Unit tests for useViewport hook
 */

import { renderHook, act } from '@testing-library/react';
import { useViewport } from './useViewport';

describe('useViewport', () => {
  describe('initialization', () => {
    it('should initialize with default viewport (0,0 at 100% zoom)', () => {
      const { result } = renderHook(() => useViewport());

      expect(result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1.0 });
      expect(result.current.isPanning).toBe(false);
    });
  });

  describe('zoom clamping', () => {
    it('should clamp zoom at 400% when zooming in', () => {
      const { result } = renderHook(() => useViewport());

      // Set zoom near max
      act(() => {
        result.current.setViewport({ x: 0, y: 0, zoom: 3.95 });
      });

      // Zoom in — should not exceed 400%
      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.viewport.zoom).toBeLessThanOrEqual(4.0);

      // Zoom in again — should stay at 400%
      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.viewport.zoom).toBe(4.0);
    });

    it('should clamp zoom at 10% when zooming out', () => {
      const { result } = renderHook(() => useViewport());

      // Set zoom near min
      act(() => {
        result.current.setViewport({ x: 0, y: 0, zoom: 0.15 });
      });

      // Zoom out — should not go below 10%
      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.viewport.zoom).toBeGreaterThanOrEqual(0.1);

      // Zoom out again — should stay at 10%
      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.viewport.zoom).toBeCloseTo(0.1, 5);
    });
  });

  describe('zoomToFit', () => {
    it('should compute correct viewport for known bounds and container', () => {
      const { result } = renderHook(() => useViewport());

      act(() => {
        result.current.zoomToFit(
          { x: 0, y: 0, width: 800, height: 600 },
          800,
          600,
        );
      });

      // With padding of 30 on each side, padded dims = 860x660
      // scaleX = 800/860 ≈ 0.930, scaleY = 600/660 ≈ 0.909
      // zoom = min(0.930, 0.909, 1.0) ≈ 0.909
      const { viewport } = result.current;
      expect(viewport.zoom).toBeGreaterThan(0.1);
      expect(viewport.zoom).toBeLessThanOrEqual(1.0);
    });

    it('should cap zoom at 100% for small diagrams', () => {
      const { result } = renderHook(() => useViewport());

      // Small diagram in a large container
      act(() => {
        result.current.zoomToFit(
          { x: 0, y: 0, width: 100, height: 100 },
          1000,
          1000,
        );
      });

      // scaleX = 1000/160 = 6.25, scaleY = 1000/160 = 6.25
      // zoom = min(6.25, 6.25, 1.0) = 1.0
      expect(result.current.viewport.zoom).toBe(1.0);
    });

    it('should reset to initial viewport for zero-size bounds', () => {
      const { result } = renderHook(() => useViewport());

      // First change viewport
      act(() => {
        result.current.setViewport({ x: 50, y: 50, zoom: 2.0 });
      });

      // Zero-size bounds should reset
      act(() => {
        result.current.zoomToFit(
          { x: 0, y: 0, width: 0, height: 0 },
          800,
          600,
        );
      });

      expect(result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1.0 });
    });
  });

  describe('zoom preserves pan offset', () => {
    it('zoomIn should not reset pan offset', () => {
      const { result } = renderHook(() => useViewport());

      act(() => {
        result.current.setViewport({ x: 100, y: 200, zoom: 1.0 });
      });

      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.viewport.x).toBe(100);
      expect(result.current.viewport.y).toBe(200);
      expect(result.current.viewport.zoom).toBeCloseTo(1.1, 5);
    });

    it('zoomOut should not reset pan offset', () => {
      const { result } = renderHook(() => useViewport());

      act(() => {
        result.current.setViewport({ x: 100, y: 200, zoom: 1.0 });
      });

      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.viewport.x).toBe(100);
      expect(result.current.viewport.y).toBe(200);
      expect(result.current.viewport.zoom).toBeCloseTo(0.9, 5);
    });
  });

  describe('resetViewport', () => {
    it('should reset to initial viewport state', () => {
      const { result } = renderHook(() => useViewport());

      act(() => {
        result.current.setViewport({ x: 50, y: 75, zoom: 2.5 });
      });

      act(() => {
        result.current.resetViewport();
      });

      expect(result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1.0 });
    });
  });
});
