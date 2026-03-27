/** Hook that manages undo/redo history for application-level state changes. */

import { useCallback, useMemo, useReducer } from "react";

interface UseHistoryManagerOptions {
  /** Maximum number of undo steps to keep. Defaults to 50. */
  maxHistory?: number;
}

interface UseHistoryManagerResult {
  currentState: string;
  canUndo: boolean;
  canRedo: boolean;
  pushState: (newState: string) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

interface HistoryState {
  past: string[];
  current: string;
  future: string[];
}

type HistoryAction =
  | { type: "PUSH"; newState: string; maxHistory: number }
  | { type: "UNDO" }
  | { type: "REDO"; maxHistory: number }
  | { type: "CLEAR"; initialState: string };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "PUSH": {
      if (action.newState === state.current) return state;

      let newPast = [...state.past, state.current];
      if (newPast.length > action.maxHistory) {
        newPast = newPast.slice(newPast.length - action.maxHistory);
      }

      return {
        past: newPast,
        current: action.newState,
        future: [],
      };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;

      const newPast = [...state.past];
      const previousState = newPast.pop()!;

      return {
        past: newPast,
        current: previousState,
        future: [...state.future, state.current],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;

      const newFuture = [...state.future];
      const nextState = newFuture.pop()!;

      let newPast = [...state.past, state.current];
      if (newPast.length > action.maxHistory) {
        newPast = newPast.slice(newPast.length - action.maxHistory);
      }

      return {
        past: newPast,
        current: nextState,
        future: newFuture,
      };
    }
    case "CLEAR": {
      return {
        past: [],
        current: action.initialState,
        future: [],
      };
    }
  }
}

export function useHistoryManager(
  initialState: string,
  options?: UseHistoryManagerOptions,
): UseHistoryManagerResult {
  const maxHistory = options?.maxHistory ?? 50;

  const [state, dispatch] = useReducer(historyReducer, {
    past: [],
    current: initialState,
    future: [],
  });

  const pushState = useCallback(
    (newState: string) => {
      dispatch({ type: "PUSH", newState, maxHistory });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "REDO", maxHistory });
  }, [maxHistory]);

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR", initialState });
  }, [initialState]);

  return useMemo(() => ({
    currentState: state.current,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    pushState,
    undo,
    redo,
    clear,
  }), [state, pushState, undo, redo, clear]);
}
