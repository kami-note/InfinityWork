import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";

/**
 * Mirrors apps/portal/src/lib/tiptap-font-size.ts — the docx export runs
 * generateHTML with its own extension list (a separate package/runtime),
 * so it needs the same `fontSize` attribute definition or that mark would
 * silently render without its size. Only the rendering side is needed
 * here; the editing commands (setFontSize/unsetFontSize) live client-side.
 */
export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
});
