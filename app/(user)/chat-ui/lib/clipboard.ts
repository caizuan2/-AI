"use client";

interface SafeCopyTextOptions {
  selectionElement?: HTMLInputElement | HTMLTextAreaElement | null;
}

function tryCopySelectedElement(element: HTMLInputElement | HTMLTextAreaElement | null | undefined) {
  if (!element) {
    return false;
  }

  try {
    element.focus();
    element.select();
    element.setSelectionRange(0, element.value.length);
    return document.execCommand("copy");
  } catch (copyError) {
    console.warn("[chat-ui] selected element clipboard copy failed", copyError);
    return false;
  }
}

export async function safeCopyText(text: string, options: SafeCopyTextOptions = {}): Promise<boolean> {
  const value = text.trim();

  if (!value || typeof document === "undefined") {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (clipboardError) {
      console.warn("[chat-ui] navigator clipboard copy failed", clipboardError);
      // HTTP origins and strict browser permissions can reject the Clipboard API.
    }
  }

  if (tryCopySelectedElement(options.selectionElement)) {
    return true;
  }

  const textArea = document.createElement("textarea");

  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);
    return document.execCommand("copy");
  } catch (copyError) {
    console.warn("[chat-ui] textarea clipboard copy failed", copyError);
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}
