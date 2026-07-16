"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useUploadQueue } from "./UploadQueueProvider";

export function UploadDropzone({ folderId }: { folderId: string | null }) {
  const { enqueueUpload } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      enqueueUpload(file, folderId);
    }
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
        uploadFiles(e.dataTransfer.files);
      }}
      className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
        dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <UploadCloud size={28} className="mx-auto mb-2 text-neutral-400" />
      <p className="mb-2 text-neutral-600 dark:text-neutral-400">Arraste arquivos aqui ou</p>
      <button
        onClick={() => inputRef.current?.click()}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Selecionar arquivos
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
    </div>
  );
}
