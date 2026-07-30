import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import type { ReactNode } from "react";
import { formatSize } from "@/lib/format";

/** Shared chrome for authenticated `/view` and public `/s` file viewing. */
export function FileViewShell({
  title,
  downloadUrl,
  backHref,
  backLabel = "Voltar",
  eyebrow,
  mimeType,
  size,
  children,
}: {
  title: string;
  downloadUrl: string;
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
  mimeType?: string;
  size?: string;
  children: ReactNode;
}) {
  const showMeta = Boolean(size && mimeType && !mimeType.startsWith("video/"));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-600 hover:underline dark:text-neutral-400"
            >
              <ArrowLeft size={16} />
              {backLabel}
            </Link>
          ) : eyebrow ? (
            <p className="shrink-0 text-sm text-neutral-500">{eyebrow}</p>
          ) : null}
          <h1 className="truncate text-sm font-medium sm:text-base">{title}</h1>
        </div>
        <a
          href={downloadUrl}
          className="flex items-center gap-2 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          <Download size={14} />
          Baixar
        </a>
      </div>

      {showMeta && (
        <p className="text-xs text-neutral-500">
          {formatSize(size!)} · {mimeType}
        </p>
      )}

      {children}
    </div>
  );
}
