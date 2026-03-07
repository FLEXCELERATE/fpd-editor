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

        // Handle ready message from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                if (message.type === 'ready') {
                    this.update();
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
    private getWebviewContent(): string {
        const cssPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css');
        const cssUri = this.panel.webview.asWebviewUri(cssPath);
        const cspSource = this.panel.webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; img-src ${cspSource} data:;">
    <link rel="stylesheet" href="${cssUri}">
    <title>FPD Diagram Preview</title>
</head>
<body>
    <div id="preview">
        <div class="placeholder">Loading diagram...</div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const preview = document.getElementById('preview');

        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'svgUpdate':
                    preview.innerHTML = msg.svg;
                    break;
                case 'error':
                    preview.innerHTML = '<div class="error"><h3>Error</h3><p>' + msg.text + '</p></div>';
                    break;
                case 'clear':
                    preview.innerHTML = '<div class="placeholder">No diagram to display</div>';
                    break;
            }
        });

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
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
