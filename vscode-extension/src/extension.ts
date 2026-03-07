import * as vscode from 'vscode';
import { registerCompletionProvider } from './completionProvider';
import { registerDiagnosticsProvider } from './diagnosticsProvider';
import { BackendManager } from './backendManager';
import { PreviewPanel } from './previewPanel';
import { StateManager } from './stateManager';

let backendManager: BackendManager | null = null;
let stateManager: StateManager | null = null;

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
