"use server";

import { revalidatePath } from "next/cache";
import { requireAccessToken } from "./session";
import * as fm from "./file-manager-client";

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

export async function shareFileAction(id: string, userId: string, role: "owner" | "editor" | "viewer") {
  const token = await requireAccessToken();
  await fm.shareFile(token, id, userId, role);
  revalidatePath("/drive");
}
