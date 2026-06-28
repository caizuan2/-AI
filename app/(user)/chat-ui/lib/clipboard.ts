"use client";

interface SafeCopyTextOptions {
  selectTarget?: HTMLInputElement | HTMLTextAreaElement | null;
  selectionElement?: HTMLInputElement | HTMLTextAreaElement | null;
  preferManualSelection?: boolean;
}

export interface SafeCopyTextResult {
  ok: boolean;
  copied: boolean;
  selected: boolean;
  method: "clipboard" | "execCommand" | "manual-selection" | "failed";
  message: string;
  error?: string;
}

function getManualSelectionMessage() {
  if (typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))) {
    return "已选中内容，请长按复制";
  }

  return "已选中内容，请按 Ctrl+C 复制";
}

function getCopyErrorMessage(error: unknown) {
  return error instanceof Error ? error.name || error.message : String(error ?? "");
}

function canUseClipboardApi() {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  return Boolean(window.isSecureContext || isLocalHost);
}

function trySelectElement(element: HTMLInputElement | HTMLTextAreaElement | null | undefined, value?: string) {
  if (!element) {
    return false;
  }

  try {
    if (typeof value === "string") {
      element.value = value;
    }

    element.focus();
    element.select();
    element.setSelectionRange(0, element.value.length);
    return true;
  } catch (selectionError) {
    console.warn("[chat-ui] selected element clipboard selection failed", selectionError);
    return false;
  }
}

function tryExecCopy() {
  try {
    return document.execCommand("copy");
  } catch (copyError) {
    console.warn("[chat-ui] execCommand clipboard copy failed", copyError);
    return false;
  }
}

function getFallbackTextarea() {
  const existing = document.querySelector<HTMLTextAreaElement>("[data-chat-copy-fallback='true']");

  if (existing) {
    return existing;
  }

  const textArea = document.createElement("textarea");

  textArea.setAttribute("readonly", "true");
  textArea.setAttribute("data-chat-copy-fallback", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "0";
  textArea.style.top = "0";
  textArea.style.width = "1px";
  textArea.style.height = "1px";
  textArea.style.opacity = "0";
  textArea.style.zIndex = "-1";
  document.body.appendChild(textArea);

  return textArea;
}

export async function safeCopyTextDetailed(text: string, options: SafeCopyTextOptions = {}): Promise<SafeCopyTextResult> {
  const value = text.trim();
  let lastError = "";

  if (!value || typeof document === "undefined") {
    return {
      ok: false,
      copied: false,
      selected: false,
      method: "failed",
      message: "请手动复制选中的内容"
    };
  }

  if (!options.preferManualSelection && canUseClipboardApi()) {
    try {
      await navigator.clipboard.writeText(value);
      return {
        ok: true,
        copied: true,
        selected: false,
        method: "clipboard",
        message: "已复制"
      };
    } catch (clipboardError) {
      lastError = getCopyErrorMessage(clipboardError);
      console.warn("[chat-ui] navigator clipboard copy failed", clipboardError);
      // HTTP origins and strict browser permissions can reject the Clipboard API.
    }
  }

  const textArea = getFallbackTextarea();

  textArea.value = value;

  try {
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    const copied = tryExecCopy();

    if (copied) {
      window.setTimeout(() => {
        textArea.remove();
      }, 0);

      return {
        ok: true,
        copied: true,
        selected: false,
        method: "execCommand",
        message: "已复制"
      };
    }
  } catch (selectionError) {
    lastError = getCopyErrorMessage(selectionError);
    console.warn("[chat-ui] textarea clipboard selection failed", selectionError);
  }

  window.setTimeout(() => {
    textArea.remove();
  }, 0);

  const manualTarget = options.selectTarget ?? options.selectionElement;

  if (trySelectElement(manualTarget, value)) {
    return {
      ok: true,
      copied: false,
      selected: true,
      method: "manual-selection",
      message: getManualSelectionMessage(),
      error: lastError || undefined
    };
  }

  const fallbackTarget = getFallbackTextarea();

  fallbackTarget.value = value;

  if (trySelectElement(fallbackTarget)) {
    window.setTimeout(() => {
      fallbackTarget.remove();
    }, 20000);

    return {
      ok: true,
      copied: false,
      selected: true,
      method: "manual-selection",
      message: getManualSelectionMessage(),
      error: lastError || undefined
    };
  }

  return {
    ok: false,
    copied: false,
    selected: false,
    method: "failed",
    message: "请手动复制选中的内容",
    error: lastError || undefined
  };
}

export async function safeCopyText(text: string, options: SafeCopyTextOptions = {}): Promise<boolean> {
  const result = await safeCopyTextDetailed(text, options);

  return result.copied || result.selected;
}
