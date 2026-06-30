export type RuntimeCopyResult =
  | { ok: true; mode: "clipboard" | "selection"; message: string }
  | { ok: false; mode: "manual"; message: string };

export function runtimeCopyFallbackMessage(): RuntimeCopyResult {
  return {
    ok: false,
    mode: "manual",
    message: "当前环境不允许写入剪贴板，请手动选择复制。"
  };
}
