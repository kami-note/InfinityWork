import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Mirrors apps/portal/src/lib/tiptap-page-break.ts — only the rendering
 * side is needed here (export doesn't run editor commands). Adds an inline
 * `page-break-after: always` style, which html-to-docx converts into a
 * real Word page break.
 */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-page-break": "true", style: "page-break-after: always" }),
    ];
  },
});
