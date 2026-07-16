"use client";

import { useEffect, useState } from "react";

export function TextViewer({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <p className="text-sm text-red-600">Não foi possível carregar o arquivo.</p>;
  if (content === null) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <pre className="max-h-[80vh] overflow-auto rounded border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <code>{content}</code>
    </pre>
  );
}
