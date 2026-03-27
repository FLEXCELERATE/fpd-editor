import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { registerCompletionProvider } from './completionProvider';
import { registerDiagnosticsProvider } from './diagnosticsProvider';
import { PreviewPanel } from './previewPanel';
import { StateManager } from './stateManager';

let stateManager: StateManager | null = null;
let outputChannel: vscode.OutputChannel | null = null;

type ExportFormat = 'svg' | 'xml' | 'text';

const FORMAT_INFO: Record<ExportFormat, { extension: string; label: string }> = {
    svg: { extension: '.svg', label: 'SVG Image' },
    xml: { extension: '.xml', label: 'VDI 3682 XML' },
    text: { extension: '.fpd', label: 'FPD Text' },
};

async function exportDiagram(format: ExportFormat): Promise<void> {
    if (!stateManager) {
        vscode.window.showErrorMessage('FPD is not initialized.');
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

    try {
        const service = stateManager.getService();
        let data: Uint8Array | string;

        switch (format) {
            case 'svg':
                data = service.exportSvg(source);
                break;
            case 'xml':
                data = service.exportXml(source);
                break;
            case 'text':
                data = service.exportText(source);
                break;
        }

        if (typeof data === 'string') {
            fs.writeFileSync(saveUri.fsPath, data, 'utf-8');
        } else {
            fs.writeFileSync(saveUri.fsPath, Buffer.from(data));
        }

        vscode.window.showInformationMessage(`Exported ${info.label}: ${path.basename(saveUri.fsPath)}`);
    } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        // Sanitize: strip file paths and internal details
        const msg = raw.replace(/[A-Z]:\\[^\s:]+/gi, '<path>').replace(/\/[^\s:]+/g, '<path>');
        vscode.window.showErrorMessage(`Export failed: ${msg}`);
    }
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('FPD');
    outputChannel.appendLine('FPD extension is now active');
    context.subscriptions.push(outputChannel);

    // Initialize state manager (no backend server needed)
    stateManager = new StateManager(outputChannel);

    // Register language features
    registerCompletionProvider(context);
    registerDiagnosticsProvider(context);

    // Command: Show Preview
    context.subscriptions.push(
        vscode.commands.registerCommand('fpd.preview.show', async () => {
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
    outputChannel?.appendLine('FPD extension is now deactivated');
    stateManager = null;
    outputChannel = null;
}
