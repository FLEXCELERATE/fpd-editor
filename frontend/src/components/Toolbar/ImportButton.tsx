/** Button that triggers file import for FPB text or XML files. */

import { useCallback, useRef, useState } from "react";
import { importFile } from "../../services/api";
import type { ProcessModel } from "../../types/fpb";

interface ImportButtonProps {
  onImport: (source: string, model: ProcessModel) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ".fpb,.txt,.xml";

export function ImportButton({ onImport, disabled }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        const response = await importFile(file);
        onImport(response.source, response.model);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        alert(message);
      } finally {
        setImporting(false);
        // Reset input so the same file can be re-imported
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [onImport],
  );

  return (
    <>
      <button
        className="toolbar__button"
        onClick={handleClick}
        disabled={disabled || importing}
      >
        {importing ? "Importing…" : "Import"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </>
  );
}
