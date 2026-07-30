"use server";

import { revalidatePath } from "next/cache";
import { requireAccessToken } from "./session";
import * as fm from "./file-manager-client";
import * as docs from "./docs-client";

export async function createFolderAction(name: string, parentId: string | null) {
  const token = await requireAccessToken();
  await fm.createFolder(token, name, parentId);
  revalidatePath("/drive");
}

export async function renameFolderAction(id: string, name: string) {
  const token = await requireAccessToken();
  await fm.renameFolder(token, id, name);
  revalidatePath("/drive");
}

export async function deleteFolderAction(id: string) {
  const token = await requireAccessToken();
  await fm.deleteFolder(token, id);
  revalidatePath("/drive");
}

export async function createDocumentAction(name: string, folderId: string | null) {
  const token = await requireAccessToken();
  const file = await docs.createDocument(token, name, folderId);
  revalidatePath("/drive");
  return file;
}

export async function renameFileAction(id: string, name: string) {
  const token = await requireAccessToken();
  await fm.renameFile(token, id, name);
  revalidatePath("/drive");
}

export async function deleteFileAction(id: string) {
  const token = await requireAccessToken();
  await fm.deleteFile(token, id);
  revalidatePath("/drive");
  revalidatePath("/trash");
}

export async function restoreFileAction(id: string) {
  const token = await requireAccessToken();
  await fm.restoreFile(token, id);
  revalidatePath("/drive");
  revalidatePath("/trash");
}

export async function emptyTrashAction() {
  const token = await requireAccessToken();
  await fm.emptyTrash(token);
  revalidatePath("/trash");
}

export async function bulkDeleteAction(items: { id: string; kind: "folder" | "file" }[]) {
  const token = await requireAccessToken();
  await Promise.all(
    items.map((item) => (item.kind === "folder" ? fm.deleteFolder(token, item.id) : fm.deleteFile(token, item.id))),
  );
  revalidatePath("/drive");
  revalidatePath("/trash");
}

export async function moveItemsAction(items: { id: string; kind: "folder" | "file" }[], targetFolderId: string | null) {
  const token = await requireAccessToken();
  await Promise.all(
    items.map((item) =>
      item.kind === "folder" ? fm.moveFolder(token, item.id, targetFolderId) : fm.moveFile(token, item.id, targetFolderId),
    ),
  );
  revalidatePath("/drive");
}

export async function copyItemsAction(items: { id: string; kind: "folder" | "file" }[], targetFolderId: string | null) {
  const token = await requireAccessToken();
  await Promise.all(
    items.map((item) =>
      item.kind === "folder" ? fm.copyFolder(token, item.id, targetFolderId) : fm.copyFile(token, item.id, targetFolderId),
    ),
  );
  revalidatePath("/drive");
}

export async function shareByEmailAction(
  kind: "file" | "folder",
  id: string,
  email: string,
  role: "viewer" | "editor",
) {
  const token = await requireAccessToken();
  const { searchUserByEmail } = await import("./auth-client");
  const user = await searchUserByEmail(token, email);
  if (!user) throw new Error("Usuário não encontrado com este e-mail.");
  if (kind === "file") await fm.shareFile(token, id, user.id, role);
  else await fm.shareFolder(token, id, user.id, role);
  revalidatePath("/drive");
  revalidatePath("/drive/shared");
}

export async function unshareAction(kind: "file" | "folder", id: string, userId: string) {
  const token = await requireAccessToken();
  if (kind === "file") await fm.unshareFile(token, id, userId);
  else await fm.unshareFolder(token, id, userId);
  revalidatePath("/drive");
  revalidatePath("/drive/shared");
}

export async function listPermissionsAction(kind: "file" | "folder", id: string) {
  const token = await requireAccessToken();
  return kind === "file" ? fm.listFilePermissions(token, id) : fm.listFolderPermissions(token, id);
}

export async function createShareLinkAction(kind: "file" | "folder", id: string, expiresAt?: string | null) {
  const token = await requireAccessToken();
  return kind === "file"
    ? fm.createFileShareLink(token, id, expiresAt)
    : fm.createFolderShareLink(token, id, expiresAt);
}

export async function listShareLinksAction(kind: "file" | "folder", id: string) {
  const token = await requireAccessToken();
  return kind === "file" ? fm.listFileShareLinks(token, id) : fm.listFolderShareLinks(token, id);
}

export async function revokeShareLinkAction(kind: "file" | "folder", id: string, linkId: string) {
  const token = await requireAccessToken();
  if (kind === "file") await fm.revokeFileShareLink(token, id, linkId);
  else await fm.revokeFolderShareLink(token, id, linkId);
}

export type ShareTargetKind = "file" | "folder";

export async function shareFileAction(id: string, userId: string, role: "viewer" | "editor") {
  const token = await requireAccessToken();
  await fm.shareFile(token, id, userId, role);
  revalidatePath("/drive");
  revalidatePath("/drive/shared");
}
