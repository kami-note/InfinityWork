import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
// @ts-expect-error -- html-to-docx ships no types
import HTMLtoDOCX from "html-to-docx";
import * as fileManager from "../infrastructure/file-manager-client.js";

const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export async function createDocument(token: string, name: string, folderId: string | null) {
  return fileManager.createDocumentFile(token, { name, folderId, content: EMPTY_DOCUMENT });
}

export async function getDocumentContent(token: string, fileId: string) {
  return fileManager.downloadDocumentContent(token, fileId);
}

export async function saveDocumentContent(token: string, fileId: string, content: unknown) {
  return fileManager.saveDocumentContent(token, fileId, content);
}

export async function exportDocumentAsDocx(token: string, fileId: string): Promise<Buffer> {
  const content = await fileManager.downloadDocumentContent(token, fileId);
  const html = generateHTML(content as Record<string, unknown>, [StarterKit]);
  const buffer = await HTMLtoDOCX(html, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  return buffer;
}
