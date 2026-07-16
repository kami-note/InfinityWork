export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TEXT_EXTENSION_PATTERN =
  /\.(md|markdown|json|ya?ml|csv|tsv|log|txt|conf|ini|env|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|xml|svg|sh|bash|py|rb|go|rs|java|c|cpp|h|hpp|sql|toml|prisma|dockerfile)$/i;

/**
 * Browsers/OSes often report generic mime types (or none) for code and
 * config files, so extension sniffing is the more reliable signal here —
 * mirrors what every desktop file manager actually does.
 */
export function isTextLike(mimeType: string, name: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (
    ["application/json", "application/javascript", "application/typescript", "application/xml", "application/x-yaml", "application/yaml"].includes(
      mimeType,
    )
  ) {
    return true;
  }
  return TEXT_EXTENSION_PATTERN.test(name);
}
