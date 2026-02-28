import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import FpbEditor, { FpbEditorRef } from './components/Editor/FpbEditor';
import { DiagramRenderer, DiagramRendererRef } from './components/Diagram/DiagramRenderer';
import { ViewportControls } from './components/Diagram/ViewportControls';
import { Toolbar } from './components/Toolbar/Toolbar';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { useFpbParser } from './hooks/useFpbParser';
import { useDiagramSync } from './hooks/useDiagramSync';
import { useHistoryManager } from './hooks/useHistoryManager';
import { useViewport } from './hooks/useViewport';
import type { ProcessModel } from './types/fpb';
import type { DiagramBounds } from './types/diagram';

const DEFAULT_SOURCE = `@startfpb
title "FLEXCELERATE DosingModule_v01"

system "DosingModule_v01" {
  // === Input Products ===
  product P1 "Medium A"
  product P2 "Medium B"
  product P3 "(Inert) Gas"
  product P4 "Cleansing Medium"

  // === Intermediate Products ===
  product P7 "Stored Medium"
  product P8 "Transported Medium"
  product P9 "Circulation"
  product P10 "Circulated Medium"

  // === Output Products ===
  product P5 "Exhaust Gas"
  product P6 "(Inert) Gas"
  product P11 "Waste"
  product P12 "Product"

  // === Energy ===
  energy E1 "Electrical Energy"

  // === Information Inputs ===
  information I1 "Pressure"
  information I2 "Level"
  information I5 "Flow"
  information I6 "Circulation Time"
  information I9 "Pressure"
  information I10 "Flow"
  information I11 "Amount"

  // === Information Outputs ===
  information I3 "Level"
  information I4 "Pressure"
  information I7 "Flow"
  information I8 "Flow-Ratio"
  information I12 "Flow"
  information I13 "Pressure"
  information I14 "Energy Consumption"

  // === Process Operators ===
  process_operator O1 "Storing"
  process_operator O2 "Transporting"
  process_operator O3 "Circulation"
  process_operator O4 "Dosing"

  // === O1 Storing ===
  P1 --> O1
  P2 --> O1
  P3 --> O1
  P4 --> O1
  I1 ==> O1
  I2 ==> O1
  O1 --> P5
  O1 --> P6
  O1 --> P7

  // === O2 Transporting ===
  P7 --> O2
  E1 --> O2
  P9 --> O1
  O2 --> P8
  O2 ==> I3
  O2 ==> I4

  // === O3 Circulation ===
  P8 --> O3
  I5 -.-> O3
  I6 -.-> O3
  O3 --> P9
  O3 -.-> P10
  O3 -.-> P11
  O3 ==> I7
  O3 ==> I8

  // === O4 Dosing ===
  P10 --> O4
  I9 ==> O4
  I10 -.-> O4
  I11 -.-> O4
  O4 --> P12
  O4 ==> I12
  O4 ==> I13
  O4 ==> I14
}

@endfpb
`;

