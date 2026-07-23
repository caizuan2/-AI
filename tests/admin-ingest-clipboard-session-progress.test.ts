import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  copyAdminIngestText
} from "../lib/enterprise/admin-ingest-clipboard";
import {
  createEmptyConversationState,
  isIngestConversationRequestActive,
  markRequestActive,
  markRequestCompleted
} from "../lib/enterprise/ingest-conversation-state";

async function main() {
  const directWrites: string[] = [];
  const directResult = await copyAdminIngestText(" http://example.test/ingest-share/token ", {
    clipboard: {
      async writeText(value) {
        directWrites.push(value);
      }
    },
    document: null
  });

  assert.equal(directResult, true);
  assert.deepEqual(directWrites, ["http://example.test/ingest-share/token"]);

  const appended: unknown[] = [];
  const removed: unknown[] = [];
  const fallbackSelections: Array<[number, number]> = [];
  let copiedByFallback = false;
  const fallbackTextArea = {
    value: "",
    style: {} as CSSStyleDeclaration,
    setAttribute() {},
    focus() {},
    select() {},
    setSelectionRange(start: number, end: number) {
      fallbackSelections.push([start, end]);
    }
  };
  const fallbackDocument = {
    body: {
      appendChild(node: unknown) {
        appended.push(node);
      },
      removeChild(node: unknown) {
        removed.push(node);
      }
    },
    createElement(tag: string) {
      assert.equal(tag, "textarea");
      return fallbackTextArea;
    },
    execCommand(command: string) {
      assert.equal(command, "copy");
      copiedByFallback = true;
      return true;
    }
  } as unknown as Document;
  const fallbackResult = await copyAdminIngestText("http://47.238.0.23/ingest-group/token", {
    clipboard: {
      async writeText() {
        throw new Error("Clipboard API requires a secure context");
      }
    },
    document: fallbackDocument
  });

  assert.equal(fallbackResult, true);
  assert.equal(copiedByFallback, true);
  assert.equal(fallbackTextArea.value, "http://47.238.0.23/ingest-group/token");
  assert.deepEqual(fallbackSelections, [[0, fallbackTextArea.value.length]]);
  assert.deepEqual(appended, [fallbackTextArea]);
  assert.deepEqual(removed, [fallbackTextArea]);

  assert.equal(await copyAdminIngestText("", {
    clipboard: null,
    document: null
  }), false);

  const idleConversation = createEmptyConversationState({
    conversationId: "conversation-idle"
  });
  const generatingConversation = markRequestActive(
    createEmptyConversationState({ conversationId: "conversation-generating" }),
    "request-1"
  );

  assert.equal(isIngestConversationRequestActive(idleConversation), false);
  assert.equal(isIngestConversationRequestActive(generatingConversation), true);
  assert.equal(
    isIngestConversationRequestActive(markRequestCompleted(generatingConversation, "request-1")),
    false
  );

  const shellSource = await readFile(
    "components/enterprise-admin/IngestChatGPTShell.tsx",
    "utf8"
  );
  const modeToggleSource = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const linkDialogSource = await readFile(
    "components/enterprise-admin/IngestConversationLinkDialog.tsx",
    "utf8"
  );

  assert.match(shellSource, /showParsingProgress \? \(/);
  assert.match(
    modeToggleSource,
    /showParsingProgress:\s*isParsing\s*&&\s*isIngestConversationRequestActive/
  );
  assert.match(
    modeToggleSource,
    /conversationStateByIdRef\.current\[activeConversationId\]/
  );
  assert.match(linkDialogSource, /copyAdminIngestText/);
  assert.doesNotMatch(linkDialogSource, /navigator\.clipboard\.writeText/);

  console.log("Admin ingest clipboard and session progress tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
