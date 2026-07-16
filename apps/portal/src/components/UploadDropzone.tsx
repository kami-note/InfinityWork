"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";

export function UploadDropzone({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      if (folderId) form.append("folderId", folderId);
      await fetch("/api/files/upload", { method: "POST", body: form });
    }
    setUploading(false);
    router.refresh();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void uploadFiles(e.dataTransfer.files);
      }}
      className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
        dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <UploadCloud size={28} className="mx-auto mb-2 text-neutral-400" />
      <p className="mb-2 text-neutral-600 dark:text-neutral-400">
        {uploading ? "Enviando..." : "Arraste arquivos aqui ou"}
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Selecionar arquivos
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => void uploadFiles(e.target.files)}
      />
    </div>
  );
}
