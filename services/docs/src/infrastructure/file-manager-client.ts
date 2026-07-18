import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";

const FILE_MANAGER_URL = process.env.FILE_MANAGER_SERVICE_URL ?? "http://file-manager:4002";

export interface FileManagerFile {
  id: string;
  name: string;
  folderId: string | null;
  mimeType: string;
}

/**
 * The docs service never touches file-manager's database — it only ever
 * calls its public API, forwarding the caller's own bearer token so
 * file-manager's RBAC + resource ACL checks apply exactly as they would for
 * any other client. This keeps file-manager the single owner of physical
 * bytes and authorization for them.
 */
export async function createDocumentFile(
  token: string,
  params: { name: string; folderId: string | null; content: unknown },
): Promise<FileManagerFile> {
  const body = new FormData();
  const blob = new Blob([JSON.stringify(params.content)], { type: DOCUMENT_MIME_TYPE });
  // Field order matters: file-manager's request.file() reads the parsed
  // fields as soon as it sees the file part, before anything placed after
  // it in the multipart body has been parsed — folderId has to come first
  // or it's silently lost (see UploadQueueProvider.tsx for the same fix).
  if (params.folderId) body.append("folderId", params.folderId);
  body.append("file", blob, params.name);

  const res = await fetch(`${FILE_MANAGER_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`file-manager create failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<FileManagerFile>;
}

export async function downloadDocumentContent(token: string, fileId: string): Promise<unknown> {
  const res = await fetch(`${FILE_MANAGER_URL}/files/${fileId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`file-manager download failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function downloadFileBytes(
  token: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const res = await fetch(`${FILE_MANAGER_URL}/files/${fileId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
}

export async function saveDocumentContent(
  token: string,
  fileId: string,
  content: unknown,
): Promise<FileManagerFile> {
  const body = new FormData();
  const blob = new Blob([JSON.stringify(content)], { type: DOCUMENT_MIME_TYPE });
  body.append("file", blob, "content");

  const res = await fetch(`${FILE_MANAGER_URL}/files/${fileId}/content`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`file-manager content update failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<FileManagerFile>;
}
