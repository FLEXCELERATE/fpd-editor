/**
 * Configure @monaco-editor/react to use the BUNDLED monaco-editor package.
 *
 * Without this, the loader fetches Monaco from a third-party CDN (jsdelivr)
 * at runtime — the editor breaks in offline/air-gapped deployments and adds
 * an external dependency to every page load.
 */

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// FPD is a custom Monarch language; only the base editor worker is needed
// (no TS/JSON/CSS language services).
self.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
};

loader.config({ monaco });
