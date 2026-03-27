/** Hook that sets up global keyboard shortcuts for undo/redo and zoom operations. */

import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetViewport: () => void;
}

export function useKeyboardShortcuts({
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetViewport,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const modifierKey = e.ctrlKey || e.metaKey; // Support both Ctrl (Windows/Linux) and Cmd (Mac)

      // Skip zoom shortcuts when Monaco editor has focus
      const activeEl = document.activeElement;
      const isEditorFocused = activeEl?.closest('.monaco-editor') != null;

      if (modifierKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (modifierKey && e.shiftKey && key === 'z') {
        e.preventDefault();
        onRedo();
      } else if (modifierKey && !isEditorFocused && (key === '=' || key === '+')) {
        e.preventDefault();
        onZoomIn();
      } else if (modifierKey && !isEditorFocused && key === '-') {
        e.preventDefault();
        onZoomOut();
      } else if (modifierKey && !isEditorFocused && key === '0') {
        e.preventDefault();
        onResetViewport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo, onZoomIn, onZoomOut, onResetViewport]);
}
