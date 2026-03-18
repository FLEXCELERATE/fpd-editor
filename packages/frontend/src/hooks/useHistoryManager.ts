/** Hook that manages undo/redo history for application-level state changes. */

import { useCallback, useState } from "react";

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

export function useHistoryManager(
  initialState: string,
  options?: UseHistoryManagerOptions,
): UseHistoryManagerResult {
  const maxHistory = options?.maxHistory ?? 50;

  const [currentState, setCurrentState] = useState<string>(initialState);
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);

  const pushState = useCallback(
    (newState: string) => {
      // Don't push if state hasn't changed
      if (newState === currentState) return;

      // Add current state to past
      setPast((prevPast) => {
        const newPast = [...prevPast, currentState];
        // Limit history size
        if (newPast.length > maxHistory) {
          return newPast.slice(newPast.length - maxHistory);
        }
        return newPast;
      });

      // Clear future when pushing new state
      setFuture([]);

      // Set new current state
      setCurrentState(newState);
    },
    [currentState, maxHistory],
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;

    const newPast = [...past];
    const previousState = newPast.pop();

    if (previousState === undefined) return;

    // Add current state to future
    setFuture((prevFuture) => [...prevFuture, currentState]);

    // Update past and current state
    setPast(newPast);
    setCurrentState(previousState);
  }, [past, currentState]);

  const redo = useCallback(() => {
    if (future.length === 0) return;

    const newFuture = [...future];
    const nextState = newFuture.pop();

    if (nextState === undefined) return;

    // Add current state to past
    setPast((prevPast) => {
      const newPast = [...prevPast, currentState];
      // Limit history size
      if (newPast.length > maxHistory) {
        return newPast.slice(newPast.length - maxHistory);
      }
      return newPast;
    });

    // Update future and current state
    setFuture(newFuture);
    setCurrentState(nextState);
  }, [future, currentState, maxHistory]);

  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
    setCurrentState(initialState);
  }, [initialState]);

  return {
    currentState,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pushState,
    undo,
    redo,
    clear,
  };
}