export default function App() {
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<FpbEditorRef>(null);
  const diagramRef = useRef<DiagramRendererRef>(null);
  const diagramContainerRef = useRef<HTMLDivElement>(null);
  const contentBoundsRef = useRef<DiagramBounds | null>(null);
  const [editorWidth, setEditorWidth] = useState<number | null>(null);

  // Use history manager for application-level undo/redo
  const historyManager = useHistoryManager(DEFAULT_SOURCE);
  const source = historyManager.currentState;

  const { model, error, loading, sessionId } = useFpbParser(source);
  const { lineToElement, selectedElementId, setSelectedElementId } = useDiagramSync(model);
  const {
    viewport,
    zoomIn,
    zoomOut,
    zoomToFit,
    resetViewport,
    handleWheel,
    handleMouseDown: handleDiagramMouseDown,
    handleTouchStart,
  } = useViewport();

  const handleContentBounds = useCallback((bounds: DiagramBounds) => {
    contentBoundsRef.current = bounds;
  }, []);

  const handleZoomToFit = useCallback(() => {
    const container = diagramContainerRef.current;
    const bounds = contentBoundsRef.current;
    if (!container || !bounds) return;
    const rect = container.getBoundingClientRect();
    zoomToFit(bounds, rect.width, rect.height);
  }, [zoomToFit]);

  const handleElementClick = useCallback((lineNumber: number) => {
    editorRef.current?.scrollToLine(lineNumber);
  }, []);

  const getSvgElement = useCallback(() => {
    return diagramRef.current?.getSvgElement() ?? null;
  }, []);

  const handleUndo = useCallback(() => {
    historyManager.undo();
  }, [historyManager]);

  const handleRedo = useCallback(() => {
    historyManager.redo();
  }, [historyManager]);

  // Keyboard shortcuts for undo/redo and zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const modifierKey = e.ctrlKey || e.metaKey; // Support both Ctrl (Windows/Linux) and Cmd (Mac)

      // Skip zoom shortcuts when Monaco editor has focus
      const activeEl = document.activeElement;
      const isEditorFocused = activeEl?.closest('.monaco-editor') != null;

      if (modifierKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (modifierKey && e.shiftKey && key === 'z') {
        e.preventDefault();
        handleRedo();
      } else if (modifierKey && !isEditorFocused && (key === '=' || key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if (modifierKey && !isEditorFocused && key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (modifierKey && !isEditorFocused && key === '0') {
        e.preventDefault();
        resetViewport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, zoomIn, zoomOut, resetViewport]);

  const handleImport = useCallback((_source: string, _model: ProcessModel) => {
    historyManager.pushState(_source);
  }, [historyManager]);

  const handleCursorPositionChange = useCallback(
    (lineNumber: number) => {
      const elementMapping = lineToElement.get(lineNumber);
      setSelectedElementId(elementMapping?.elementId ?? null);
    },
    [lineToElement, setSelectedElementId],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const pane = splitPaneRef.current;
      if (!pane) return;

      const startWidth = editorWidth ?? pane.getBoundingClientRect().width / 2;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(200, startWidth + delta);
        const maxWidth = pane.getBoundingClientRect().width - 200;
        setEditorWidth(Math.min(newWidth, maxWidth));
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editorWidth],
  );

  const editorStyle = editorWidth != null ? { flex: 'none', width: editorWidth } : undefined;

  return (
    <div className="app">
      <ErrorBoundary componentName="Toolbar">
        <Toolbar
            loading={loading}
            error={error}
            sessionId={sessionId}
            onImport={handleImport}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={historyManager.canUndo}
            canRedo={historyManager.canRedo}
            getSvgElement={getSvgElement}
            processTitle={model?.title}
          />
      </ErrorBoundary>
      <div className="split-pane" ref={splitPaneRef}>
        <div className="split-pane__editor" style={editorStyle}>
          <ErrorBoundary componentName="Editor">
            <FpbEditor
              ref={editorRef}
              value={source}
              onChange={historyManager.pushState}
              parseError={error}
              onCursorPositionChange={handleCursorPositionChange}
            />
          </ErrorBoundary>
        </div>
        <div
          className="split-pane__divider"
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="vertical"
        />
        <div className="split-pane__preview">
          <div className="split-pane__diagram" ref={diagramContainerRef}>
            <ErrorBoundary componentName="Diagram">
              <DiagramRenderer
                ref={diagramRef}
                model={model}
                viewport={viewport}
                selectedElementId={selectedElementId}
                onElementClick={handleElementClick}
                onContentBounds={handleContentBounds}
                onWheel={handleWheel}
                onMouseDown={handleDiagramMouseDown}
                onTouchStart={handleTouchStart}
              />
            </ErrorBoundary>
            <ViewportControls
              zoom={viewport.zoom}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomToFit={handleZoomToFit}
            />
          </div>
          {error && !loading && (
            <div className="error-panel">
              <div className="error-panel__header">
                <span className="error-panel__icon">⚠</span>
                Errors
              </div>
              <pre className="error-panel__body">{error}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
