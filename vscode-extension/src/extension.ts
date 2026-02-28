import * as vscode from 'vscode';
import { registerCompletionProvider } from './completionProvider';
import { registerDiagnosticsProvider } from './diagnosticsProvider';
import { BackendManager } from './backendManager';
import { PreviewPanel } from './previewPanel';
import { createApiClient } from './apiClient';
import { exportAsXml, exportAsText } from './commands/exportCommands';
import { importFile } from './commands/importCommands';

// Global backend manager instance
let backendManager: BackendManager | null = null;

/**
 * Extension activation entry point
 * Called when the extension is activated (on FPB file open or command invocation)
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('FPB extension is now active');

    // Initialize backend manager
    backendManager = new BackendManager(context);
    backendManager.initialize().catch((error) => {
        console.error('Failed to initialize backend manager:', error);
        vscode.window.showErrorMessage(`FPB Backend initialization failed: ${error.message}`);
    });

    // Register language features
    registerCompletionProvider(context);
    registerDiagnosticsProvider(context);

    // Register command: Show Preview
    const showPreviewCommand = vscode.commands.registerCommand('fpb.preview.show', async () => {
        // Check if backend is ready
        if (!backendManager || !backendManager.isReady()) {
            vscode.window.showWarningMessage(
                'FPB Backend is not ready yet. Please wait for the backend to start or check the output panel for errors.'
            );
            return;
        }

        // Get the active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'fpb') {
            vscode.window.showWarningMessage(
                'Please open an FPB file to show the preview.'
            );
            return;
        }

        // Create API client
        const apiClient = createApiClient(backendManager.getBackendUrl());

        // Create or show the preview panel
        PreviewPanel.createOrShow(context.extensionUri, apiClient, activeEditor);
    });

    // Register command: Export as XML
    const exportXmlCommand = vscode.commands.registerCommand('fpb.export.xml', exportAsXml);

    // Register command: Export as Text
    const exportTextCommand = vscode.commands.registerCommand('fpb.export.text', exportAsText);

    // Register command: Import File
    const importFileCommand = vscode.commands.registerCommand('fpb.import.file', importFile);

    // Add all command registrations to subscriptions for proper cleanup
    context.subscriptions.push(
        showPreviewCommand,
        exportXmlCommand,
        exportTextCommand,
        importFileCommand
    );

    // Set up auto-update for preview panel when document changes
    const config = vscode.workspace.getConfiguration('fpb');
    const autoUpdate = config.get<boolean>('preview.autoUpdate', true);
    const updateDelay = config.get<number>('preview.updateDelay', 500);

    if (autoUpdate) {
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                // Only update if the changed document is an FPB file being previewed
                if (event.document.languageId === 'fpb' && PreviewPanel.isActive()) {
                    const panel = PreviewPanel.getCurrent();
                    if (panel && panel.isPreviewingDocument(event.document)) {
                        panel.scheduleUpdate(updateDelay);
                    }
                }
            })
        );

        // Also update when switching between editors
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document.languageId === 'fpb' && PreviewPanel.isActive()) {
                    const panel = PreviewPanel.getCurrent();
                    if (panel && backendManager) {
                        const apiClient = createApiClient(backendManager.getBackendUrl());
                        PreviewPanel.createOrShow(context.extensionUri, apiClient, editor);
                    }
                }
            })
        );
    }

}

/**
 * Extension deactivation entry point
 * Called when the extension is deactivated
 */
export function deactivate() {
    console.log('FPB extension is now deactivated');

    // Clean up backend manager
    if (backendManager) {
        backendManager.dispose();
        backendManager = null;
    }
}

/**
 * Get the backend manager instance
 * Used by other parts of the extension to access the backend
 */
export function getBackendManager(): BackendManager | null {
    return backendManager;
}
