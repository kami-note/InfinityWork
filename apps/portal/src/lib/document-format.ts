// 96px ≈ 1in, 48px ≈ 0.5in, 144px ≈ 1.5in at the 96dpi the page view uses.
export const MARGIN_PRESETS = { normal: 96, narrow: 48, wide: 144 } as const;
export type MarginPreset = keyof typeof MARGIN_PRESETS;

// Standard paper sizes at 96dpi. Every page in a document renders at
// exactly this size — that uniformity was the actual complaint (before
// this, there was only ever one page-sized box; "pages" past the first
// were just a gray band, not an equally-sized sheet).
export const PAGE_SIZES = {
  letter: { label: "Carta (Letter)", width: 816, height: 1056 },
  a4: { label: "A4", width: 794, height: 1123 },
  legal: { label: "Ofício (Legal)", width: 816, height: 1344 },
} as const;
export type PageSizeKey = keyof typeof PAGE_SIZES;

export interface SavedDocument {
  doc: unknown;
  margin: MarginPreset;
  pageSize: PageSizeKey;
}

/**
 * Documents created before margins/page size existed were saved as the
 * bare TipTap doc node. Detect that shape (a real doc node always has
 * `type: "doc"`) and default the rest instead of breaking on load.
 */
export function unwrapSavedContent(raw: unknown): SavedDocument {
  if (raw && typeof raw === "object" && "doc" in (raw as Record<string, unknown>)) {
    const candidate = raw as { doc: unknown; margin?: unknown; pageSize?: unknown };
    const margin = typeof candidate.margin === "string" && candidate.margin in MARGIN_PRESETS ? (candidate.margin as MarginPreset) : "normal";
    const pageSize = typeof candidate.pageSize === "string" && candidate.pageSize in PAGE_SIZES ? (candidate.pageSize as PageSizeKey) : "letter";
    return { doc: candidate.doc, margin, pageSize };
  }
  return { doc: raw, margin: "normal", pageSize: "letter" };
}
