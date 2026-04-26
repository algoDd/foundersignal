export function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**")
    .replace(/__\s+([^_]+?)\s+__/g, "__$1__")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripMarkdown(markdown: string) {
  return normalizeMarkdown(markdown)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#~]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractMarkdownSection(markdown: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizeMarkdown(markdown).match(
    new RegExp(`## ${escapedHeading}[\\s\\S]*?(?=\\n## |$)`, "i"),
  );
  if (!match) return "";
  return match[0].replace(new RegExp(`^## ${escapedHeading}\\n?`, "i"), "").trim();
}

export function extractBulletLines(markdown: string, limit = 4) {
  return normalizeMarkdown(markdown)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => stripMarkdown(line.slice(2).trim()))
    .filter(Boolean)
    .slice(0, limit);
}

export function extractParagraphs(markdown: string, limit = 2) {
  return normalizeMarkdown(markdown)
    .split("\n\n")
    .map((chunk) => stripMarkdown(chunk.replace(/^#+\s+/gm, "").trim()))
    .filter(Boolean)
    .filter((chunk) => !chunk.startsWith("- ") && !chunk.startsWith("* "))
    .slice(0, limit);
}
