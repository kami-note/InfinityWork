import { Folder, FileText, FileSpreadsheet, FileImage, FileVideo, FileArchive, File as FileGeneric } from "lucide-react";
import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";

/**
 * Icon + color pairing loosely mirrors Google Drive's file-type color
 * language (blue docs, green sheets, red PDFs, yellow folders) using an
 * open-source icon set instead of Google's own assets.
 */
export function FileTypeIcon({ mimeType, size = 40 }: { mimeType: string; size?: number }) {
  if (mimeType === DOCUMENT_MIME_TYPE) {
    return <FileText size={size} className="text-blue-600 dark:text-blue-400" />;
  }
  if (mimeType === "application/pdf") {
    return <FileText size={size} className="text-red-600 dark:text-red-400" />;
  }
  if (mimeType.startsWith("image/")) {
    return <FileImage size={size} className="text-purple-500 dark:text-purple-400" />;
  }
  if (mimeType.startsWith("video/")) {
    return <FileVideo size={size} className="text-rose-500 dark:text-rose-400" />;
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) {
    return <FileSpreadsheet size={size} className="text-green-600 dark:text-green-400" />;
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("archive")) {
    return <FileArchive size={size} className="text-neutral-500" />;
  }
  return <FileGeneric size={size} className="text-neutral-400" />;
}

export function FolderIcon({ size = 40 }: { size?: number }) {
  return <Folder size={size} className="fill-yellow-400 text-yellow-500 dark:fill-yellow-500 dark:text-yellow-600" />;
}
