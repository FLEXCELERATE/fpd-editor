/** Hook that parses FPD source text via the in-browser core engine, debounced. */

import { useEffect, useState } from 'react';
import { FpdService, renderSvg as renderDiagramSvg } from '@fpd-editor/core';
import type { ProcessModel } from '../types/fpd';

interface UseFpdParserOptions {
    /** Debounce delay in milliseconds. Defaults to 150. */
    debounceMs?: number;
}

interface UseFpdParserResult {
    model: ProcessModel | null;
    svgContent: string | null;
    /** Newline-joined parse errors, or null. */
    error: string | null;
    /** Newline-joined validation warnings, or null. */
    warnings: string | null;
    loading: boolean;
}

const service = new FpdService();

/**
 * Parsing runs synchronously in the browser (no backend round-trip), so there
 * are no request races to guard against. The short debounce only avoids
 * re-running layout on every keystroke for large documents.
 */
export function useFpdParser(source: string, options?: UseFpdParserOptions): UseFpdParserResult {
    const debounceMs = options?.debounceMs ?? 150;
    const [model, setModel] = useState<ProcessModel | null>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!source.trim()) {
            setModel(null);
            setSvgContent(null);
            setError(null);
            setWarnings(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const timer = setTimeout(() => {
            try {
                const { model: parsedModel, diagram } = service.parse(source);
                setModel(parsedModel as ProcessModel);
                setSvgContent(renderDiagramSvg(diagram));
                setError(parsedModel.errors.length > 0 ? parsedModel.errors.join('\n') : null);
                setWarnings(
                    parsedModel.warnings.length > 0 ? parsedModel.warnings.join('\n') : null,
                );
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Parse failed');
            } finally {
                setLoading(false);
            }
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [source, debounceMs]);

    return { model, svgContent, error, warnings, loading };
}
