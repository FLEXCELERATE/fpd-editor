/** Monaco Editor wrapper with FPB custom language support. */

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Editor, { BeforeMount, OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor, IDisposable } from 'monaco-editor';
import {
  FPB_LANGUAGE_ID,
  fpbLanguageDefinition,
  fpbLanguageConfiguration,
} from './fpbLanguage';
import { createFpbCompletionProvider } from './fpbCompletion';
import { typography } from '../../theme/designTokens';

const DEFAULT_VALUE = `@startfpb
title "My Process"

// Declare elements
product P1 "Input Material"
product P2 "Output Product"
energy E1 "Electrical Power"
process_operator PO1 "Processing"
technical_resource TR1 "Machine"

// Connections
P1 --> PO1
E1 --> PO1
PO1 --> P2
PO1 <..> TR1

@endfpb
`;

/** Parse an error string to extract line number if present (e.g. "Line 5: ..."). */
function parseErrorLine(errorMsg: string): number {
  const match = errorMsg.match(/^(?:line\s+)(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

interface FpbEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  /** Newline-separated parse error string from the backend. */
  parseError?: string | null;
  /** Called when cursor position changes, with the current line number. */
  onCursorPositionChange?: (lineNumber: number) => void;
}

export interface FpbEditorRef {
  scrollToLine: (lineNumber: number) => void;
}

const FpbEditor = forwardRef<FpbEditorRef, FpbEditorProps>(
  ({ value, onChange, parseError, onCursorPositionChange }, ref) => {
    const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
    const cursorDisposableRef = useRef<IDisposable | null>(null);

    useImperativeHandle(ref, () => ({
      scrollToLine: (lineNumber: number) => {
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!editor || !model) return;

        const clampedLine = Math.min(Math.max(lineNumber, 1), model.getLineCount());

        // Scroll to the line and center it in view
        editor.revealLineInCenter(clampedLine);

        // Highlight the line by setting selection
        editor.setSelection({
          startLineNumber: clampedLine,
          startColumn: 1,
          endLineNumber: clampedLine,
          endColumn: model.getLineMaxColumn(clampedLine),
        });

        // Focus the editor
        editor.focus();
      },
    }));

    const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.languages.register({ id: FPB_LANGUAGE_ID });
    monaco.languages.setMonarchTokensProvider(
      FPB_LANGUAGE_ID,
      fpbLanguageDefinition,
    );
    monaco.languages.setLanguageConfiguration(
      FPB_LANGUAGE_ID,
      fpbLanguageConfiguration,
    );
    monaco.languages.registerCompletionItemProvider(
      FPB_LANGUAGE_ID,
      createFpbCompletionProvider(monaco),
    );
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.focus();

    // Track cursor position changes
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
      onCursorPositionChange?.(e.position.lineNumber);
    });
  };

  // Cleanup cursor position listener on unmount
  useEffect(() => {
    return () => {
      cursorDisposableRef.current?.dispose();
    };
  }, []);

  // Set Monaco error markers when parseError changes.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;

    if (!parseError) {
      monaco.editor.setModelMarkers(model, 'fpb-parser', []);
      return;
    }

    const errors = parseError.split('\n').filter(Boolean);
    const markers: monacoEditor.IMarkerData[] = errors.map((msg) => {
      const line = parseErrorLine(msg);
      const clampedLine = Math.min(Math.max(line, 1), model.getLineCount());
      return {
        severity: monaco.MarkerSeverity.Error,
        message: msg,
        startLineNumber: clampedLine,
        startColumn: 1,
        endLineNumber: clampedLine,
        endColumn: model.getLineMaxColumn(clampedLine),
      };
    });

    monaco.editor.setModelMarkers(model, 'fpb-parser', markers);
  }, [parseError]);

  return (
    <Editor
      defaultValue={DEFAULT_VALUE}
      value={value}
      language={FPB_LANGUAGE_ID}
      theme="vs-dark"
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(v) => onChange?.(v ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: typography.fontSize.editor,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
});

FpbEditor.displayName = 'FpbEditor';

export default FpbEditor;
