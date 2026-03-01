/** Hook that provides export and import operations for FPB diagrams. */

import { useCallback, useState } from "react";
import type { ProcessModel } from "../types/fpb";
import {
  exportXml,
  exportText,
  importFile,
  downloadBlob,
} from "../services/api";
import { exportSvgToPdf } from "../services/pdfExport";

export type ExportFormat = "xml" | "text" | "pdf";

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  xml: ".xml",
  text: ".fpb",
  pdf: ".pdf",
};

function sanitizeFilename(title: string): string {
  return title.replace(/["/\\]/g, "_").trim() || "diagram";
}

interface UseExportOptions {
  getSvgElement?: () => SVGSVGElement | null;
  processTitle?: string;
}

interface UseExportResult {
  exporting: boolean;
  importing: boolean;
  handleExport: (format: ExportFormat, sessionId: string) => Promise<void>;
  handleImport: (file: File) => Promise<{ source: string; model: ProcessModel } | null>;
}

export function useExport(options?: UseExportOptions): UseExportResult {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(
    async (format: ExportFormat, sessionId: string) => {
      setExporting(true);
      try {
        const baseFilename = sanitizeFilename(options?.processTitle || "diagram");
        if (format === "pdf") {
          const svgEl = options?.getSvgElement?.();
          if (!svgEl) throw new Error("No diagram to export");
          await exportSvgToPdf({
            svgElement: svgEl,
            title: options?.processTitle || "Untitled Process",
            filename: baseFilename + FORMAT_EXTENSIONS.pdf,
          });
        } else {
          const exportFn = format === "xml" ? exportXml : exportText;
          const blob = await exportFn({ session_id: sessionId });
          downloadBlob(blob, baseFilename + FORMAT_EXTENSIONS[format]);
        }
      } finally {
        setExporting(false);
      }
    },
    [options],
  );

  const handleImport = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const response = await importFile(file);
      return { source: response.source, model: response.model };
    } finally {
      setImporting(false);
    }
  }, []);

  return { exporting, importing, handleExport, handleImport };
}
