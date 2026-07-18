import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Mutable box (not a React ref) so the plugin — created once — can read
 * live page metrics that change whenever the user picks a different
 * margin/page-size preset, without recreating the whole editor/plugin.
 *
 * `breakHeight` is NOT just the visual gap between sheets: a break has to
 * close out the bottom margin of the page it's ending, show the gap, *and*
 * open the top margin of the next page — otherwise content after the break
 * lands `2 * margin` short of where the next background page sheet's
 * content area actually starts. See DocumentEditor.tsx's recomputeMetrics.
 */
export interface PageMetricsRef {
  contentHeight: number; // usable content height per page (pageHeight - 2*margin)
  breakHeight: number; // gap + 2*margin
  onPageCount?: (count: number) => void;
}

const paginationKey = new PluginKey<DecorationSet>("autoPagination");

function buildDecorations(view: EditorView, metrics: PageMetricsRef): { decorations: DecorationSet; pageCount: number } {
  const pageContentHeight = metrics.contentHeight;
  if (!pageContentHeight || pageContentHeight <= 0) {
    return { decorations: DecorationSet.empty, pageCount: 1 };
  }

  const decorations: Decoration[] = [];
  let cumulative = 0;
  let pageCount = 1;

  view.state.doc.forEach((node, offset) => {
    // A manual break also ends the current page outright, and counts
    // toward the page total the same as an automatically-inserted one.
    if (node.type.name === "pageBreak") {
      cumulative = 0;
      pageCount += 1;
      return;
    }
    const dom = view.nodeDOM(offset);
    const height = dom instanceof HTMLElement ? dom.offsetHeight : 0;
    if (height === 0) return;

    if (cumulative > 0 && cumulative + height > pageContentHeight) {
      decorations.push(
        Decoration.widget(
          offset,
          () => {
            // Transparent spacer, not a visible band — the stacked
            // background page sheets (rendered in DocumentEditor.tsx) are
            // what shows "this page ends here" now; this just needs to
            // occupy the right amount of vertical space for the next
            // content to land inside the next sheet's content area.
            const el = document.createElement("div");
            el.setAttribute("data-page-break", "true");
            el.setAttribute("data-auto", "true");
            el.setAttribute("contenteditable", "false");
            el.style.height = `${metrics.breakHeight}px`;
            return el;
          },
          { side: -1, key: `auto-break-${offset}` },
        ),
      );
      cumulative = 0;
      pageCount += 1;
    }
    cumulative += height;
  });

  return { decorations: DecorationSet.create(view.state.doc, decorations), pageCount };
}

function sameBreakPositions(a: DecorationSet, b: DecorationSet): boolean {
  const aFound = a.find();
  const bFound = b.find();
  if (aFound.length !== bFound.length) return false;
  return aFound.every((d, i) => d.from === bFound[i].from);
}

/**
 * Measures rendered block heights and inserts spacer widgets wherever
 * content crosses a page boundary, and reports how many pages that adds up
 * to (via `metrics.onPageCount`) so the background page sheets can be kept
 * in sync. Deliberately NOT real reflow pagination (the document itself
 * doesn't change, no content is split across separate editable regions) —
 * see the comment in tiptap-page-break.ts for why that's out of scope.
 * Recomputes are debounced and skip re-dispatching when nothing actually
 * changed, specifically to avoid a dispatch-triggers-update-triggers-
 * dispatch loop.
 */
export function createPaginationExtension(metrics: PageMetricsRef) {
  return Extension.create({
    name: "autoPagination",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: paginationKey,
          state: {
            init: () => DecorationSet.empty,
            apply(tr, old) {
              const next = tr.getMeta(paginationKey) as DecorationSet | undefined;
              if (next) return next;
              return old.map(tr.mapping, tr.doc);
            },
          },
          props: {
            decorations(state) {
              return paginationKey.getState(state);
            },
          },
          view(view) {
            let timer: ReturnType<typeof setTimeout> | null = null;
            function schedule() {
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                const { decorations: next, pageCount } = buildDecorations(view, metrics);
                metrics.onPageCount?.(pageCount);
                const current = paginationKey.getState(view.state) ?? DecorationSet.empty;
                if (!sameBreakPositions(current, next)) {
                  view.dispatch(view.state.tr.setMeta(paginationKey, next));
                }
              }, 150);
            }
            schedule();
            return {
              update: () => schedule(),
              destroy: () => {
                if (timer) clearTimeout(timer);
              },
            };
          },
        }),
      ];
    },
  });
}
