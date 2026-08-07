"use client";

import dynamic from "next/dynamic";

// TipTap is heavy; load it client-only so the docs route Server Component
// can still fetch content without bundling the editor into the RSC graph.
const DocumentEditor = dynamic(() => import("@/components/DocumentEditor").then((m) => m.DocumentEditor), {
  ssr: false,
});

export function DocumentEditorLazy(props: {
  fileId: string;
  initialContent: unknown;
  initialName: string;
  folderId: string | null;
  readOnly?: boolean;
}) {
  return <DocumentEditor {...props} />;
}
