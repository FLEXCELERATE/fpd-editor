/** Hook that manages bidirectional synchronization between diagram and text editor. */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ProcessModel } from "../types/fpb";

interface ElementMapping {
  /** Element ID at this line number. */
  elementId: string;
  /** Type of the element (for display/debugging). */
  elementType: "state" | "processOperator" | "technicalResource" | "flow" | "usage";
}

interface UseDiagramSyncResult {
  /** Map from line number to element information. */
  lineToElement: Map<number, ElementMapping>;
  /** Currently selected element ID (from editor cursor position). */
  selectedElementId: string | null;
  /** Set the selected element ID. */
  setSelectedElementId: (id: string | null, options?: { programmatic?: boolean }) => void;
  /** Check if cursor changes should be ignored (during programmatic updates). */
  shouldIgnoreCursorChange: () => boolean;
}

export function useDiagramSync(
  model: ProcessModel | null,
): UseDiagramSyncResult {
  const [selectedElementId, setSelectedElementIdState] = useState<string | null>(null);
  const isProgrammaticChangeRef = useRef(false);

  // Set selected element ID with optional programmatic flag
  const setSelectedElementId = useCallback((id: string | null, options?: { programmatic?: boolean }) => {
    if (options?.programmatic) {
      isProgrammaticChangeRef.current = true;
      // Reset flag after brief delay to prevent stuck state
      setTimeout(() => {
        isProgrammaticChangeRef.current = false;
      }, 100);
    }
    setSelectedElementIdState(id);
  }, []);

  // Check if cursor changes should be ignored
  const shouldIgnoreCursorChange = useCallback(() => {
    return isProgrammaticChangeRef.current;
  }, []);

  // Build mapping from line numbers to element IDs
  const lineToElement = useMemo(() => {
    const mapping = new Map<number, ElementMapping>();

    if (!model) {
      return mapping;
    }

    // Map states
    for (const state of model.states) {
      if (state.line_number !== undefined) {
        mapping.set(state.line_number, {
          elementId: state.id,
          elementType: "state",
        });
      }
    }

    // Map process operators
    for (const processOperator of model.process_operators) {
      if (processOperator.line_number !== undefined) {
        mapping.set(processOperator.line_number, {
          elementId: processOperator.id,
          elementType: "processOperator",
        });
      }
    }

    // Map technical resources
    for (const technicalResource of model.technical_resources) {
      if (technicalResource.line_number !== undefined) {
        mapping.set(technicalResource.line_number, {
          elementId: technicalResource.id,
          elementType: "technicalResource",
        });
      }
    }

    // Map flows
    for (const flow of model.flows) {
      if (flow.line_number !== undefined) {
        mapping.set(flow.line_number, {
          elementId: flow.id,
          elementType: "flow",
        });
      }
    }

    // Map usages
    for (const usage of model.usages) {
      if (usage.line_number !== undefined) {
        mapping.set(usage.line_number, {
          elementId: usage.id,
          elementType: "usage",
        });
      }
    }

    return mapping;
  }, [model]);

  return {
    lineToElement,
    selectedElementId,
    setSelectedElementId,
    shouldIgnoreCursorChange,
  };
}
