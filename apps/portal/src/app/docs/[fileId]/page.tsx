import { Suspense } from "react";
import { requireAccessToken } from "@/lib/session";
import { getDocumentContent } from "@/lib/docs-client";
import { Topbar } from "@/components/Topbar";
import { DocumentEditor } from "@/components/DocumentEditor";

export default async function DocumentPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = await requireAccessToken();
  const { content } = await getDocumentContent(token, fileId);

  return (
    <div className="min-h-screen">
      <Suspense>
        <Topbar />
      </Suspense>
      <div className="p-6">
        <DocumentEditor fileId={fileId} initialContent={content} />
      </div>
    </div>
  );
}
