/** Dropdown menu for exporting diagrams in various formats. */

import { useCallback, useState } from 'react';
import { exportXml, exportText, downloadBlob } from '../../services/api';
import { exportSvgToPdf, exportSvgToSvg, exportSvgToPng } from '../../services/pdfExport';
import { useEditorContext } from '../../context/EditorContext';
import { showToast } from '../Toast/Toast';

interface ExportMenuProps {
    getSvgElement?: () => SVGSVGElement | null;
    processTitle?: string;
}

type ExportFormat = 'xml' | 'text' | 'pdf' | 'svg' | 'png';

const FORMAT_LABELS: Record<ExportFormat, string> = {
    xml: 'Export VDI 3682 XML',
    text: 'Export FPD Text',
    pdf: 'Export PDF Document',
    svg: 'Export SVG Image',
    png: 'Export PNG Image',
};

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
    xml: '.xml',
    text: '.fpd',
    pdf: '.pdf',
    svg: '.svg',
    png: '.png',
};

function sanitizeFilename(title: string): string {
    return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'diagram';
}

export function ExportMenu({ getSvgElement, processTitle }: ExportMenuProps) {
    const { source, loading } = useEditorContext();
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const handleExport = useCallback(
        async (format: ExportFormat) => {
            setOpen(false);
            setExporting(true);
            try {
                const baseFilename = sanitizeFilename(processTitle || 'diagram');
                if (format === 'pdf' || format === 'svg' || format === 'png') {
                    // Browser-based export from the rendered SVG
                    const svgEl = getSvgElement?.();
                    if (!svgEl) {
                        showToast(
                            'No diagram to export. Write FPD text to create a diagram first.',
                        );
                        return;
                    }
                    const fname = baseFilename + FORMAT_EXTENSIONS[format];
                    if (format === 'pdf') {
                        await exportSvgToPdf({
                            svgElement: svgEl,
                            title: processTitle || 'Untitled Process',
                            filename: fname,
                        });
                    } else if (format === 'svg') {
                        exportSvgToSvg({ svgElement: svgEl, filename: fname });
                    } else {
                        await exportSvgToPng({ svgElement: svgEl, filename: fname });
                    }
                } else {
                    // XML and text export through backend API
                    if (!source.trim()) return;
                    const exportFn = format === 'xml' ? exportXml : exportText;
                    const blob = await exportFn(source);
                    downloadBlob(blob, baseFilename + FORMAT_EXTENSIONS[format]);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Export failed';
                showToast(message);
            } finally {
                setExporting(false);
            }
        },
        [source, getSvgElement, processTitle],
    );

    const isDisabled = loading || !source.trim() || exporting;

    return (
        <div className="export-menu">
            <button
                className="toolbar__button"
                onClick={() => setOpen((prev) => !prev)}
                disabled={isDisabled}
                aria-label="Export diagram"
                aria-haspopup="true"
                aria-expanded={open}
            >
                {exporting ? 'Exporting…' : 'Export ▾'}
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
