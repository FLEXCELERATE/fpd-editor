import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ApiClient } from './apiClient';

/**
 * Manages the FPB preview panel webview
 * Displays a live preview of the FPB diagram in a VS Code webview panel
 */
export class PreviewPanel {
    private static currentPanel: PreviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private apiClient: ApiClient | null = null;
    private updateTimer: NodeJS.Timeout | null = null;
    private sourceEditor: vscode.TextEditor | undefined;

    /**
     * Create or show the preview panel
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        apiClient: ApiClient,
        sourceEditor?: vscode.TextEditor
    ): PreviewPanel {
        const column = vscode.ViewColumn.Beside;

        // If we already have a panel, show it
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.panel.reveal(column);
            PreviewPanel.currentPanel.apiClient = apiClient;
            if (sourceEditor) {
                PreviewPanel.currentPanel.sourceEditor = sourceEditor;
                PreviewPanel.currentPanel.update();
            }
            return PreviewPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'fpbPreview',
            'FPB Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, apiClient, sourceEditor);
        return PreviewPanel.currentPanel;
    }

    /**
     * Private constructor
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        apiClient: ApiClient,
        sourceEditor?: vscode.TextEditor
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.apiClient = apiClient;
        this.sourceEditor = sourceEditor;

        // Set the webview's initial HTML content
        this.update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'error':
                        vscode.window.showErrorMessage(message.text);
                        break;
                    case 'info':
                        vscode.window.showInformationMessage(message.text);
                        break;
                    case 'ready':
                        // Webview is ready, send initial diagram data
                        this.update();
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    /**
     * Update the webview content
     */
    public async update(): Promise<void> {
        // Set the initial HTML if not already set
        if (!this.panel.webview.html || this.panel.webview.html.length === 0) {
            this.panel.webview.html = this.getWebviewContent();
        }

        if (!this.apiClient) {
            this.panel.webview.postMessage({
                type: 'update',
                error: 'Backend not connected'
            });
            return;
        }

        // Get the content from the source editor
        let content = '';
        if (this.sourceEditor) {
            content = this.sourceEditor.document.getText();
        } else {
            // Try to get the active editor
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'fpb') {
                content = activeEditor.document.getText();
                this.sourceEditor = activeEditor;
            }
        }

        if (!content.trim()) {
            this.panel.webview.postMessage({
                type: 'clear'
            });
            return;
        }

        try {
            // Parse the FPB content
            const parseResponse = await this.apiClient.parse(content);

            // Check for parse errors in the model
            const modelErrors = parseResponse.model?.errors || [];
            if (modelErrors.length > 0) {
                // Send diagram anyway (partial results) along with errors
                this.panel.webview.postMessage({
                    type: 'update',
                    diagram: parseResponse.diagram,
                    error: modelErrors.join('\n')
                });
            } else {
                // Send diagram data to webview for rendering
                this.panel.webview.postMessage({
                    type: 'update',
                    diagram: parseResponse.diagram
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.panel.webview.postMessage({
                type: 'update',
                error: `Failed to parse diagram: ${errorMsg}`
            });
        }
    }

    /**
     * Schedule an update with debouncing
     */
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
     * Get the webview HTML content with SVG rendering
     */
    private getWebviewContent(): string {
        const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'preview.html');
        const cssPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css');

        // Convert CSS URI to webview URI
        const cssUri = this.panel.webview.asWebviewUri(cssPath);
        const cspSource = this.panel.webview.cspSource;

        try {
            // Load HTML template
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');

            // Replace placeholders
            htmlContent = htmlContent
                .replace(/{{cspSource}}/g, cspSource)
                .replace(/{{cssUri}}/g, cssUri.toString());

            return htmlContent;
        } catch (error) {
            // Fallback to error HTML if template loading fails
            return this.getErrorHtml('Failed to load preview template', String(error));
        }
    }

    /**
     * Get HTML for error state
     */
    private getErrorHtml(title: string, details?: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FPB Preview - Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .error-container {
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
        }
        .error-title {
            color: var(--vscode-errorForeground);
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
        }
        .error-details {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-title">❌ ${title}</div>
        ${details ? `<div class="error-details">${details}</div>` : ''}
    </div>
</body>
</html>`;
    }

    /**
     * Get HTML for placeholder state (no content)
     * @deprecated No longer used - webview handles placeholder state
     */
    private getPlaceholderHtml(): string {
        // This method is deprecated - webview handles placeholder state
        return this.getWebviewContent();
    }

    /**
     * Dispose of the panel and clean up resources
     */
    public dispose(): void {
        PreviewPanel.currentPanel = undefined;

        // Clean up our resources
        this.panel.dispose();

        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Check if a panel is currently active
     */
    public static isActive(): boolean {
        return PreviewPanel.currentPanel !== undefined;
    }

    /**
     * Get the current panel instance
     */
    public static getCurrent(): PreviewPanel | undefined {
        return PreviewPanel.currentPanel;
    }

    /**
     * Check if this panel is previewing a specific document
     */
    public isPreviewingDocument(document: vscode.TextDocument): boolean {
        return this.sourceEditor?.document === document;
    }
}
