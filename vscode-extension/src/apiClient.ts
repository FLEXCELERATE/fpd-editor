import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';

/**
 * Diagram element from backend layout engine
 */
export interface DiagramElement {
    id: string;
    type: 'state' | 'processOperator' | 'technicalResource';
    label?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    stateType?: 'product' | 'energy' | 'information';
}

/**
 * Diagram connection from backend layout engine
 */
export interface DiagramConnection {
    id: string;
    sourceId: string;
    targetId: string;
    flowType?: string;
    isUsage: boolean;
}

/**
 * System limit boundary from backend layout engine
 */
export interface SystemLimitBounds {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Diagram data from backend layout engine
 */
export interface DiagramData {
    elements: DiagramElement[];
    connections: DiagramConnection[];
    systemLimits: SystemLimitBounds[];
    systemLimit: SystemLimitBounds | null;
}

/**
 * Process model from backend parser
 */
export interface ProcessModel {
    title: string;
    systems: Array<{ id: string; name: string; line_number?: number }>;
    states: Array<{ id: string; label: string; system_id?: string; line_number?: number }>;
    process_operators: Array<{ id: string; label: string; system_id?: string; line_number?: number }>;
    technical_resources: Array<{ id: string; label: string; system_id?: string; line_number?: number }>;
    flows: Array<{ id: string; source_ref: string; target_ref: string; line_number?: number }>;
    usages: Array<{ id: string; process_operator_ref: string; technical_resource_ref: string; line_number?: number }>;
    errors: string[];
    warnings: string[];
}

/**
 * Response from the parse API endpoint
 */
export interface ParseResponse {
    session_id: string;
    model: ProcessModel;
    diagram: DiagramData;
}

/**
 * Response from export endpoints
 */
export interface ExportResponse {
    success: boolean;
    data?: string;
    error?: string;
}

/**
 * Response from import endpoint
 */
export interface ImportResponse {
    success: boolean;
    content?: string;
    error?: string;
}

/**
 * API Client for FPB backend communication
 * Handles all HTTP requests to the FastAPI backend
 */
export class ApiClient {
    private client: AxiosInstance;
    private sessionId: string;
    private outputChannel: vscode.OutputChannel;

    constructor(baseURL: string, outputChannel?: vscode.OutputChannel) {
        this.sessionId = this.generateSessionId();
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('FPB API Client');

        // Create axios instance with default configuration
        this.client = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                this.handleError(error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Generate a unique session ID for tracking requests
     */
    private generateSessionId(): string {
        return `vscode-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Handle API errors and display appropriate messages
     */
    private handleError(error: AxiosError): void {
        if (error.response) {
            // Server responded with an error status
            const status = error.response.status;
            const message = (error.response.data as any)?.detail || error.message;
            this.outputChannel.appendLine(`API Error ${status}: ${message}`);

            if (status >= 500) {
                vscode.window.showErrorMessage(`FPB Backend Error: ${message}`);
            }
        } else if (error.request) {
            // Request was made but no response received
            this.outputChannel.appendLine(`Network Error: ${error.message}`);
            vscode.window.showErrorMessage(
                'Cannot connect to FPB backend. Please check if the backend is running.'
            );
        } else {
            // Something else happened
            this.outputChannel.appendLine(`Request Error: ${error.message}`);
        }
    }

    /**
     * Update the base URL for the API client
     */
    updateBaseURL(baseURL: string): void {
        this.client.defaults.baseURL = baseURL;
    }

    /**
     * Check backend health status
     */
    async health(): Promise<{ status: string }> {
        try {
            const response = await this.client.get('/api/health');
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Parse FPB content and return model + diagram data
     */
    async parse(content: string): Promise<ParseResponse> {
        try {
            const response = await this.client.post('/api/parse', {
                source: content,
                session_id: this.sessionId,
            });
            // Update session ID from backend response
            if (response.data.session_id) {
                this.sessionId = response.data.session_id;
            }
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                throw new Error((error.response.data as any)?.detail || 'Parse failed');
            }
            throw error;
        }
    }

    /**
     * Export diagram as XML
     */
    async exportXml(content: string): Promise<ExportResponse> {
        try {
            const response = await this.client.post('/api/export/xml', {
                content,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                return {
                    success: false,
                    error: (error.response.data as any)?.detail || 'Export failed',
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Export failed',
            };
        }
    }

    /**
     * Export diagram as plain text
     */
    async exportText(content: string): Promise<ExportResponse> {
        try {
            const response = await this.client.post('/api/export/text', {
                content,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                return {
                    success: false,
                    error: (error.response.data as any)?.detail || 'Export failed',
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Export failed',
            };
        }
    }

    /**
     * Import file (FPB or XML) and convert to FPB format
     */
    async importFile(fileContent: string, fileType: 'fpb' | 'xml'): Promise<ImportResponse> {
        try {
            const response = await this.client.post('/api/import', {
                content: fileContent,
                type: fileType,
            });
            return {
                success: true,
                content: response.data.content || response.data,
            };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                return {
                    success: false,
                    error: (error.response.data as any)?.detail || 'Import failed',
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Import failed',
            };
        }
    }

    /**
     * Validate FPB content and return validation errors
     */
    async validate(content: string): Promise<ParseResponse> {
        // Validation is done through the parse endpoint
        // The backend returns both diagram data and errors
        return this.parse(content);
    }

    /**
     * Get the current session ID
     */
    getSessionId(): string {
        return this.sessionId;
    }

    /**
     * Reset the session ID (useful for testing or starting fresh)
     */
    resetSession(): void {
        this.sessionId = this.generateSessionId();
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Close any pending requests
        // Note: axios doesn't have a built-in dispose method,
        // but we can clear the session
        this.resetSession();
    }
}

/**
 * Create a new API client instance
 */
export function createApiClient(
    backendUrl: string,
    outputChannel?: vscode.OutputChannel
): ApiClient {
    return new ApiClient(backendUrl, outputChannel);
}
