import { DOCS_SERVICE_URL } from "./config";

export interface DocumentFileDto {
  id: string;
  name: string;
  folderId: string | null;
  mimeType: string;
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DOCS_SERVICE_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`docs request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function createDocument(token: string, name: string, folderId: string | null) {
  return call<DocumentFileDto>(token, "/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folderId }),
  });
}

export function getDocumentContent(token: string, fileId: string) {
  return call<{ content: unknown }>(token, `/documents/${fileId}`);
}
