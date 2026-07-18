import { Suspense } from "react";
import { requireAccessToken } from "@/lib/session";
import { getDocumentContent } from "@/lib/docs-client";
import { getFile } from "@/lib/file-manager-client";
import { Topbar } from "@/components/Topbar";
import { DocumentEditor } from "@/components/DocumentEditor";

export default async function DocumentPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();
  const [{ content }, file] = await Promise.all([getDocumentContent(token, fileId), getFile(token, fileId)]);

  return (
    <div className="flex h-screen flex-col">
      <Suspense>
        <Topbar />
      </Suspense>
      <div className="min-h-0 flex-1">
        <DocumentEditor fileId={fileId} initialContent={content} initialName={file.name} folderId={file.folderId} />
      </div>
    </div>
  );
}
