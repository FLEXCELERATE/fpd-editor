import * as vscode from 'vscode';
import axios from 'axios';

/**
 * Snapshot of the current diagram state.
 * Listeners receive this whenever state changes.
 */
export interface StateSnapshot {
    svg: string;
    errors: string[];
    version: number;
}

/**
 * StateManager — Single Source of Truth for diagram state.
 *
 * Parses FPD text via the backend /api/render/svg endpoint
 * and notifies all listeners (webview, diagnostics) on change.
 */
export class StateManager {
    private svg = '';
    private errors: string[] = [];
    private version = 0;
    private listeners = new Set<(snapshot: StateSnapshot) => void>();
    private outputChannel: vscode.OutputChannel;
    private backendUrl: string;

    constructor(backendUrl: string, outputChannel: vscode.OutputChannel) {
        this.backendUrl = backendUrl;
        this.outputChannel = outputChannel;
    }

    /** Subscribe to state changes. Returns unsubscribe function. */
    onStateChanged(listener: (s: StateSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notify(): void {
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }

    /** Get current state snapshot. */
    getSnapshot(): StateSnapshot {
        return { svg: this.svg, errors: [...this.errors], version: this.version };
    }

    /** Update the backend URL (e.g. after settings change). */
    setBackendUrl(url: string): void {
        this.backendUrl = url;
    }

    /**
     * Parse FPD text and update state.
     * Calls the backend /api/render/svg endpoint to get a complete SVG.
     */
    async loadFromText(text: string): Promise<void> {
        if (!text.trim()) {
            this.svg = '';
            this.errors = [];
            this.version++;
            this.notify();
            return;
        }

        try {
            const response = await axios.post(
                `${this.backendUrl}/api/render/svg`,
                { source: text },
                { timeout: 10000, responseType: 'text' }
            );

            this.svg = response.data;
            this.errors = [];
            this.version++;
            this.notify();
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const detail = (error.response.data as any)?.detail;
                this.errors = [detail || 'Render failed'];
            } else {
                const msg = error instanceof Error ? error.message : String(error);
                this.errors = [msg];
            }
            this.version++;
            this.notify();
            this.outputChannel.appendLine(`Render error: ${this.errors.join(', ')}`);
        }
    }

    /**
     * Parse FPD text via the /api/parse endpoint (for diagnostics and export).
     * Returns the full parse response with model and diagram data.
     */
    async parse(text: string): Promise<any> {
        const response = await axios.post(
            `${this.backendUrl}/api/parse`,
            { source: text, session_id: null },
            { timeout: 10000 }
        );
        return response.data;
    }
}
