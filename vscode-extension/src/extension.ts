import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { registerCompletionProvider } from './completionProvider';
import { registerDiagnosticsProvider } from './diagnosticsProvider';
import { BackendManager } from './backendManager';
import { PreviewPanel } from './previewPanel';
import { StateManager } from './stateManager';

let backendManager: BackendManager | null = null;
let stateManager: StateManager | null = null;

type ExportFormat = 'svg' | 'png' | 'pdf' | 'xml' | 'text';

const FORMAT_INFO: Record<ExportFormat, { extension: string; label: string; mediaType: string }> = {
    svg: { extension: '.svg', label: 'SVG Image', mediaType: 'image/svg+xml' },
    png: { extension: '.png', label: 'PNG Image', mediaType: 'image/png' },
    pdf: { extension: '.pdf', label: 'PDF Document', mediaType: 'application/pdf' },
    xml: { extension: '.xml', label: 'VDI 3682 XML', mediaType: 'application/xml' },
    text: { extension: '.fpd', label: 'FPD Text', mediaType: 'text/plain' },
};

async function exportDiagram(format: ExportFormat): Promise<void> {
    if (!backendManager) {
        vscode.window.showErrorMessage('FPD Backend is not initialized.');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'fpd') {
        vscode.window.showWarningMessage('Please open an FPD file to export.');
        return;
    }

    const source = editor.document.getText();
    if (!source.trim()) {
        vscode.window.showWarningMessage('The FPD file is empty.');
        return;
    }

    const info = FORMAT_INFO[format];
    const baseName = path.basename(editor.document.fileName, '.fpd');
    const defaultUri = vscode.Uri.file(
        path.join(path.dirname(editor.document.fileName), baseName + info.extension)
    );

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { [info.label]: [info.extension.slice(1)] },
    });

    if (!saveUri) {
        return;
    }

    const backendUrl = backendManager.getBackendUrl();

    try {
        const response = await axios.post(
            `${backendUrl}/api/export/source/${format}`,
            { source },
            { timeout: 30000, responseType: 'arraybuffer' }
        );

        fs.writeFileSync(saveUri.fsPath, Buffer.from(response.data));
        vscode.window.showInformationMessage(`Exported ${info.label}: ${path.basename(saveUri.fsPath)}`);
    } catch (error) {
        const msg = axios.isAxiosError(error) && error.response
            ? `Export failed: ${Buffer.from(error.response.data).toString()}`
            : `Export failed: ${error instanceof Error ? error.message : String(error)}`;
        vscode.window.showErrorMessage(msg);
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('FPD extension is now active');

    const outputChannel = vscode.window.createOutputChannel('FPD');
    context.subscriptions.push(outputChannel);

    // Initialize backend manager
    backendManager = new BackendManager(context);
    backendManager.initialize().catch((error) => {
        console.error('Failed to initialize backend manager:', error);
        vscode.window.showErrorMessage(`FPD Backend initialization failed: ${error.message}`);
    });

    // Initialize state manager
    stateManager = new StateManager(backendManager.getBackendUrl(), outputChannel);

    // Register language features
    registerCompletionProvider(context);
    registerDiagnosticsProvider(context);

    // Command: Show Preview
    context.subscriptions.push(
        vscode.commands.registerCommand('fpd.preview.show', async () => {
            if (!backendManager || !backendManager.isReady()) {
                vscode.window.showWarningMessage(
                    'FPD Backend is not ready yet. Please wait for the backend to start.'
                );
                return;
            }

            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'fpd') {
                vscode.window.showWarningMessage('Please open an FPD file to show the preview.');
                return;
            }

            if (stateManager) {
                PreviewPanel.createOrShow(context.extensionUri, stateManager, activeEditor);
            }
        })
    );

    // Export commands
    for (const format of Object.keys(FORMAT_INFO) as ExportFormat[]) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`fpd.export.${format}`, () => exportDiagram(format))
        );
    }

    // Auto-update preview on text change
    const config = vscode.workspace.getConfiguration('fpd');
    const autoUpdate = config.get<boolean>('preview.autoUpdate', true);
    const updateDelay = config.get<number>('preview.updateDelay', 500);

    if (autoUpdate) {
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.languageId === 'fpd' && PreviewPanel.isActive()) {
                    const panel = PreviewPanel.getCurrent();
                    if (panel && panel.isPreviewingDocument(event.document)) {
                        panel.scheduleUpdate(updateDelay);
                    }
                }
            })
        );

        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document.languageId === 'fpd' && PreviewPanel.isActive()) {
                    if (stateManager) {
                        PreviewPanel.createOrShow(context.extensionUri, stateManager, editor);
                    }
                }
            })
        );
    }
}

export function deactivate() {
    console.log('FPD extension is now deactivated');

    if (backendManager) {
        backendManager.dispose();
        backendManager = null;
    }
    stateManager = null;
}
