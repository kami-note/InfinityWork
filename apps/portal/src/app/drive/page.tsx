import { Suspense } from "react";
import { requireAccessToken } from "@/lib/session";
import { listFolder, searchFiles } from "@/lib/file-manager-client";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Breadcrumb } from "@/components/Breadcrumb";
import { NewFolderButton } from "@/components/NewFolderButton";
import { NewDocumentButton } from "@/components/NewDocumentButton";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ItemCard } from "@/components/ItemCard";

export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string; q?: string }>;
}) {
  const { folderId, q } = await searchParams;
  const token = await requireAccessToken();

  if (q) {
    const results = await searchFiles(token, q);
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1">
          <Suspense>
            <Topbar />
          </Suspense>
          <div className="p-6">
            <h2 className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
              Resultados para &quot;{q}&quot;
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {results.map((file) => (
                <ItemCard key={file.id} item={{ kind: "file", ...file }} />
              ))}
              {results.length === 0 && <p className="text-sm text-neutral-500">Nenhum arquivo encontrado.</p>}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const contents = await listFolder(token, folderId ?? null);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1">
        <Suspense>
          <Topbar />
        </Suspense>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <Breadcrumb trail={contents.breadcrumb} />
            <div className="flex items-center gap-2">
              <NewDocumentButton parentId={folderId ?? null} />
              <NewFolderButton parentId={folderId ?? null} />
            </div>
          </div>

          <UploadDropzone folderId={folderId ?? null} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {contents.folders.map((folder) => (
              <ItemCard key={folder.id} item={{ kind: "folder", id: folder.id, name: folder.name }} />
            ))}
            {contents.files.map((file) => (
              <ItemCard key={file.id} item={{ kind: "file", ...file }} />
            ))}
          </div>
          {contents.folders.length === 0 && contents.files.length === 0 && (
            <p className="text-sm text-neutral-500">Esta pasta está vazia.</p>
          )}
        </div>
      </main>
    </div>
  );
}
