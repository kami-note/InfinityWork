import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

/**
 * A real Google-Docs-style automatic reflow (content dynamically flowing
 * across page boundaries as it's typed) is a much bigger project — TipTap
 * doesn't ship one either. This is the pragmatic version: a manual page
 * break the user inserts, rendered as a full-width gray band with shadowed
 * edges (see `[data-page-break]` in globals.css) that visually reads as
 * "page ends here, next one starts below" without splitting the document
 * into separate editor instances. Renders as `page-break-after: always` in
 * the exported HTML too, which html-to-docx (services/docs) turns into a
 * real Word page break — see services/docs/src/page-break-extension.ts.
 */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "true" })];
  },

  addCommands() {
    return {
      // Mirrors @tiptap/extension-horizontal-rule's setHorizontalRule:
      // inserting an atom node leaves it as a NodeSelection, and typing
      // right after insertion — the whole point of this button — would
      // replace the node instead of adding text, since ProseMirror's
      // default typing behavior overwrites a selected node. This moves the
      // selection to a text position after the break (adding a paragraph
      // there first if none exists) so typing continues normally.
      insertPageBreak:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({ type: this.name })
            .command(({ tr, dispatch }) => {
              if (dispatch) {
                const { $to } = tr.selection;
                const posAfter = $to.end();
                if ($to.nodeAfter) {
                  tr.setSelection(TextSelection.create(tr.doc, $to.pos));
                } else {
                  const node = $to.parent.type.contentMatch.defaultType?.create();
                  if (node) {
                    tr.insert(posAfter, node);
                    tr.setSelection(TextSelection.create(tr.doc, posAfter + 1));
                  }
                }
                tr.scrollIntoView();
              }
              return true;
            })
            .run();
        },
    };
  },
});
