/** API client service for backend communication. */

import type { ProcessModel } from "../types/fpb";

const API_BASE = "/api";

interface ParseRequest {
  source: string;
  session_id?: string;
}

interface ParseResponse {
  session_id: string;
  model: ProcessModel;
}

interface ExportRequest {
  session_id: string;
}

interface ImportResponse {
  session_id: string;
  source: string;
  model: ProcessModel;
}

interface HealthResponse {
  status: string;
}

interface ApiError {
  detail: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error((body as ApiError).detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function handleBlobResponse(response: Response): Promise<Blob> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error((body as ApiError).detail || `Request failed: ${response.status}`);
  }
  return response.blob();
}

export async function healthCheck(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(response);
}

export async function parseSource(request: ParseRequest): Promise<ParseResponse> {
  const response = await fetch(`${API_BASE}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleResponse<ParseResponse>(response);
}

export async function exportXml(request: ExportRequest): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export/xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleBlobResponse(response);
}

export async function exportText(request: ExportRequest): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleBlobResponse(response);
}

export async function importFile(file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/import`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ImportResponse>(response);
}

/** Trigger a file download from a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
