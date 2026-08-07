import { FILE_MANAGER_SERVICE_URL } from "./config";

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: string;
}

export interface FileDto {
  id: string;
  name: string;
  folderId: string | null;
  size: string;
  mimeType: string;
  thumbnailStatus?: "none" | "pending" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
  role?: "owner" | "editor" | "viewer" | null;
}

export interface FolderContents {
  folders: FolderDto[];
  files: FileDto[];
  breadcrumb: { id: string; name: string }[];
  mode?: "owned" | "shared";
}

export type ShareRole = "viewer" | "editor";

export interface PermissionGrant {
  userId: string;
  role: ShareRole | "owner";
  fileId?: string;
  folderId?: string;
}

export interface ShareLinkMeta {
  id: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface CreatedShareLink extends ShareLinkMeta {
  token: string;
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getFile(token: string, id: string): Promise<FileDto> {
  return call(token, `/files/${id}`);
}

export function listFolder(token: string, parentId: string | null): Promise<FolderContents> {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return call(token, `/folders${qs}`);
}

export function createFolder(token: string, name: string, parentId: string | null) {
  return call(token, "/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
}

export function renameFolder(token: string, id: string, name: string) {
  return call(token, `/folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(token: string, id: string) {
  return call(token, `/folders/${id}`, { method: "DELETE" });
}

export function moveFolder(token: string, id: string, parentId: string | null) {
  return call(token, `/folders/${id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
}

export function copyFolder(token: string, id: string, targetParentId: string | null) {
  return call(token, `/folders/${id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetParentId }),
  });
}

export function renameFile(token: string, id: string, name: string) {
  return call(token, `/files/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteFile(token: string, id: string) {
  return call(token, `/files/${id}`, { method: "DELETE" });
}

export function moveFile(token: string, id: string, folderId: string | null) {
  return call(token, `/files/${id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId }),
  });
}

export function copyFile(token: string, id: string, targetFolderId: string | null) {
  return call(token, `/files/${id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetFolderId }),
  });
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

export function shareFile(token: string, id: string, userId: string, role: ShareRole) {
  return call(token, `/files/${id}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
}

export function shareFolder(token: string, id: string, userId: string, role: ShareRole) {
  return call(token, `/folders/${id}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
}

export function unshareFile(token: string, id: string, userId: string) {
  return call(token, `/files/${id}/share/${userId}`, { method: "DELETE" });
}

export function unshareFolder(token: string, id: string, userId: string) {
  return call(token, `/folders/${id}/share/${userId}`, { method: "DELETE" });
}

export function listFilePermissions(token: string, id: string): Promise<PermissionGrant[]> {
  return call(token, `/files/${id}/permissions`);
}

export function listFolderPermissions(token: string, id: string): Promise<PermissionGrant[]> {
  return call(token, `/folders/${id}/permissions`);
}

export function listSharedWithMe(token: string): Promise<{
  files: (FileDto & { role: ShareRole | "owner"; ownerId: string })[];
  folders: (FolderDto & { role: ShareRole | "owner"; ownerId: string })[];
}> {
  return call(token, "/shared");
}

export function createFileShareLink(token: string, id: string, expiresAt?: string | null) {
  return call<CreatedShareLink>(token, `/files/${id}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresAt: expiresAt ?? null }),
  });
}

export function createFolderShareLink(token: string, id: string, expiresAt?: string | null) {
  return call<CreatedShareLink>(token, `/folders/${id}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresAt: expiresAt ?? null }),
  });
}

export function listFileShareLinks(token: string, id: string): Promise<ShareLinkMeta[]> {
  return call(token, `/files/${id}/links`);
}

export function listFolderShareLinks(token: string, id: string): Promise<ShareLinkMeta[]> {
  return call(token, `/folders/${id}/links`);
}

export function revokeFileShareLink(token: string, id: string, linkId: string) {
  return call(token, `/files/${id}/links/${linkId}`, { method: "DELETE" });
}

export function revokeFolderShareLink(token: string, id: string, linkId: string) {
  return call(token, `/folders/${id}/links/${linkId}`, { method: "DELETE" });
}

export function getStorageUsage(token: string): Promise<{ totalBytes: string }> {
  return call(token, "/storage/usage");
}
