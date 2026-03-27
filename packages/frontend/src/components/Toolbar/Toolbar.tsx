/** Main toolbar with title, status, export, and import controls. */

import { ExportMenu } from "./ExportMenu";
import { ImportButton } from "./ImportButton";
import type { ProcessModel } from "../../types/fpd";

interface ToolbarProps {
  loading: boolean;
  error: string | null;
  source: string;
  onImport: (source: string, model: ProcessModel) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  getSvgElement?: () => SVGSVGElement | null;
  processTitle?: string;
}

export function Toolbar({
  loading,
  error,
  source,
  onImport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  getSvgElement,
  processTitle,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <span className="toolbar__title">FPD Editor</span>
      <div className="toolbar__actions">
        <button
          className="toolbar__button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z / Cmd+Z)"
        >
          ↶ Undo
        </button>
        <button
          className="toolbar__button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
        >
          ↷ Redo
        </button>
        <ImportButton onImport={onImport} />
        <ExportMenu source={source} disabled={loading} getSvgElement={getSvgElement} processTitle={processTitle} />
      </div>
      <div className="toolbar__spacer" />
      {loading && (
        <span className="toolbar__status">
          <span className="toolbar__spinner" />
          Parsing…
        </span>
      )}
      {error && !loading && (
        <span className="toolbar__status toolbar__status--error">⚠ Parse error</span>
      )}
    </div>
  );
}
