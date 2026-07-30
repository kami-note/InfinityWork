import { Suspense } from "react";
import { requireAccessToken } from "@/lib/session";
import { getFile, listFolder } from "@/lib/file-manager-client";
import { Topbar } from "@/components/Topbar";
import { FileViewer } from "@/components/FileViewer";
import { FileViewShell } from "@/components/FileViewShell";

export default async function ViewPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();
  const file = await getFile(token, fileId);

  const isVideo = file.mimeType.startsWith("video/");
  const upNext = isVideo
    ? (await listFolder(token, file.folderId)).files.filter((f) => f.id !== file.id && f.mimeType.startsWith("video/"))
    : [];

  return (
    <div className="min-h-screen">
      <Suspense>
        <Topbar />
      </Suspense>
      <FileViewShell
        title={file.name}
        downloadUrl={`/api/files/${file.id}/download`}
        backHref={file.folderId ? `/drive?folderId=${file.folderId}` : "/drive"}
      >
        <FileViewer file={file} source={{ downloadUrl: `/api/files/${file.id}/download`, upNext }} />
      </FileViewShell>
    </div>
  );
}
