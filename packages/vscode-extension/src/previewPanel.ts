import * as vscode from 'vscode';
import { StateManager, StateSnapshot } from './stateManager';

/**
 * Manages the FPD preview panel webview.
 * Receives SVG strings from StateManager and displays them.
 */
export class PreviewPanel {
    private static currentPanel: PreviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private stateManager: StateManager;
    private updateTimer: NodeJS.Timeout | null = null;
    private sourceEditor: vscode.TextEditor | undefined;
    private unsubscribe: (() => void) | null = null;

    public static createOrShow(
        extensionUri: vscode.Uri,
        stateManager: StateManager,
        sourceEditor?: vscode.TextEditor
    ): PreviewPanel {
        const column = vscode.ViewColumn.Beside;

        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.panel.reveal(column);
            PreviewPanel.currentPanel.stateManager = stateManager;
            if (sourceEditor) {
                PreviewPanel.currentPanel.sourceEditor = sourceEditor;
                PreviewPanel.currentPanel.update();
            }
            return PreviewPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'fpdPreview',
            'FPD Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, stateManager, sourceEditor);
        return PreviewPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        stateManager: StateManager,
        sourceEditor?: vscode.TextEditor
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.stateManager = stateManager;
        this.sourceEditor = sourceEditor;

        // Set webview HTML
        this.panel.webview.html = this.getWebviewContent();

        // Subscribe to state changes → forward SVG to webview
        this.unsubscribe = stateManager.onStateChanged((snapshot) => {
            this.sendSvgToWebview(snapshot);
        });

        // Initial render
        this.update();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                if (message.type === 'ready') {
                    this.update();
                } else if (message.type === 'goToLine') {
                    this.goToLine(message.line);
                }
            },
            null,
            this.disposables
        );
    }

    /** Send SVG to webview. */
    private sendSvgToWebview(snapshot: StateSnapshot): void {
        if (snapshot.svg) {
            this.panel.webview.postMessage({ type: 'svgUpdate', svg: snapshot.svg });
        } else if (snapshot.errors.length > 0) {
            this.panel.webview.postMessage({ type: 'error', text: snapshot.errors.join('\n') });
        } else {
            this.panel.webview.postMessage({ type: 'clear' });
        }
    }

    /** Parse current source and update state. */
    public async update(): Promise<void> {
        let content = '';
        if (this.sourceEditor) {
            content = this.sourceEditor.document.getText();
        } else {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'fpd') {
                content = activeEditor.document.getText();
                this.sourceEditor = activeEditor;
            }
        }

        await this.stateManager.loadFromText(content);
    }

    public scheduleUpdate(delay: number = 500): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this.updateTimer = setTimeout(() => {
            this.update();
            this.updateTimer = null;
        }, delay);
    }

    /**
     * Minimal webview HTML — just receives SVG via postMessage and displays it.
     */
    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let nonce = '';
        for (let i = 0; i < 32; i++) {
            nonce += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return nonce;
    }

    private getWebviewContent(): string {
        const cssPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css');
        const cssUri = this.panel.webview.asWebviewUri(cssPath);
        const cspSource = this.panel.webview.cspSource;
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; object-src 'none'; base-uri 'none'; form-action 'none';">
    <link rel="stylesheet" href="${cssUri}">
    <title>FPD Diagram Preview</title>
</head>
<body>
    <div id="preview">
        <div class="placeholder">Loading diagram...</div>
    </div>
    <div id="tooltip" style="display:none; position:fixed; pointer-events:none; background:var(--vscode-editorHoverWidget-background, #333); color:var(--vscode-editorHoverWidget-foreground, #fff); padding:6px 10px; border-radius:4px; font-size:12px; font-family:var(--vscode-font-family, sans-serif); border:1px solid var(--vscode-editorHoverWidget-border, #666); z-index:1000; white-space:nowrap;"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const preview = document.getElementById('preview');
        const tooltip = document.getElementById('tooltip');

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'svgUpdate': {
                    // Parse SVG safely via DOMParser to avoid innerHTML XSS
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(msg.svg, 'image/svg+xml');
                    const svgEl = doc.documentElement;
                    if (svgEl && svgEl.nodeName === 'svg') {
                        preview.textContent = '';
                        preview.appendChild(document.importNode(svgEl, true));
                    }
                    break;
                }
                case 'error': {
                    preview.textContent = '';
                    const div = document.createElement('div');
                    div.className = 'error';
                    const h3 = document.createElement('h3');
                    h3.textContent = 'Error';
                    const p = document.createElement('p');
                    p.textContent = msg.text;
                    div.appendChild(h3);
                    div.appendChild(p);
                    preview.appendChild(div);
                    break;
                }
                case 'clear':
                    preview.textContent = '';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'placeholder';
                    placeholder.textContent = 'No diagram to display';
                    preview.appendChild(placeholder);
                    break;
            }
        });

        function getTypeLabel(elementType, stateType) {
            if (elementType === 'state' && stateType) {
                return stateType.charAt(0).toUpperCase() + stateType.slice(1);
            }
            switch (elementType) {
                case 'processOperator': return 'Process Operator';
                case 'technicalResource': return 'Technical Resource';
                case 'state': return 'State';
                default: return elementType;
            }
        }

        // Hover tooltip via event delegation
        preview.addEventListener('mousemove', (e) => {
            const el = e.target.closest('[data-element-id]');
            const conn = e.target.closest('[data-connection-id]');
            if (el) {
                const id = el.getAttribute('data-element-id') || '';
                const type = el.getAttribute('data-element-type') || '';
                const stateType = el.getAttribute('data-state-type');
                tooltip.textContent = '';
                const strong = document.createElement('strong');
                strong.textContent = getTypeLabel(type, stateType);
                tooltip.appendChild(strong);
                tooltip.appendChild(document.createElement('br'));
                tooltip.appendChild(document.createTextNode('ID: ' + id));
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY + 12) + 'px';
                document.body.style.cursor = 'pointer';
            } else if (conn) {
                const id = conn.getAttribute('data-connection-id') || '';
                tooltip.textContent = 'Connection: ' + id;
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY + 12) + 'px';
                document.body.style.cursor = 'pointer';
            } else {
                tooltip.style.display = 'none';
                document.body.style.cursor = 'default';
            }
        });

        preview.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            document.body.style.cursor = 'default';
        });

        // Double-click to jump to source line
        preview.addEventListener('dblclick', (e) => {
            const el = e.target.closest('[data-element-id]');
            const conn = e.target.closest('[data-connection-id]');
            const match = el || conn;
            if (match) {
                const lineNum = match.getAttribute('data-line-number');
                if (lineNum) {
                    vscode.postMessage({ type: 'goToLine', line: parseInt(lineNum, 10) });
                }
            }
        });

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }

    /** Navigate source editor to a specific line. */
    private goToLine(line: number): void {
        const editor = this.sourceEditor ?? vscode.window.activeTextEditor;
        if (!editor) { return; }
        const lineIndex = Math.max(0, line - 1);
        const range = editor.document.lineAt(lineIndex).range;
        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        vscode.window.showTextDocument(editor.document, editor.viewColumn);
    }

    public dispose(): void {
        PreviewPanel.currentPanel = undefined;
        this.panel.dispose();

        if (this.unsubscribe) {
            this.unsubscribe();
        }

        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) { d.dispose(); }
        }
    }

    public static isActive(): boolean {
        return PreviewPanel.currentPanel !== undefined;
    }

    public static getCurrent(): PreviewPanel | undefined {
        return PreviewPanel.currentPanel;
    }

    public isPreviewingDocument(document: vscode.TextDocument): boolean {
        return this.sourceEditor?.document === document;
    }
}
