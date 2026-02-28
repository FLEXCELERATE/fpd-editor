import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

/**
 * Manages the FPB backend server lifecycle
 * Handles auto-starting the backend if configured and monitoring its health
 */
export class BackendManager {
    private backendProcess: child_process.ChildProcess | null = null;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private isBackendReady = false;
    private outputChannel: vscode.OutputChannel;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('FPB Backend');
        context.subscriptions.push(this.outputChannel);
    }

    /**
     * Initialize the backend manager
     * Checks if backend is running, and starts it if needed
     */
    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('fpb');
        const backendUrl = config.get<string>('backend.url', 'http://localhost:8000');
        const autoStart = config.get<boolean>('backend.autoStart', true);

        this.outputChannel.appendLine(`Initializing backend manager...`);
        this.outputChannel.appendLine(`Backend URL: ${backendUrl}`);
        this.outputChannel.appendLine(`Auto-start: ${autoStart}`);

        // Check if backend is already running
        const isRunning = await this.checkHealth(backendUrl);

        if (isRunning) {
            this.outputChannel.appendLine('Backend is already running');
            this.isBackendReady = true;
            this.startHealthMonitoring(backendUrl);
            return;
        }

        // Start backend if auto-start is enabled
        if (autoStart) {
            this.outputChannel.appendLine('Backend not running, attempting to start...');
            await this.startBackend(backendUrl);
        } else {
            this.outputChannel.appendLine('Backend not running and auto-start is disabled');
            vscode.window.showWarningMessage(
                'FPB Backend is not running. Enable auto-start in settings or start the backend manually.'
            );
        }
    }

    /**
     * Check if the backend is healthy by calling the health endpoint
     */
    private async checkHealth(backendUrl: string): Promise<boolean> {
        try {
            const response = await axios.get(`${backendUrl}/api/health`, {
                timeout: 5000,
                validateStatus: (status) => status === 200,
            });
            return response.data?.status === 'ok';
        } catch (error) {
            return false;
        }
    }

    /**
     * Start the backend server using uvicorn
     */
    private async startBackend(backendUrl: string): Promise<void> {
        try {
            // Parse the URL to get host and port
            const url = new URL(backendUrl);
            const host = url.hostname;
            const port = parseInt(url.port || '8000', 10);

            // Find the backend directory
            const backendPath = await this.findBackendPath();
            if (!backendPath) {
                vscode.window.showErrorMessage(
                    'FPB Backend directory not found. Please check your installation.'
                );
                return;
            }

            this.outputChannel.appendLine(`Backend path: ${backendPath}`);
            this.outputChannel.appendLine(`Starting backend on ${host}:${port}...`);

            // Start uvicorn process
            // Using python3 or python, and running uvicorn as a module
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

            this.backendProcess = child_process.spawn(
                pythonCmd,
                [
                    '-m', 'uvicorn',
                    'main:app',
                    '--host', host,
                    '--port', port.toString(),
                    '--reload'
                ],
                {
                    cwd: backendPath,
                    env: { ...process.env },
                    shell: true
                }
            );

            // Handle process output
            this.backendProcess.stdout?.on('data', (data) => {
                this.outputChannel.appendLine(`[Backend] ${data.toString().trim()}`);
            });

            this.backendProcess.stderr?.on('data', (data) => {
                this.outputChannel.appendLine(`[Backend Error] ${data.toString().trim()}`);
            });

            this.backendProcess.on('error', (error) => {
                this.outputChannel.appendLine(`[Backend Error] ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start FPB backend: ${error.message}`);
            });

            this.backendProcess.on('exit', (code, signal) => {
                this.outputChannel.appendLine(`[Backend] Process exited with code ${code}, signal ${signal}`);
                this.isBackendReady = false;
                this.backendProcess = null;
            });

            // Wait for the backend to become ready
            await this.waitForBackend(backendUrl);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`Failed to start backend: ${errorMsg}`);
            vscode.window.showErrorMessage(`Failed to start FPB backend: ${errorMsg}`);
        }
    }

    /**
     * Find the backend directory relative to the extension
     */
    private async findBackendPath(): Promise<string | null> {
        // The extension is in a worktree, so we need to find the main project
        // Try several possible locations
        const possiblePaths = [
            // If extension is installed normally
            path.join(this.context.extensionPath, '..', '..', 'backend'),
            // If extension is in development (worktree)
            path.join(this.context.extensionPath, '..', '..', '..', '..', '..', 'backend'),
            // If running from the project root
            path.join(this.context.extensionPath, '..', 'backend'),
        ];

        for (const backendPath of possiblePaths) {
            try {
                const mainPyPath = path.join(backendPath, 'main.py');
                if (fs.existsSync(mainPyPath)) {
                    return backendPath;
                }
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * Wait for the backend to become ready by polling the health endpoint
     */
    private async waitForBackend(backendUrl: string, maxRetries: number = 30): Promise<void> {
        this.outputChannel.appendLine('Waiting for backend to become ready...');

        for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const isHealthy = await this.checkHealth(backendUrl);
            if (isHealthy) {
                this.outputChannel.appendLine('Backend is ready!');
                this.isBackendReady = true;
                this.startHealthMonitoring(backendUrl);
                vscode.window.showInformationMessage('FPB Backend started successfully');
                return;
            }

            this.outputChannel.appendLine(`Waiting for backend... (${i + 1}/${maxRetries})`);
        }

        throw new Error('Backend failed to start within the timeout period');
    }

    /**
     * Start periodic health monitoring
     */
    private startHealthMonitoring(backendUrl: string): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Check health every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            const isHealthy = await this.checkHealth(backendUrl);
            if (!isHealthy && this.isBackendReady) {
                this.outputChannel.appendLine('Backend health check failed');
                this.isBackendReady = false;
                vscode.window.showWarningMessage('FPB Backend connection lost');
            } else if (isHealthy && !this.isBackendReady) {
                this.outputChannel.appendLine('Backend health check restored');
                this.isBackendReady = true;
            }
        }, 30000);

        this.context.subscriptions.push({
            dispose: () => {
                if (this.healthCheckInterval) {
                    clearInterval(this.healthCheckInterval);
                }
            }
        });
    }

    /**
     * Check if the backend is ready to accept requests
     */
    isReady(): boolean {
        return this.isBackendReady;
    }

    /**
     * Get the configured backend URL
     */
    getBackendUrl(): string {
        const config = vscode.workspace.getConfiguration('fpb');
        return config.get<string>('backend.url', 'http://localhost:8000');
    }

    /**
     * Dispose of resources and stop the backend if we started it
     */
    dispose(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        if (this.backendProcess) {
            this.outputChannel.appendLine('Stopping backend process...');
            this.backendProcess.kill();
            this.backendProcess = null;
        }

        this.outputChannel.dispose();
    }
}
