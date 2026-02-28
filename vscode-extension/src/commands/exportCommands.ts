import * as vscode from 'vscode';
import { getBackendManager } from '../extension';
import { createApiClient } from '../apiClient';

/**
 * Export the current FPB document as XML
 */
export async function exportAsXml(): Promise<void> {
    const result = await exportDocument('xml', 'XML File', 'xml');
    if (result) {
        vscode.window.showInformationMessage(`Successfully exported to ${result}`);
    }
}

/**
 * Export the current FPB document as plain text
 */
export async function exportAsText(): Promise<void> {
    const result = await exportDocument('text', 'Text File', 'txt');
    if (result) {
        vscode.window.showInformationMessage(`Successfully exported to ${result}`);
    }
}

/**
 * Generic export function that handles all export types
 * @param format Export format (xml, text)
 * @param formatName Human-readable format name for dialogs
 * @param extension File extension for the save dialog
 * @returns The path to the saved file, or null if cancelled/failed
 */
async function exportDocument(
    format: 'xml' | 'text',
    formatName: string,
    extension: string
): Promise<string | null> {
    // Get the active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showWarningMessage('No active editor found. Please open an FPB file.');
        return null;
    }

    // Verify it's an FPB file
    if (activeEditor.document.languageId !== 'fpb') {
        vscode.window.showWarningMessage('The active file is not an FPB file. Please open an FPB file to export.');
        return null;
    }

    // Check if backend is ready
    const backendManager = getBackendManager();
    if (!backendManager || !backendManager.isReady()) {
        vscode.window.showWarningMessage(
            'FPB Backend is not ready yet. Please wait for the backend to start or check the output panel for errors.'
        );
        return null;
    }

    // Get the document content
    const content = activeEditor.document.getText();
    if (!content.trim()) {
        vscode.window.showWarningMessage('The document is empty. Nothing to export.');
        return null;
    }

    // Create API client
    const apiClient = createApiClient(backendManager.getBackendUrl());

    // Show progress while exporting
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Exporting as ${formatName}...`,
            cancellable: false,
        },
        async (progress) => {
            try {
                // Call the appropriate export method
                let exportResponse;
                switch (format) {
                    case 'xml':
                        exportResponse = await apiClient.exportXml(content);
                        break;
                    case 'text':
                        exportResponse = await apiClient.exportText(content);
                        break;
                    default:
                        throw new Error(`Unknown export format: ${format}`);
                }

                // Check if export was successful
                if (!exportResponse.success || !exportResponse.data) {
                    vscode.window.showErrorMessage(
                        `Failed to export as ${formatName}: ${exportResponse.error || 'Unknown error'}`
                    );
                    return null;
                }

                // Show save dialog
                const currentFileUri = activeEditor.document.uri;
                const currentFileName = currentFileUri.path.split('/').pop()?.replace(/\.fpb$/, '') || 'diagram';
                const defaultFileName = `${currentFileName}.${extension}`;

                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.joinPath(currentFileUri, '..', defaultFileName),
                    filters: {
                        [formatName]: [extension],
                        'All Files': ['*'],
                    },
                    saveLabel: `Save as ${formatName}`,
                });

                if (!saveUri) {
                    // User cancelled the save dialog
                    return null;
                }

                // Write the exported content to the file
                const exportData = exportResponse.data;
                const buffer = Buffer.from(exportData, 'utf-8');
                await vscode.workspace.fs.writeFile(saveUri, buffer);

                return saveUri.fsPath;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to export as ${formatName}: ${errorMessage}`);
                return null;
            }
        }
    );
}
