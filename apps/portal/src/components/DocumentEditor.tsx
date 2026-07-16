"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type SaveStatus = "saved" | "saving" | "error";

function Toolbar({ editor }: { editor: Editor }) {
  const button = (active: boolean) =>
    `rounded px-2 py-1 text-sm ${active ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-900"}`;

  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200 p-2 dark:border-neutral-800">
      <button className={button(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
        Negrito
      </button>
      <button className={button(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
        Itálico
      </button>
      <button className={button(editor.isActive("heading", { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        Título 1
      </button>
      <button className={button(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        Título 2
      </button>
      <button className={button(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        Lista
      </button>
      <button className={button(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        Lista numerada
      </button>
    </div>
  );
}

export function DocumentEditor({ fileId, initialContent }: { fileId: string; initialContent: unknown }) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent as never,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setStatus("saving");
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      // Debounced autosave: keeps every keystroke from hitting the network
      // while still saving a few seconds after the user pauses typing.
      saveTimeout.current = setTimeout(() => {
        void save(editor.getJSON());
      }, 1500);
    },
  });

  async function save(content: unknown) {
    try {
      const res = await fetch(`/api/docs/${fileId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  if (!editor) return null;

  const statusLabel = { saved: "Salvo", saving: "Salvando...", error: "Erro ao salvar" }[status];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <Toolbar editor={editor} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{statusLabel}</span>
          <a href={`/api/docs/${fileId}/export`} className="text-sm text-blue-600 hover:underline">
            Exportar .docx
          </a>
        </div>
      </div>
      <div className="min-h-[60vh] rounded border border-neutral-200 p-6 dark:border-neutral-800">
        <EditorContent editor={editor} className="tiptap-content focus:outline-none" />
      </div>
    </div>
  );
}
