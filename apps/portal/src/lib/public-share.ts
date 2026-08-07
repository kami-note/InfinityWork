import { FILE_MANAGER_SERVICE_URL } from "./config";
import type { FileDto } from "./file-manager-client";

export type PublicShareFile = {
  id: string;
  name: string;
  size: string;
  mimeType: string;
  thumbnailStatus?: "none" | "pending" | "ready" | "failed";
  folderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicShareMeta =
  | { targetType: "file"; file: PublicShareFile & { updatedAt: string } }
  | { targetType: "folder"; folder: { id: string; name: string; updatedAt: string } };

export type PublicShareChildren = {
  folders: { id: string; name: string }[];
  files: PublicShareFile[];
  breadcrumb: { id: string; name: string }[];
};

async function publicGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export function fetchShareMeta(token: string) {
  return publicGet<PublicShareMeta>(`/public/links/${encodeURIComponent(token)}`);
}

export function fetchShareChildren(token: string, parentId?: string | null) {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return publicGet<PublicShareChildren>(`/public/links/${encodeURIComponent(token)}/children${qs}`);
}

export function fetchShareFile(token: string, fileId: string) {
  return publicGet<PublicShareFile & { folderId: string | null; updatedAt: string }>(
    `/public/links/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`,
  );
}

export function sharePagePath(token: string, opts?: { folderId?: string | null; view?: string }) {
  const params = new URLSearchParams();
  if (opts?.folderId) params.set("folderId", opts.folderId);
  if (opts?.view) params.set("view", opts.view);
  const qs = params.toString();
  return `/s/${encodeURIComponent(token)}${qs ? `?${qs}` : ""}`;
}

/** Portal proxy URL for a public share download (file link, or file under folder link). */
export function shareDownloadPath(token: string, fileId?: string) {
  if (fileId) {
    return `/api/share/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}/download`;
  }
  return `/api/share/${encodeURIComponent(token)}/download`;
}

export function shareInlinePath(token: string, fileId?: string) {
  return `${shareDownloadPath(token, fileId)}?disposition=inline`;
}

/** Portal proxy URL for a public share JPEG thumbnail (when ready). */
export function shareThumbnailPath(token: string, fileId?: string) {
  if (fileId) {
    return `/api/share/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}/thumbnail`;
  }
  return `/api/share/${encodeURIComponent(token)}/thumbnail`;
}

export function toFileDto(file: PublicShareFile): FileDto {
  return {
    id: file.id,
    name: file.name,
    folderId: file.folderId ?? null,
    size: file.size,
    mimeType: file.mimeType,
    thumbnailStatus: file.thumbnailStatus,
    createdAt: file.createdAt ?? "",
    updatedAt: file.updatedAt ?? "",
  };
}

export function siblingVideos(files: PublicShareFile[], currentId: string): FileDto[] {
  return files
    .filter((f) => f.id !== currentId && f.mimeType.startsWith("video/"))
    .map(toFileDto);
}
