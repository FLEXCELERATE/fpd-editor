/** Facade that orchestrates all FPD operations: parse, render, export, import. */

import { ProcessModel } from './models/processModel';
import { FpdParser } from './parser/parser';
import { validateConnections } from './parser/validator';
import { computeLayout, DiagramLayout } from './services/layout';
import { renderSvg } from './services/svgRenderer';
import { exportText } from './export/textExporter';
import { exportXml } from './export/xmlExporter';
import { exportPdf } from './export/pdfExporter';
import { detectFormat, importXml } from './import/xmlImporter';

export interface ParseResult {
    model: ProcessModel;
    diagram: DiagramLayout;
}

export class FpdService {
    /** Parse FPD source text into a model and diagram layout. */
    parse(source: string): ParseResult {
        const parser = new FpdParser(source);
        const model = parser.parse();

        const validationErrors = validateConnections(model);
        if (validationErrors.length > 0) {
            model.warnings.push(...validationErrors);
        }

        const diagram = computeLayout(model);
        return { model, diagram };
    }

    /** Render FPD source text to an SVG string. */
    renderSvg(source: string): string {
        const { diagram } = this.parse(source);
        return renderSvg(diagram);
    }

    /** Export FPD source text to SVG format. */
    exportSvg(source: string): string {
        return this.renderSvg(source);
    }

    /** Export FPD source text to PDF format. */
    async exportPdf(source: string): Promise<Uint8Array> {
        const { model } = this.parse(source);
        return exportPdf(model);
    }

    /** Export FPD source text to VDI 3682 XML. */
    exportXml(source: string): string {
        const { model } = this.parse(source);
        return exportXml(model);
    }

    /** Export (reformat) FPD source text. */
    exportText(source: string): string {
        const { model } = this.parse(source);
        return exportText(model);
    }

    /** Import a file (text or XML) and return model, diagram, and generated FPD source. */
    importFile(content: string, filename: string): { model: ProcessModel; diagram: DiagramLayout; source: string } {
        const format = detectFormat(filename, content);

        let model: ProcessModel;
        let source: string;

        if (format === 'xml') {
            const result = importXml(content);
            model = result.model;
            source = result.source;
            if (result.xsdWarnings.length > 0) {
                model.warnings.push(...result.xsdWarnings);
            }
        } else {
            const parser = new FpdParser(content);
            model = parser.parse();
            source = content;
        }

        const validationErrors = validateConnections(model);
        if (validationErrors.length > 0) {
            model.warnings.push(...validationErrors);
        }

        const diagram = computeLayout(model);
        return { model, diagram, source };
    }
}
