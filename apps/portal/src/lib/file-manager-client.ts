import { FILE_MANAGER_SERVICE_URL } from "./config";

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
}

export interface FileDto {
  id: string;
  name: string;
  folderId: string | null;
  size: string;
  mimeType: string;
  createdAt: string;
}

export interface FolderContents {
  folders: FolderDto[];
  files: FileDto[];
  breadcrumb: { id: string; name: string }[];
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`file-manager request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function listFolder(token: string, parentId: string | null): Promise<FolderContents> {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return call(token, `/folders${qs}`);
}

export function createFolder(token: string, name: string, parentId: string | null) {
  return call(token, "/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId }) });
}

export function renameFolder(token: string, id: string, name: string) {
  return call(token, `/folders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
}

export function deleteFolder(token: string, id: string) {
  return call(token, `/folders/${id}`, { method: "DELETE" });
}

export function renameFile(token: string, id: string, name: string) {
  return call(token, `/files/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
}

export function deleteFile(token: string, id: string) {
  return call(token, `/files/${id}`, { method: "DELETE" });
}

export function restoreFile(token: string, id: string) {
  return call(token, `/files/${id}/restore`, { method: "POST" });
}

export function listTrash(token: string): Promise<FileDto[]> {
  return call(token, "/trash");
}

export function emptyTrash(token: string) {
  return call(token, "/trash/empty", { method: "POST" });
}

export function searchFiles(token: string, q: string): Promise<FileDto[]> {
  return call(token, `/search?q=${encodeURIComponent(q)}`);
}

export function shareFile(token: string, id: string, userId: string, role: "owner" | "editor" | "viewer") {
  return call(token, `/files/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
}
