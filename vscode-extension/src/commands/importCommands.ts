import * as vscode from 'vscode';
import { getBackendManager } from '../extension';
import { createApiClient } from '../apiClient';

/**
 * Import a .fpb or .xml file and open it in a new editor
 */
export async function importFile(): Promise<void> {
    // Check if backend is ready
    const backendManager = getBackendManager();
    if (!backendManager || !backendManager.isReady()) {
        vscode.window.showWarningMessage(
            'FPB Backend is not ready yet. Please wait for the backend to start or check the output panel for errors.'
        );
        return;
    }

    // Show open file dialog
    const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Import File',
        filters: {
            'FPB Files': ['fpb'],
            'XML Files': ['xml'],
            'All Files': ['*'],
        },
    });

    if (!fileUris || fileUris.length === 0) {
        // User cancelled the dialog
        return;
    }

    const fileUri = fileUris[0];
    const filePath = fileUri.fsPath;
    const fileName = filePath.split(/[\\/]/).pop() || 'imported file';

    // Determine file type from extension
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    let fileType: 'fpb' | 'xml';

    if (fileExtension === 'fpb') {
        fileType = 'fpb';
    } else if (fileExtension === 'xml') {
        fileType = 'xml';
    } else {
        vscode.window.showWarningMessage(
            'Unsupported file type. Please select a .fpb or .xml file.'
        );
        return;
    }

    // Read the file content
    let fileContent: string;
    try {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        fileContent = Buffer.from(fileData).toString('utf-8');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to read file: ${errorMessage}`);
        return;
    }

    // Show progress while importing
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Importing ${fileName}...`,
            cancellable: false,
        },
        async (progress) => {
            try {
                // Create API client
                const apiClient = createApiClient(backendManager.getBackendUrl());

                // Call the import API
                const importResponse = await apiClient.importFile(fileContent, fileType);

                // Check if import was successful
                if (!importResponse.success || !importResponse.content) {
                    vscode.window.showErrorMessage(
                        `Failed to import ${fileName}: ${importResponse.error || 'Unknown error'}`
                    );
                    return;
                }

                // Open a new untitled document with the imported content
                const document = await vscode.workspace.openTextDocument({
                    content: importResponse.content,
                    language: 'fpb',
                });

                // Show the document in a new editor
                await vscode.window.showTextDocument(document);

                vscode.window.showInformationMessage(`Successfully imported ${fileName}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to import ${fileName}: ${errorMessage}`);
            }
        }
    );
}
