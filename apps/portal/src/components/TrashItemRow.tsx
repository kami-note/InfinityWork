"use client";

import { useRouter } from "next/navigation";
import { restoreFileAction } from "@/lib/actions";
import type { FileDto } from "@/lib/file-manager-client";

export function TrashItemRow({ file }: { file: FileDto }) {
  const router = useRouter();

  async function handleRestore() {
    await restoreFileAction(file.id);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span>{file.name}</span>
      <button onClick={handleRestore} className="text-blue-600 hover:underline">
        Restaurar
      </button>
    </div>
  );
}
