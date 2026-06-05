import { sanitizeAnswer } from "@/lib/ai/rag-output";

function stripMarkdownSyntax(markdown: unknown) {
  return String(markdown ?? "")
    .replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/^\s*(\d+)[.)、）]\s*/gm, "$1. ");
}

export function markdownToPlainTextForCopy(markdown?: unknown): string {
  const cleaned = sanitizeAnswer(String(markdown ?? ""));
  const plain = stripMarkdownSyntax(cleaned)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      return ![
        "这次回答有帮助吗？",
        "有帮助",
        "没帮助",
        "复制",
        "复制话术",
        "已复制",
        "话术已复制",
        "复制失败",
        "复制失败，请手动复制",
        "调试信息"
      ].includes(trimmed) && !/^\d{1,2}:\d{2}$/.test(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return sanitizeAnswer(plain);
}

function collectQuoteBlockAfterLine(lines: string[], titleIndex: number) {
  const quoteLines: string[] = [];
  let index = titleIndex + 1;

  while (index < lines.length && !lines[index]?.trim()) {
    index += 1;
  }

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (/^\s*>\s?/.test(line)) {
      quoteLines.push(line.replace(/^\s*>\s?/, "").trim());
      index += 1;
      continue;
    }

    if (!line.trim() && quoteLines.length > 0 && lines.slice(index + 1).some((nextLine) => /^\s*>\s?/.test(nextLine ?? ""))) {
      quoteLines.push("");
      index += 1;
      continue;
    }

    break;
  }

  return quoteLines.join("\n").trim();
}

export function extractCustomerScript(markdown?: unknown): string | null {
  const cleaned = sanitizeAnswer(String(markdown ?? ""));
  const lines = cleaned.replace(/\r\n/g, "\n").split("\n");
  const titlePatterns = [
    /可以发给客户这样说/,
    /可以这样回复客户/,
    /可以这样回复/,
    /客户话术/,
    /给客户的话术/,
    /可复制话术/,
    /可直接复制给客户/
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!titlePatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    const quote = collectQuoteBlockAfterLine(lines, index);

    if (quote) {
      return markdownToPlainTextForCopy(quote);
    }
  }

  return null;
}

export async function copyText(text?: unknown): Promise<boolean> {
  const value = typeof text === "string" ? text : text === null || text === undefined ? "" : String(text);

  if (!value) {
    return false;
  }

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText &&
      (typeof window === "undefined" || window.isSecureContext)
    ) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    if (typeof document === "undefined") {
      return false;
    }

    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  } catch {
    return false;
  }
}
