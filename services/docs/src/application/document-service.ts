import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
// @ts-expect-error -- html-to-docx ships no types
import HTMLtoDOCX from "html-to-docx";
import * as fileManager from "../infrastructure/file-manager-client.js";
import { FontSize } from "../font-size-extension.js";
import { PageBreak } from "../page-break-extension.js";
import { unwrapSavedContent } from "../document-format.js";

// Must match apps/portal/src/components/DocumentEditor.tsx's extension list
// — anything editable there that isn't registered here gets silently
// dropped from the exported .docx instead of erroring. (PageBreak was
// missing here for a while — the button worked in the editor but exports
// silently lost every page break, since generateHTML doesn't recognize
// node types it wasn't given.)
const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
  PageBreak,
  Underline,
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Link.configure({ openOnClick: false, autolink: true }),
  ImageExtension,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
];

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

// Images are stored as <img src="/api/files/<id>/download..."> — a portal
// route that only works with the browser's cookie session. html-to-docx
// needs an actual embeddable image, so every such src is replaced with a
// base64 data URI fetched directly from file-manager (which docs already
// talks to, with the caller's own bearer token) before conversion.
async function embedImages(html: string, token: string): Promise<string> {
  const matches = [...html.matchAll(/<img[^>]+src="\/api\/files\/([a-f0-9-]+)\/download[^"]*"/g)];
  const uniqueIds = [...new Set(matches.map((m) => m[1]))];

  const replacements = await Promise.all(
    uniqueIds.map(async (id) => {
      const file = await fileManager.downloadFileBytes(token, id);
      return [id, file] as const;
    }),
  );

  let result = html;
  for (const [id, file] of replacements) {
    if (!file) continue;
    const dataUri = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
    result = result.replaceAll(new RegExp(`/api/files/${id}/download[^"]*`, "g"), dataUri);
  }
  return result;
}

export async function exportDocumentAsDocx(token: string, fileId: string): Promise<Buffer> {
  const raw = await fileManager.downloadDocumentContent(token, fileId);
  const { doc } = unwrapSavedContent(raw);
  const html = generateHTML(doc as Record<string, unknown>, EXTENSIONS);
  const htmlWithEmbeddedImages = await embedImages(html, token);
  const buffer = await HTMLtoDOCX(htmlWithEmbeddedImages, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  return buffer;
}
