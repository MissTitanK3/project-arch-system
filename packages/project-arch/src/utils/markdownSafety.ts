import { stripUnsafeControlChars } from "./outputSafety";

export function sanitizeFrontmatterString(value: string): string {
  const withoutControls = stripUnsafeControlChars(value, {
    allowNewlines: false,
    allowTabs: false,
  });
  return withoutControls.replace(/\s+/g, " ").trim();
}

export function sanitizeFrontmatterValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeFrontmatterString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeFrontmatterValue(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = sanitizeFrontmatterValue(nested);
    }
    return output;
  }

  return value;
}

export function escapeMarkdownText(value: string): string {
  const sanitized = stripUnsafeControlChars(value, {
    allowNewlines: false,
    allowTabs: false,
  }).trim();
  return sanitized.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

export function sanitizeMarkdownHeading(value: string): string {
  const stripped = stripUnsafeControlChars(value, {
    allowNewlines: false,
    allowTabs: false,
  })
    .replace(/^\s*#+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return escapeMarkdownText(stripped || "untitled");
}

export function escapeMarkdownTableCell(value: string): string {
  const sanitized = stripUnsafeControlChars(value, {
    allowNewlines: true,
    allowTabs: false,
  }).trim();
  return sanitized.replace(/\n/g, " <br> ").replace(/\|/g, "\\|").replace(/`/g, "\\`");
}

export function sanitizeMarkdownLinkText(value: string): string {
  return escapeMarkdownText(value);
}

export function sanitizeMarkdownLinkTarget(value: string): string {
  const stripped = stripUnsafeControlChars(value, {
    allowNewlines: false,
    allowTabs: false,
  }).trim();

  return encodeURI(stripped.replace(/\s+/g, " "));
}
