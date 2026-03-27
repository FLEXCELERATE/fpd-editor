/** API client service for backend communication. */

import type { ProcessModel } from "../types/fpd";

const API_BASE = "/api";

interface ParseResponse {
  model: ProcessModel;
  diagram: unknown;
}

interface ImportResponse {
  source: string;
  model: ProcessModel;
  diagram: unknown;
}

interface ApiError {
  error: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as ApiError).error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function handleBlobResponse(response: Response): Promise<Blob> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as ApiError).error || `Request failed: ${response.status}`);
  }
  return response.blob();
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse<{ status: string }>(response);
}

export async function parseSource(source: string): Promise<ParseResponse> {
  const response = await fetch(`${API_BASE}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  return handleResponse<ParseResponse>(response);
}

export async function renderSvg(source: string): Promise<string> {
  const response = await fetch(`${API_BASE}/render/svg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as ApiError).error || `Request failed: ${response.status}`);
  }
  return response.text();
}

export async function exportXml(source: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export/source/xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  return handleBlobResponse(response);
}

export async function exportText(source: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export/source/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  return handleBlobResponse(response);
}

export async function exportPdf(source: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export/source/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  return handleBlobResponse(response);
}

export async function importFile(content: string, filename: string): Promise<ImportResponse> {
  const response = await fetch(`${API_BASE}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename }),
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
