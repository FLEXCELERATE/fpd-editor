/** Hook that sends FPB source text to the backend parser with debouncing. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessModel } from "../types/fpb";
import { parseSource } from "../services/api";

interface UseFpbParserOptions {
  /** Debounce delay in milliseconds. Defaults to 500. */
  debounceMs?: number;
}

interface UseFpbParserResult {
  model: ProcessModel | null;
  error: string | null;
  loading: boolean;
  sessionId: string | undefined;
}

export function useFpbParser(
  source: string,
  options?: UseFpbParserOptions,
): UseFpbParserResult {
  const debounceMs = options?.debounceMs ?? 500;
  const [model, setModel] = useState<ProcessModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string | undefined>(undefined);
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
        const response = await parseSource({
          source: text,
          session_id: sessionIdRef.current,
        });

        // Ignore if this request was aborted
        if (controller.signal.aborted) return;

        sessionIdRef.current = response.session_id;
        setModel(response.model);
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

  return { model, error, loading, sessionId: sessionIdRef.current };
}
