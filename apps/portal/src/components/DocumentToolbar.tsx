"use client";

import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Link as LinkIcon,
  ImageIcon,
  RemoveFormatting,
  Baseline,
  SeparatorHorizontal,
  TableIcon,
  Rows3,
  Columns3,
  Trash2,
} from "lucide-react";
import type { MarginPreset } from "@/lib/document-format";

const MARGIN_OPTIONS: { label: string; value: MarginPreset }[] = [
  { label: "Margem normal", value: "normal" },
  { label: "Margem estreita", value: "narrow" },
  { label: "Margem larga", value: "wide" },
];

// Google Docs' "Título"/"Subtítulo" aren't semantically different from
// Heading levels — they're just distinctly-styled paragraph styles. Rather
// than build a second custom node type, this reuses the standard Heading
// node's levels 1-5 and gives each its own look in globals.css, with the
// dropdown labels matching what users actually recognize from Docs.
const STYLE_OPTIONS = [
  { label: "Texto normal", level: 0 },
  { label: "Título", level: 1 },
  { label: "Subtítulo", level: 2 },
  { label: "Título 1", level: 3 },
  { label: "Título 2", level: 4 },
  { label: "Título 3", level: 5 },
] as const;

const FONT_FAMILIES = [
  { label: "Padrão", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const FONT_SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "72"];

function Divider() {
  return <div className="mx-1 h-6 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded disabled:opacity-30 ${
        active
          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

export function DocumentToolbar({
  editor,
  margin,
  onMarginChange,
  onInsertImage,
}: {
  editor: Editor;
  margin: MarginPreset;
  onMarginChange: (margin: MarginPreset) => void;
  onInsertImage: (file: File) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textColorRef = useRef<HTMLInputElement>(null);
  const highlightColorRef = useRef<HTMLInputElement>(null);

  const alignments = [
    { value: "left", icon: AlignLeft, label: "Alinhar à esquerda" },
    { value: "center", icon: AlignCenter, label: "Centralizar" },
    { value: "right", icon: AlignRight, label: "Alinhar à direita" },
    { value: "justify", icon: AlignJustify, label: "Justificar" },
  ] as const;

  const currentLevel = STYLE_OPTIONS.find((s) => s.level > 0 && editor.isActive("heading", { level: s.level }))?.level ?? 0;

  function setStyle(level: number) {
    if (level === 0) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 }).run();
  }

  function setLink() {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-white p-1.5 dark:border-neutral-800 dark:bg-neutral-900">
      <ToolbarButton title="Desfazer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton title="Refazer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 size={16} />
      </ToolbarButton>

      <Divider />

      <select
        title="Estilo do parágrafo"
        className="h-8 w-32 shrink-0 rounded border border-neutral-200 bg-white px-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        onChange={(e) => setStyle(Number(e.target.value))}
        value={currentLevel}
      >
        {STYLE_OPTIONS.map((s) => (
          <option key={s.label} value={s.level}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        title="Margens da página"
        className="h-8 shrink-0 rounded border border-neutral-200 bg-white px-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        onChange={(e) => onMarginChange(e.target.value as MarginPreset)}
        value={margin}
      >
        {MARGIN_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <Divider />

      <select
        title="Fonte"
        className="h-8 max-w-[9rem] rounded border border-neutral-200 bg-white px-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        onChange={(e) => {
          const value = e.target.value;
          if (value) editor.chain().focus().setFontFamily(value).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        value={(editor.getAttributes("textStyle").fontFamily as string | undefined) ?? ""}
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        title="Tamanho da fonte"
        className="h-8 w-16 rounded border border-neutral-200 bg-white px-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}pt`).run()}
        value={((editor.getAttributes("textStyle").fontSize as string | undefined) ?? "11pt").replace("pt", "")}
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <Divider />

      <ToolbarButton title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton title="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon size={16} />
      </ToolbarButton>
      <ToolbarButton title="Tachado" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={16} />
      </ToolbarButton>

      <ToolbarButton title="Cor do texto" onClick={() => textColorRef.current?.click()}>
        <Baseline size={16} />
      </ToolbarButton>
      <input
        ref={textColorRef}
        type="color"
        className="h-0 w-0 opacity-0"
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
      />

      <ToolbarButton title="Cor de destaque" onClick={() => highlightColorRef.current?.click()}>
        <Highlighter size={16} />
      </ToolbarButton>
      <input
        ref={highlightColorRef}
        type="color"
        className="h-0 w-0 opacity-0"
        onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
      />

      <Divider />

      {alignments.map(({ value, icon: Icon, label }) => (
        <ToolbarButton
          key={value}
          title={label}
          active={editor.isActive({ textAlign: value })}
          onClick={() => editor.chain().focus().setTextAlign(value).run()}
        >
          <Icon size={16} />
        </ToolbarButton>
      ))}

      <Divider />

      <ToolbarButton title="Lista com marcadores" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton title="Lista de tarefas" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={16} />
      </ToolbarButton>
      <ToolbarButton title="Bloco de código" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 size={16} />
      </ToolbarButton>
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
        <LinkIcon size={16} />
      </ToolbarButton>
      <ToolbarButton title="Inserir imagem" onClick={() => imageInputRef.current?.click()}>
        <ImageIcon size={16} />
      </ToolbarButton>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onInsertImage(file);
          e.target.value = "";
        }}
      />

      <ToolbarButton title="Inserir quebra de página" onClick={() => editor.chain().focus().insertPageBreak().run()}>
        <SeparatorHorizontal size={16} />
      </ToolbarButton>

      <ToolbarButton
        title="Inserir tabela"
        active={editor.isActive("table")}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon size={16} />
      </ToolbarButton>

      {editor.isActive("table") && (
        <>
          <ToolbarButton title="Adicionar linha abaixo" onClick={() => editor.chain().focus().addRowAfter().run()}>
            <Rows3 size={16} />
          </ToolbarButton>
          <ToolbarButton title="Adicionar coluna à direita" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            <Columns3 size={16} />
          </ToolbarButton>
          <ToolbarButton title="Excluir tabela" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 size={16} />
          </ToolbarButton>
        </>
      )}

      <Divider />

      <ToolbarButton title="Limpar formatação" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <RemoveFormatting size={16} />
      </ToolbarButton>
    </div>
  );
}
