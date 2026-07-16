"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { restoreFileAction } from "@/lib/actions";
import type { FileDto } from "@/lib/file-manager-client";
import { FileTypeIcon } from "@/lib/file-icon";

export function TrashItemRow({ file }: { file: FileDto }) {
  const router = useRouter();

  async function handleRestore() {
    await restoreFileAction(file.id);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-3">
        <FileTypeIcon mimeType={file.mimeType} size={20} />
        <span>{file.name}</span>
      </div>
      <button onClick={handleRestore} className="flex items-center gap-1.5 text-blue-600 hover:underline">
        <RotateCcw size={14} />
        Restaurar
      </button>
    </div>
  );
}
