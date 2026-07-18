/**
 * Mirrors apps/portal/src/lib/document-format.ts — only the unwrap side is
 * needed here (export doesn't write documents, only reads them). Documents
 * created before margins existed were saved as the bare TipTap doc node;
 * detect that shape (a real doc node always has `type: "doc"`) instead of
 * assuming every stored document has the newer `{ doc, margin }` wrapper.
 */
export function unwrapSavedContent(raw: unknown): { doc: unknown } {
  if (raw && typeof raw === "object" && "doc" in (raw as Record<string, unknown>)) {
    return { doc: (raw as { doc: unknown }).doc };
  }
  return { doc: raw };
}
