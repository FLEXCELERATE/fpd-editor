/**
 * FPD service facade for the web app.
 *
 * Parsing, rendering, and exporting run directly in the browser via
 * `@fpd-editor/core` — no backend round-trip. The functions keep their
 * former async signatures so callers are agnostic about where the work
 * happens (and could be pointed back at a remote API if ever needed).
 */

import { FpdService } from '@fpd-editor/core';
import type { ProcessModel } from '../types/fpd';

const service = new FpdService();

interface ParseResponse {
    model: ProcessModel;
    diagram: unknown;
}

interface ImportResponse {
    source: string;
    model: ProcessModel;
    diagram: unknown;
}

export async function parseSource(source: string): Promise<ParseResponse> {
    const { model, diagram } = service.parse(source);
    return { model: model as ProcessModel, diagram };
}

export async function renderSvg(source: string): Promise<string> {
    return service.renderSvg(source);
}

export async function exportXml(source: string): Promise<Blob> {
    return new Blob([service.exportXml(source)], { type: 'application/xml' });
}

export async function exportText(source: string): Promise<Blob> {
    return new Blob([service.exportText(source)], { type: 'text/plain' });
}

export async function importFile(content: string, filename: string): Promise<ImportResponse> {
    const { model, diagram, source } = service.importFile(content, filename);
    return { source, model: model as ProcessModel, diagram };
}

/** Trigger a file download from a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
