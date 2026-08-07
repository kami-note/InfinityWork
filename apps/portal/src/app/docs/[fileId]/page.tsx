import { Suspense } from "react";
import dynamic from "next/dynamic";
import { requireAccessToken } from "@/lib/session";
import { getDocumentContent } from "@/lib/docs-client";
import { getFile } from "@/lib/file-manager-client";
import { Topbar } from "@/components/Topbar";

// Dynamically load the heavy TipTap-based editor on the client only.
const DocumentEditor = dynamic(() => import("@/components/DocumentEditor").then((m) => m.DocumentEditor), {
  ssr: false,
});

export default async function DocumentPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();
  const [{ content }, file] = await Promise.all([getDocumentContent(token, fileId), getFile(token, fileId)]);
  const readOnly = file.role !== "owner" && file.role !== "editor";

  return (
    <div className="flex h-screen flex-col">
      <Suspense>
        <Topbar />
      </Suspense>
      <div className="min-h-0 flex-1">
        <DocumentEditor
          fileId={fileId}
          initialContent={content}
          initialName={file.name}
          folderId={file.folderId}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
