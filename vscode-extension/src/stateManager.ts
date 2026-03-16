import * as vscode from 'vscode';
import { FpdService, ParseResult } from './core/fpdService';

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
 * Parses FPD text via the TypeScript core engine (no backend server needed)
 * and notifies all listeners (webview, diagnostics) on change.
 */
export class StateManager {
    private svg = '';
    private errors: string[] = [];
    private version = 0;
    private listeners = new Set<(snapshot: StateSnapshot) => void>();
    private outputChannel: vscode.OutputChannel;
    private fpdService: FpdService;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.fpdService = new FpdService();
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

    /** Get the FpdService instance for direct access (e.g. exports). */
    getService(): FpdService {
        return this.fpdService;
    }

    /**
     * Parse FPD text and update state.
     * Uses the TypeScript core engine directly — no HTTP needed.
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
            const svg = this.fpdService.renderSvg(text);
            this.svg = svg;
            this.errors = [];
            this.version++;
            this.notify();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.errors = [msg];
            this.version++;
            this.notify();
            this.outputChannel.appendLine(`Render error: ${msg}`);
        }
    }

    /**
     * Parse FPD text and return the full parse result with model and diagram data.
     */
    async parse(text: string): Promise<ParseResult> {
        return this.fpdService.parse(text);
    }
}
