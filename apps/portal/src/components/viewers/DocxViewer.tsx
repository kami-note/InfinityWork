"use client";

import { useEffect, useState } from "react";

export function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const arrayBuffer = await res.arrayBuffer();
        // Loaded dynamically: mammoth bundles a sizeable browser build and
        // most file types never touch it, so it shouldn't sit in the main
        // viewer bundle. Webpack swaps in mammoth's browser-safe internals
        // automatically via the package's "browser" field remap.
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <p className="text-sm text-red-600">Não foi possível pré-visualizar este documento.</p>;
  if (html === null) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <div
      className="docx-preview mx-auto max-h-[80vh] max-w-3xl overflow-auto rounded border border-neutral-200 bg-white p-8 text-black dark:border-neutral-800"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
