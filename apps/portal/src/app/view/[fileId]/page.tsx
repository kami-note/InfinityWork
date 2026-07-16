import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireAccessToken } from "@/lib/session";
import { getFile } from "@/lib/file-manager-client";
import { Topbar } from "@/components/Topbar";
import { FileViewer } from "@/components/FileViewer";

export default async function ViewPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();
  const file = await getFile(token, fileId);

  return (
    <div className="min-h-screen">
      <Suspense>
        <Topbar />
      </Suspense>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={file.folderId ? `/drive?folderId=${file.folderId}` : "/drive"}
              className="flex items-center gap-1.5 text-sm text-neutral-600 hover:underline dark:text-neutral-400"
            >
              <ArrowLeft size={16} />
              Voltar
            </Link>
            <h1 className="truncate text-sm font-medium">{file.name}</h1>
          </div>
          <a
            href={`/api/files/${file.id}/download`}
            className="flex items-center gap-2 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <Download size={14} />
            Baixar
          </a>
        </div>

        <FileViewer file={file} />
      </div>
    </div>
  );
}
