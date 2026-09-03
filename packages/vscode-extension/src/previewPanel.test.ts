import { describe, it, expect, vi } from 'vitest';

/**
 * The preview webview's own rendering path.
 *
 * The diagram itself is core's business and covered by core's tests; what only
 * exists here is the webview shell: its Content Security Policy, and the script
 * that turns an SVG string arriving by message into DOM. Both have already been
 * tightened once for XSS, so they are worth pinning.
 */

const disposable = { dispose: vi.fn() };

function makeWebview() {
    return {
        html: '',
        cspSource: 'vscode-webview://test',
        asWebviewUri: (uri: { path: string }) => ({ toString: () => `vscode-webview:${uri.path}` }),
        onDidReceiveMessage: vi.fn(() => disposable),
        postMessage: vi.fn(),
    };
}

const webview = makeWebview();

vi.mock('vscode', () => ({
    Uri: {
        file: (p: string) => ({ path: p, fsPath: p }),
        joinPath: (base: { path: string }, ...parts: string[]) => ({
            path: [base.path, ...parts].join('/'),
            fsPath: [base.path, ...parts].join('/'),
        }),
    },
    ViewColumn: { Beside: 2, One: 1 },
    window: {
        createWebviewPanel: () => ({
            webview,
            onDidDispose: vi.fn(() => disposable),
            reveal: vi.fn(),
            dispose: vi.fn(),
            title: '',
        }),
        showTextDocument: vi.fn(),
        showErrorMessage: vi.fn(),
    },
    workspace: { openTextDocument: vi.fn() },
    Position: class {},
    Selection: class {},
    Range: class {},
    TextEditorRevealType: { InCenter: 2 },
}));

vi.mock('@fpd-editor/core', () => ({
    FpdService: class {
        renderSvg = () => '<svg></svg>';
        parse = () => ({ model: {}, diagram: {} });
    },
    renderSvg: () => '<svg></svg>',
}));

import { PreviewPanel } from './previewPanel';

/** Build a panel and hand back the HTML it installed on its webview. */
function webviewHtml(): string {
    const stateManager = {
        onStateChanged: vi.fn(() => () => undefined),
        getSnapshot: () => ({ svg: '', errors: [], version: 0 }),
        getService: () => ({}),
        loadFromText: vi.fn(async () => undefined),
        parse: vi.fn(async () => ({ model: {}, diagram: {} })),
    };
    PreviewPanel.createOrShow(
        { path: '/ext', fsPath: '/ext' } as never,
        stateManager as never,
        undefined,
    );
    return webview.html;
}

describe('preview webview shell', () => {
    it('locks scripts to a nonce and forbids everything else by default', () => {
        const html = webviewHtml();
        const csp = /content="([^"]*default-src[^"]*)"/.exec(html)?.[1];
        expect(csp).toBeDefined();
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("object-src 'none'");
        // Scripts must run by nonce, never inline.
        expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9]+'/);
        expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    });

    it('gives every script tag the nonce from the policy', () => {
        const html = webviewHtml();
        const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
        expect(nonce).toBeTruthy();
        const scripts = html.match(/<script[^>]*>/g) ?? [];
        expect(scripts.length).toBeGreaterThan(0);
        for (const tag of scripts) {
            expect(tag).toContain(`nonce="${nonce}"`);
        }
    });

    it('uses a fresh nonce for each panel', () => {
        const first = /nonce-([A-Za-z0-9]+)/.exec(webviewHtml())?.[1];
        PreviewPanel.currentPanel?.dispose();
        const second = /nonce-([A-Za-z0-9]+)/.exec(webviewHtml())?.[1];
        expect(first).toBeTruthy();
        expect(second).not.toBe(first);
    });

    it('builds the SVG through DOMParser rather than innerHTML', () => {
        const html = webviewHtml();
        expect(html).toContain('DOMParser');
        // The diagram must never be assigned as markup.
        expect(html).not.toMatch(/preview\.innerHTML\s*=\s*[^'"]*svg/i);
    });
});
