/** Hook that sends FPD source text to the backend parser with debouncing. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessModel } from "../types/fpd";
import { parseSource, renderSvg } from "../services/api";

interface UseFpdParserOptions {
  /** Debounce delay in milliseconds. Defaults to 500. */
  debounceMs?: number;
}

interface UseFpdParserResult {
  model: ProcessModel | null;
  svgContent: string | null;
  error: string | null;
  loading: boolean;
}

export function useFpdParser(
  source: string,
  options?: UseFpdParserOptions,
): UseFpdParserResult {
  const debounceMs = options?.debounceMs ?? 500;
  const [model, setModel] = useState<ProcessModel | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const parse = useCallback(
    async (text: string) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const [response, svg] = await Promise.all([
          parseSource(text),
          renderSvg(text),
        ]);

        // Ignore if this request was aborted
        if (controller.signal.aborted) return;

        setModel(response.model);
        setSvgContent(svg);
        setError(
          response.model.errors.length > 0
            ? response.model.errors.join("\n")
            : null,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Parse request failed");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!source.trim()) {
      setModel(null);
      setSvgContent(null);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      parse(source);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [source, debounceMs, parse]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { model, svgContent, error, loading };
}
