/**
 * Unit tests for useHistoryManager hook
 *
 * To run these tests, install a test framework like Vitest:
 * npm install -D vitest @testing-library/react @testing-library/react-hooks
 *
 * Then add to package.json scripts:
 * "test": "vitest"
 */

import { renderHook, act } from '@testing-library/react';
import { useHistoryManager } from './useHistoryManager';

describe('useHistoryManager', () => {
  const INITIAL_STATE = 'initial';

  describe('initialization', () => {
    it('should initialize with provided initial state', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      expect(result.current.currentState).toBe(INITIAL_STATE);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should use default maxHistory of 50', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      // Push 51 states
      act(() => {
        for (let i = 1; i <= 51; i++) {
          result.current.pushState(`state-${i}`);
        }
      });

      // Should be at state-51
      expect(result.current.currentState).toBe('state-51');

      // Should be able to undo 50 times (states 50, 49, ..., 1)
      for (let i = 50; i >= 1; i--) {
        act(() => {
          result.current.undo();
        });
        expect(result.current.currentState).toBe(`state-${i}`);
      }

      // One more undo should bring us to initial state
      act(() => {
        result.current.undo();
      });
      expect(result.current.currentState).toBe(INITIAL_STATE);

      // Should not be able to undo further
      expect(result.current.canUndo).toBe(false);
    });

    it('should accept custom maxHistory option', () => {
      const { result } = renderHook(() =>
        useHistoryManager(INITIAL_STATE, { maxHistory: 3 })
      );

      // Push 4 states
      act(() => {
        result.current.pushState('state-1');
        result.current.pushState('state-2');
        result.current.pushState('state-3');
        result.current.pushState('state-4');
      });

      // Should be at state-4
      expect(result.current.currentState).toBe('state-4');

      // Should only be able to undo 3 times (to state-3, state-2, state-1)
      act(() => {
        result.current.undo(); // -> state-3
        result.current.undo(); // -> state-2
        result.current.undo(); // -> state-1
      });

      expect(result.current.currentState).toBe('state-1');

      // Should not be able to undo to initial state (it was dropped)
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('pushState', () => {
    it('should push new state and enable undo', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('new-state');
      });

      expect(result.current.currentState).toBe('new-state');
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('should not push duplicate state', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState(INITIAL_STATE);
      });

      // Should not create history entry for same state
      expect(result.current.currentState).toBe(INITIAL_STATE);
      expect(result.current.canUndo).toBe(false);
    });

    it('should clear future history when pushing new state', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      // Create history
      act(() => {
        result.current.pushState('state-1');
        result.current.pushState('state-2');
      });

      // Undo to create future history
      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo).toBe(true);

      // Push new state - should clear future
      act(() => {
        result.current.pushState('state-3');
      });

      expect(result.current.currentState).toBe('state-3');
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('undo', () => {
    it('should restore previous state', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('state-1');
        result.current.undo();
      });

      expect(result.current.currentState).toBe(INITIAL_STATE);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it('should handle multiple undos', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('state-1');
        result.current.pushState('state-2');
        result.current.pushState('state-3');
      });

      act(() => {
        result.current.undo();
      });
      expect(result.current.currentState).toBe('state-2');

      act(() => {
        result.current.undo();
      });
      expect(result.current.currentState).toBe('state-1');

      act(() => {
        result.current.undo();
      });
      expect(result.current.currentState).toBe(INITIAL_STATE);
      expect(result.current.canUndo).toBe(false);
    });

    it('should do nothing when no history', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.undo();
      });

      expect(result.current.currentState).toBe(INITIAL_STATE);
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('redo', () => {
    it('should restore next state after undo', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('state-1');
        result.current.undo();
        result.current.redo();
      });

      expect(result.current.currentState).toBe('state-1');
      expect(result.current.canRedo).toBe(false);
      expect(result.current.canUndo).toBe(true);
    });

    it('should handle multiple redos', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('state-1');
        result.current.pushState('state-2');
        result.current.pushState('state-3');
        result.current.undo();
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.currentState).toBe(INITIAL_STATE);

      act(() => {
        result.current.redo();
      });
      expect(result.current.currentState).toBe('state-1');

      act(() => {
        result.current.redo();
      });
      expect(result.current.currentState).toBe('state-2');

      act(() => {
        result.current.redo();
      });
      expect(result.current.currentState).toBe('state-3');
      expect(result.current.canRedo).toBe(false);
    });

    it('should do nothing when no future history', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('state-1');
        result.current.redo();
      });

      expect(result.current.currentState).toBe('state-1');
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reset to initial state and clear history', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      act(() => {
        result.current.pushState('state-1');
        result.current.pushState('state-2');
        result.current.undo();
      });

      // Should have both past and future
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.clear();
      });

      expect(result.current.currentState).toBe(INITIAL_STATE);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('complex scenarios', () => {
    it('should handle undo/redo chain', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      // Build history
      act(() => {
        result.current.pushState('state-1');
        result.current.pushState('state-2');
        result.current.pushState('state-3');
      });

      // Undo twice
      act(() => {
        result.current.undo();
        result.current.undo();
      });
      expect(result.current.currentState).toBe('state-1');

      // Redo once
      act(() => {
        result.current.redo();
      });
      expect(result.current.currentState).toBe('state-2');

      // Undo once
      act(() => {
        result.current.undo();
      });
      expect(result.current.currentState).toBe('state-1');

      // Push new state (should clear future)
      act(() => {
        result.current.pushState('state-4');
      });
      expect(result.current.currentState).toBe('state-4');
      expect(result.current.canRedo).toBe(false);

      // Undo should go to state-1, not state-2
      act(() => {
        result.current.undo();
      });
      expect(result.current.currentState).toBe('state-1');
    });

    it('should maintain correct canUndo/canRedo flags', () => {
      const { result } = renderHook(() => useHistoryManager(INITIAL_STATE));

      // Initial: no undo, no redo
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      // After push: can undo, no redo
      act(() => {
        result.current.pushState('state-1');
      });
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      // After undo: no undo (back at initial), can redo
      act(() => {
        result.current.undo();
      });
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);

      // After redo: can undo, no redo (at latest)
      act(() => {
        result.current.redo();
      });
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });
  });
});
