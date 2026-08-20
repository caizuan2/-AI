export type AdminIngestRequestPhase = "visible" | "continuation" | "metadata" | "health";

/**
 * Provider-neutral transport events.  This is intentionally a structural
 * superset of the existing Doubao progress contract so the route can forward
 * DeepSeek progress without coupling the DeepSeek client to Doubao internals.
 */
export type AdminIngestModelProgressEvent =
  | {
      type: "queue_wait";
      phase: AdminIngestRequestPhase;
      queueDepth: number;
    }
  | {
      type: "rate_limit_wait";
      phase: AdminIngestRequestPhase;
      retryAfterMs: number;
      attempt: number;
    }
  | {
      type: "reasoning_activity";
      phase: "visible" | "continuation";
      model?: string;
      responseId?: string;
      reasoningChars: number;
    }
  | {
      type: "visible_reply";
      replyMarkdown: string;
      model: string;
      responseId: string;
      metadataPending: true;
    }
  | {
      type: "visible_delta";
      delta: string;
      replyMarkdown: string;
      model?: string;
      responseId?: string;
    }
  | {
      type: "metadata_status";
      state: "pending" | "completed" | "deferred";
      failureCode?: string;
    };

type JsonStringToken = {
  value: string;
  end: number;
};

function readClosedJsonString(raw: string, start: number): JsonStringToken | null {
  if (raw[start] !== '"') {
    return null;
  }

  let escaped = false;

  for (let index = start + 1; index < raw.length; index += 1) {
    const character = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character !== '"') {
      continue;
    }

    try {
      return {
        value: JSON.parse(raw.slice(start, index + 1)) as string,
        end: index + 1
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Finds only a top-level replyMarkdown property.  A regex can accidentally
 * select a same-named field nested inside knowledgeDraft, which would expose
 * internal metadata when the provider output is incomplete.
 */
function findTopLevelReplyMarkdownValueStart(raw: string) {
  let depth = 0;
  let index = 0;

  while (index < raw.length) {
    const character = raw[index];

    if (character === '"') {
      const token = readClosedJsonString(raw, index);

      if (!token) {
        return -1;
      }

      if (depth === 1) {
        let cursor = token.end;

        while (/\s/.test(raw[cursor] ?? "")) {
          cursor += 1;
        }

        if (raw[cursor] === ":") {
          cursor += 1;

          while (/\s/.test(raw[cursor] ?? "")) {
            cursor += 1;
          }

          if (token.value === "replyMarkdown" && raw[cursor] === '"') {
            return cursor + 1;
          }
        }
      }

      index = token.end;
      continue;
    }

    if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }

    index += 1;
  }

  return -1;
}

function decodeJsonStringPrefix(raw: string, start: number) {
  let output = "";

  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === '"') {
      return output;
    }

    if (character !== "\\") {
      output += character;
      continue;
    }

    const escaped = raw[index + 1];

    if (!escaped) {
      break;
    }

    if (escaped === "u") {
      const code = raw.slice(index + 2, index + 6);

      if (!/^[0-9a-f]{4}$/i.test(code)) {
        break;
      }

      const codeUnit = Number.parseInt(code, 16);

      if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
        const lowEscape = raw.slice(index + 6, index + 12);

        if (!/^\\u[0-9a-f]{4}$/i.test(lowEscape)) {
          // Do not expose half of an emoji while a split surrogate pair is
          // still arriving. A closed or non-paired value is handled once the
          // following source characters make that fact unambiguous.
          if (raw.length < index + 12) {
            break;
          }

          output += String.fromCharCode(codeUnit);
          index += 5;
          continue;
        }

        output += String.fromCharCode(
          codeUnit,
          Number.parseInt(lowEscape.slice(2), 16)
        );
        index += 11;
        continue;
      }

      output += String.fromCharCode(codeUnit);
      index += 5;
      continue;
    }

    const decoded = ({
      '"': '"',
      "\\": "\\",
      "/": "/",
      "b": "\b",
      "f": "\f",
      "n": "\n",
      "r": "\r",
      "t": "\t"
    } as Record<string, string>)[escaped];

    if (decoded === undefined) {
      break;
    }

    output += decoded;
    index += 1;
  }

  return output;
}

export function extractStreamingReplyMarkdown(rawText: string) {
  const valueStart = findTopLevelReplyMarkdownValueStart(rawText);

  return valueStart >= 0
    ? decodeJsonStringPrefix(rawText, valueStart)
    : "";
}

/**
 * Reads replyMarkdown only from a complete top-level JSON object.  Unlike a
 * code-fence regex, the balanced scan is not confused when replyMarkdown
 * itself contains a fenced code block.  The complete-object requirement also
 * keeps a truncated structured response from being committed as final.
 */
export function extractCompleteAdminIngestReplyMarkdown(rawText: string) {
  const objectStart = rawText.indexOf("{");

  if (objectStart < 0) {
    return "";
  }

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = objectStart; index < rawText.length; index += 1) {
    const character = rawText[index];

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        insideString = false;
      }

      continue;
    }

    if (character === '"') {
      insideString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character !== "}") {
      continue;
    }

    depth -= 1;

    if (depth !== 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawText.slice(objectStart, index + 1)) as Record<string, unknown>;
      const replyMarkdown = parsed.replyMarkdown;

      return typeof replyMarkdown === "string" && replyMarkdown.trim()
        ? replyMarkdown
        : "";
    } catch {
      return "";
    }
  }

  return "";
}

export function looksLikeAdminIngestStructuredReply(rawText: string) {
  const trimmed = rawText.replace(/^\uFEFF/, "").trimStart();

  return trimmed.startsWith("{")
    || /^```json(?:\s|$)/i.test(trimmed)
    || (/"replyMarkdown"\s*:/.test(trimmed) && trimmed.includes("{"));
}

export function createAdminIngestReplyProjector() {
  let rawText = "";
  let visibleReplyMarkdown = "";

  return {
    push(rawDelta: string) {
      rawText += rawDelta;
      const nextReplyMarkdown = extractStreamingReplyMarkdown(rawText);

      if (!nextReplyMarkdown || nextReplyMarkdown === visibleReplyMarkdown) {
        return null;
      }

      if (!nextReplyMarkdown.startsWith(visibleReplyMarkdown)) {
        return null;
      }

      const delta = nextReplyMarkdown.slice(visibleReplyMarkdown.length);
      visibleReplyMarkdown = nextReplyMarkdown;

      return {
        delta,
        replyMarkdown: visibleReplyMarkdown
      };
    },
    current() {
      return visibleReplyMarkdown;
    }
  };
}
