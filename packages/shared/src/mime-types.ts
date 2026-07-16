/**
 * Custom mime type used to mark a file-manager File as an InfinityWork
 * document (edited by the docs module) rather than an opaque uploaded blob.
 * The portal uses this to decide whether clicking a file opens the editor
 * or just downloads it.
 */
export const DOCUMENT_MIME_TYPE = "application/vnd.infinitywork.document+json";
