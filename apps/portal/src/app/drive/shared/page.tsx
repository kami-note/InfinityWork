import { Suspense } from "react";
import Link from "next/link";
import { requireAccessToken } from "@/lib/session";
import { listSharedWithMe } from "@/lib/file-manager-client";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { DriveShell } from "@/components/DriveShell";
import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";

export default async function SharedWithMePage() {
  const token = await requireAccessToken();
  const shared = await listSharedWithMe(token);

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
        <h2 className="text-sm text-neutral-600 dark:text-neutral-400">Compartilhados comigo</h2>

        {shared.folders.length === 0 && shared.files.length === 0 ? (
          <p className="text-sm text-neutral-500">Nada compartilhado com você ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {shared.folders.map((folder) => (
              <li key={folder.id}>
                <Link href={`/drive?folderId=${folder.id}`} className="flex items-center justify-between gap-3 py-3 hover:underline">
                  <span className="truncate font-medium">{folder.name}/</span>
                  <span className="shrink-0 text-xs text-neutral-500">{folder.role}</span>
                </Link>
              </li>
            ))}
            {shared.files.map((file) => {
              const href =
                file.mimeType === DOCUMENT_MIME_TYPE ? `/docs/${file.id}` : `/view/${file.id}`;
              return (
                <li key={file.id}>
                  <Link href={href} className="flex items-center justify-between gap-3 py-3 hover:underline">
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{file.role}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DriveShell>
  );
}
