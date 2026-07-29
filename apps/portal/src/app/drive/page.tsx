import { Suspense } from "react";
import { requireAccessToken } from "@/lib/session";
import { listFolder, searchFiles } from "@/lib/file-manager-client";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { DriveShell } from "@/components/DriveShell";
import { Breadcrumb } from "@/components/Breadcrumb";
import { UploadDropzone } from "@/components/UploadDropzone";
import { DriveGrid } from "@/components/DriveGrid";
import type { DriveItem } from "@/components/DriveItemTile";

export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string; q?: string }>;
}) {
  const { folderId, q } = await searchParams;
  const token = await requireAccessToken();

  if (q) {
    const results = await searchFiles(token, q);
    const items: DriveItem[] = results.map((file) => ({ kind: "file", ...file }));
    return (
      <DriveShell
        sidebar={<Sidebar />}
        topbar={
          <Suspense>
            <Topbar />
          </Suspense>
        }
      >
        <div className="space-y-4 p-4 sm:p-6">
          <h2 className="text-sm text-neutral-600 dark:text-neutral-400">
            Resultados para &quot;{q}&quot;
          </h2>
          <DriveGrid items={items} emptyLabel="Nenhum arquivo encontrado." />
        </div>
      </DriveShell>
    );
  }

  const contents = await listFolder(token, folderId ?? null);
  const items: DriveItem[] = [
    ...contents.folders.map((folder): DriveItem => ({ kind: "folder", id: folder.id, name: folder.name, updatedAt: folder.updatedAt })),
    ...contents.files.map((file): DriveItem => ({ kind: "file", ...file })),
  ];

  return (
    <DriveShell
      sidebar={<Sidebar parentId={folderId ?? null} />}
      topbar={
        <Suspense>
          <Topbar />
        </Suspense>
      }
    >
      <div className="space-y-4 p-4 sm:p-6">
        <Breadcrumb trail={contents.breadcrumb} />

        <UploadDropzone folderId={folderId ?? null} />

        <DriveGrid items={items} emptyLabel="Esta pasta está vazia." folderId={folderId ?? null} />
      </div>
    </DriveShell>
  );
}
