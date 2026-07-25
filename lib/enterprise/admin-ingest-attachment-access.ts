const ADMIN_INGEST_IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
]);

function readExtension(fileName: string | null | undefined) {
  const normalized = fileName?.trim().toLowerCase() ?? "";
  const separatorIndex = normalized.lastIndexOf(".");

  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : "";
}

function hasSupportedImageSignature(bytes: Uint8Array) {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return true;
  }

  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return true;
  }

  const header = new TextDecoder("ascii").decode(bytes.slice(0, 12));

  return header.startsWith("GIF87a")
    || header.startsWith("GIF89a")
    || (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP")
    || header.startsWith("BM");
}

export function isAdminIngestImageAttachment(input: {
  fileName?: string | null;
  mimeType?: string | null;
  bytes?: Uint8Array | null;
}) {
  if (input.bytes && input.bytes.length > 0) {
    return hasSupportedImageSignature(input.bytes);
  }

  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";

  return mimeType.startsWith("image/")
    || ADMIN_INGEST_IMAGE_EXTENSIONS.has(readExtension(input.fileName));
}
