"use client";

type AdminIngestClipboardWriter = {
  writeText: (value: string) => Promise<void>;
};

export type AdminIngestClipboardRuntime = {
  clipboard?: AdminIngestClipboardWriter | null;
  document?: Document | null;
};

function hasRuntimeValue(
  runtime: AdminIngestClipboardRuntime | undefined,
  key: keyof AdminIngestClipboardRuntime
) {
  return Boolean(runtime && Object.prototype.hasOwnProperty.call(runtime, key));
}

export async function copyAdminIngestText(
  value: string,
  runtime?: AdminIngestClipboardRuntime
) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  const clipboard = hasRuntimeValue(runtime, "clipboard")
    ? runtime?.clipboard
    : typeof navigator !== "undefined"
      ? navigator.clipboard
      : null;

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // HTTP deployments and some embedded shells reject the modern Clipboard API.
    }
  }

  const runtimeDocument = hasRuntimeValue(runtime, "document")
    ? runtime?.document
    : typeof document !== "undefined"
      ? document
      : null;

  if (!runtimeDocument?.body || typeof runtimeDocument.createElement !== "function") {
    return false;
  }

  const textArea = runtimeDocument.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "0";
  textArea.style.top = "0";
  textArea.style.width = "1px";
  textArea.style.height = "1px";
  textArea.style.opacity = "0.01";
  textArea.style.pointerEvents = "none";

  runtimeDocument.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    try {
      textArea.setSelectionRange(0, text.length);
    } catch {
      // Older embedded WebViews can copy the selection even without this API.
    }

    return typeof runtimeDocument.execCommand === "function"
      && runtimeDocument.execCommand("copy");
  } catch {
    return false;
  } finally {
    runtimeDocument.body.removeChild(textArea);
  }
}
