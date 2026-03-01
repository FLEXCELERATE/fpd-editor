/** Dropdown menu for exporting diagrams in various formats. */

import { useCallback, useState } from "react";
import { exportXml, exportText, downloadBlob } from "../../services/api";
import { exportSvgToPdf } from "../../services/pdfExport";

interface ExportMenuProps {
  sessionId: string | undefined;
  disabled?: boolean;
  getSvgElement?: () => SVGSVGElement | null;
  processTitle?: string;
}

type ExportFormat = "xml" | "text" | "pdf";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xml: "Export VDI 3682 XML",
  text: "Export FPB Text",
  pdf: "Export PDF Document",
};

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  xml: ".xml",
  text: ".fpb",
  pdf: ".pdf",
};

function sanitizeFilename(title: string): string {
  return title.replace(/["/\\]/g, "_").trim() || "diagram";
}

export function ExportMenu({ sessionId, disabled, getSvgElement, processTitle }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setOpen(false);
      setExporting(true);
      try {
        const baseFilename = sanitizeFilename(processTitle || "diagram");
        if (format === "pdf") {
          // Browser-based PDF export from the rendered SVG
          const svgEl = getSvgElement?.();
          if (!svgEl) {
            alert("No diagram to export. Write FPB text to create a diagram first.");
            return;
          }
          await exportSvgToPdf({
            svgElement: svgEl,
            title: processTitle || "Untitled Process",
            filename: baseFilename + FORMAT_EXTENSIONS.pdf,
          });
        } else {
          // XML and text export through backend API
          if (!sessionId) return;
          const exportFn = format === "xml" ? exportXml : exportText;
          const blob = await exportFn({ session_id: sessionId });
          downloadBlob(blob, baseFilename + FORMAT_EXTENSIONS[format]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed";
        alert(message);
      } finally {
        setExporting(false);
      }
    },
    [sessionId, getSvgElement, processTitle],
  );

  const isDisabled = disabled || !sessionId || exporting;

  return (
    <div className="export-menu">
      <button
        className="toolbar__button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isDisabled}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {exporting ? "Exporting…" : "Export ▾"}
      </button>
      {open && (
        <>
          <div className="export-menu__backdrop" onClick={() => setOpen(false)} />
          <ul className="export-menu__dropdown" role="menu">
            {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((format) => (
              <li key={format} role="menuitem">
                <button
                  className="export-menu__item"
                  onClick={() => handleExport(format)}
                >
                  {FORMAT_LABELS[format]}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
