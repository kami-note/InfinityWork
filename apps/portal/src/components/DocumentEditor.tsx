"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
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
import { FontSize } from "@/lib/tiptap-font-size";
import { PageBreak } from "@/lib/tiptap-page-break";
import { createPaginationExtension, type PageMetricsRef } from "@/lib/tiptap-pagination";
import { MARGIN_PRESETS, unwrapSavedContent, type MarginPreset } from "@/lib/document-format";
import { DocumentToolbar } from "./DocumentToolbar";
import { renameFileAction } from "@/lib/actions";

type SaveStatus = "saved" | "saving" | "error";

// 1056px ≈ 11in @96dpi — the visible page height everything else (margins,
// auto-pagination) measures against.
const PAGE_HEIGHT = 1056;
// Gap between stacked page sheets — must match --page-gap in globals.css.
const PAGE_GAP = 32;

function metricsForMargin(margin: MarginPreset): Pick<PageMetricsRef, "contentHeight" | "breakHeight"> {
  const m = MARGIN_PRESETS[margin];
  return {
    contentHeight: PAGE_HEIGHT - 2 * m,
    breakHeight: PAGE_GAP + 2 * m,
  };
}

const BASE_EXTENSIONS = [
  // Levels 1-5 back the style dropdown's Título/Subtítulo/Título 1-3 —
  // see the comment above STYLE_OPTIONS in DocumentToolbar.tsx.
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
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
];

export function DocumentEditor({
  fileId,
  initialContent,
  initialName,
  folderId,
}: {
  fileId: string;
  initialContent: unknown;
  initialName: string;
  folderId: string | null;
}) {
  const router = useRouter();
  const { doc: initialDoc, margin: initialMargin } = useMemo(() => unwrapSavedContent(initialContent), [initialContent]);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [title, setTitle] = useState(initialName);
  const [margin, setMargin] = useState<MarginPreset>(initialMargin);
  const marginRef = useRef(margin);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A plain mutable box, not React state: the pagination plugin (created
  // once, below) reads these fields on every recompute, so changing margin
  // just needs to update the values — no editor/extension recreation.
  const pageMetricsRef = useRef<PageMetricsRef>(metricsForMargin(initialMargin)).current;

  const extensions = useMemo(() => [...BASE_EXTENSIONS, createPaginationExtension(pageMetricsRef)], [pageMetricsRef]);

  const editor = useEditor({
    extensions,
    content: initialDoc as never,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setStatus("saving");
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      // Debounced autosave: keeps every keystroke from hitting the network
      // while still saving a few seconds after the user pauses typing.
      saveTimeout.current = setTimeout(() => {
        void save(editor.getJSON(), marginRef.current);
      }, 1500);
    },
  });

  async function save(doc: unknown, currentMargin: MarginPreset) {
    try {
      const res = await fetch(`/api/docs/${fileId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { doc, margin: currentMargin } }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handleMarginChange(next: MarginPreset) {
    setMargin(next);
    marginRef.current = next;
    Object.assign(pageMetricsRef, metricsForMargin(next));
    if (editor) void save(editor.getJSON(), next);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleTimeout.current) clearTimeout(titleTimeout.current);
    titleTimeout.current = setTimeout(() => {
      if (value.trim()) void renameFileAction(fileId, value.trim());
    }, 800);
  }

  async function handleInsertImage(file: File) {
    if (!editor) return;
    const form = new FormData();
    form.append("file", file);
    if (folderId) form.append("folderId", folderId);
    const res = await fetch("/api/files/upload", { method: "POST", body: form });
    if (!res.ok) return;
    const uploaded = await res.json();
    editor.chain().focus().setImage({ src: `/api/files/${uploaded.id}/download?disposition=inline` }).run();
    router.refresh();
  }

  useEffect(() => {
    // `.focus()` with no explicit position restores the *current*
    // selection — on a document that's never been focused at all (right
    // after opening it), there isn't one yet, and the call silently no-ops
    // instead of falling back to a sane position. Every toolbar button and
    // the empty-page click handler below call `.focus()` this way, so
    // without an initial real selection the first toolbar action taken
    // before ever clicking into the text could land on an invalid
    // position. Focusing once on mount — same as a real page of paper
    // already having a blinking cursor when you open it — removes that
    // edge case entirely.
    if (editor) editor.commands.focus("start", { scrollIntoView: false });
  }, [editor]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      if (titleTimeout.current) clearTimeout(titleTimeout.current);
    };
  }, []);

  if (!editor) return null;

  const statusLabel = { saved: "Salvo", saving: "Salvando...", error: "Erro ao salvar" }[status];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          size={Math.max(title.length, 8)}
          className="max-w-md rounded border border-transparent px-2 py-1 text-xl outline-none hover:border-neutral-300 focus:border-neutral-300 focus:bg-white dark:hover:border-neutral-700 dark:focus:border-neutral-700 dark:focus:bg-neutral-800"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{statusLabel}</span>
          <a href={`/api/docs/${fileId}/export`} className="text-sm text-blue-600 hover:underline">
            Exportar .docx
          </a>
        </div>
      </div>

      <DocumentToolbar editor={editor} margin={margin} onMarginChange={handleMarginChange} onInsertImage={handleInsertImage} />

      <div className="flex-1 overflow-auto bg-neutral-100 py-8 dark:bg-neutral-950">
        {/* A4-ish "page" (816px ≈ 8.5in @96dpi), echoing Google Docs' page
            view instead of an edge-to-edge text box. Clicking anywhere on
            the page — not just directly on existing text — focuses the
            editor, same as a real page of paper. Page boundaries (both
            manual and auto-computed by tiptap-pagination.ts) render as
            gray bands inside the content — see [data-page-break] in
            globals.css. */}
        <div
          onClick={(e) => {
            // Only handle clicks that land outside the actual editable
            // content (empty page padding) — a click inside real text
            // already gives the browser a native selection to restore, and
            // .focus() with no explicit position needs *some* prior
            // selection to fall back to. It silently no-ops on a
            // never-focused editor otherwise, which is exactly the state
            // right after opening a fresh document.
            if ((e.target as HTMLElement).closest(".ProseMirror")) return;
            editor.chain().focus("end").run();
          }}
          style={
            {
              padding: MARGIN_PRESETS[margin],
              minHeight: PAGE_HEIGHT,
              "--page-margin": `${MARGIN_PRESETS[margin]}px`,
              "--page-gap": `${PAGE_GAP}px`,
            } as React.CSSProperties
          }
          className="mx-auto w-[816px] max-w-full cursor-text bg-white text-black shadow dark:shadow-none"
        >
          <EditorContent editor={editor} className="tiptap-content h-full focus:outline-none" />
        </div>
      </div>
    </div>
  );
}
