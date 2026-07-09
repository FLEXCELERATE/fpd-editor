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

            // When the Monaco editor is focused it owns undo/redo; those
            // shortcuts are handled inside the editor instead.
            const activeEl = document.activeElement;
            const isEditorFocused = activeEl?.closest('.monaco-editor') != null;

            // Ctrl/Cmd+±/0 are the browser's page-zoom shortcuts. Hijacking them
            // globally is an accessibility problem, so diagram zoom only applies
            // while focus is inside the diagram pane.
            const isDiagramFocused = activeEl?.closest('.split-pane__preview') != null;

            if (modifierKey && !isEditorFocused && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                onUndo();
            } else if (modifierKey && !isEditorFocused && e.shiftKey && key === 'z') {
                e.preventDefault();
                onRedo();
            } else if (modifierKey && isDiagramFocused && (key === '=' || key === '+')) {
                e.preventDefault();
                onZoomIn();
            } else if (modifierKey && isDiagramFocused && key === '-') {
                e.preventDefault();
                onZoomOut();
            } else if (modifierKey && isDiagramFocused && key === '0') {
                e.preventDefault();
                onResetViewport();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onUndo, onRedo, onZoomIn, onZoomOut, onResetViewport]);
}
