/** Hook that manages split-pane resize logic via mouse drag and keyboard arrows on the divider. */

import { useCallback, useState } from 'react';
import type { RefObject } from 'react';

/** Minimum width in pixels for either pane */
const MIN_PANE_WIDTH = 200;

/** Pixels to adjust per arrow key press on the divider */
const ARROW_KEY_STEP = 20;

interface UseSplitPaneResult {
  editorWidth: number | null;
  editorStyle: { flex: string; width: number } | undefined;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useSplitPane(splitPaneRef: RefObject<HTMLElement | null>): UseSplitPaneResult {
  const [editorWidth, setEditorWidth] = useState<number | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const pane = splitPaneRef.current;
      if (!pane) return;

      const startWidth = editorWidth ?? pane.getBoundingClientRect().width / 2;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(MIN_PANE_WIDTH, startWidth + delta);
        const maxWidth = pane.getBoundingClientRect().width - MIN_PANE_WIDTH;
        setEditorWidth(Math.min(newWidth, maxWidth));
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editorWidth, splitPaneRef],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const pane = splitPaneRef.current;
      if (!pane) return;

      const currentWidth = editorWidth ?? pane.getBoundingClientRect().width / 2;
      const maxWidth = pane.getBoundingClientRect().width - MIN_PANE_WIDTH;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setEditorWidth(Math.max(MIN_PANE_WIDTH, currentWidth - ARROW_KEY_STEP));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setEditorWidth(Math.min(maxWidth, currentWidth + ARROW_KEY_STEP));
      }
    },
    [editorWidth, splitPaneRef],
  );

  const editorStyle = editorWidth != null ? { flex: 'none', width: editorWidth } : undefined;

  return { editorWidth, editorStyle, handleMouseDown, handleKeyDown };
}
