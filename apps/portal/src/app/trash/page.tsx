import { Suspense } from "react";
import { requireAccessToken } from "@/lib/session";
import { listTrash } from "@/lib/file-manager-client";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { TrashItemRow } from "@/components/TrashItemRow";
import { EmptyTrashButton } from "@/components/EmptyTrashButton";

export default async function TrashPage() {
  const token = await requireAccessToken();
  const files = await listTrash(token);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1">
        <Suspense>
          <Topbar />
        </Suspense>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-neutral-600 dark:text-neutral-400">Lixeira</h2>
            {files.length > 0 && <EmptyTrashButton />}
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {files.map((file) => (
              <TrashItemRow key={file.id} file={file} />
            ))}
            {files.length === 0 && <p className="text-sm text-neutral-500">A lixeira está vazia.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
