"use client";

import * as React from "react";
import { MoreHorizontal, RefreshCw, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

function useDialogClose(open: boolean, onClose: () => void, onEscape?: () => boolean | void) {
  React.useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (onEscape?.() === false) {
          return;
        }

        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onEscape, open]);
}

function DialogFrame({
  open,
  title,
  children,
  onClose,
  onEscape,
  maxWidthClassName = "max-w-lg"
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onEscape?: () => boolean | void;
  maxWidthClassName?: string;
}) {
  useDialogClose(open, onClose, onEscape);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 py-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-action-dialog-title"
        className={cn(
          "w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6",
          maxWidthClassName
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="conversation-action-dialog-title" className="text-xl font-bold text-slate-950">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring -mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            aria-label="关闭弹窗"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function LinkActionDialog({
  open,
  title,
  link,
  description,
  copyLabel = "复制链接",
  selectSignal = 0,
  actionMenu,
  busy = false,
  message = null,
  error = null,
  onClose,
  onCopy
}: {
  open: boolean;
  title: string;
  link: string;
  description: string;
  copyLabel?: string;
  selectSignal?: number;
  actionMenu?: {
    onReset: () => void;
    onDelete: () => void;
  };
  busy?: boolean;
  message?: string | null;
  error?: string | null;
  onClose: () => void;
  onCopy: (selectionElement?: HTMLInputElement | null) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const menuRootRef = React.useRef<HTMLDivElement | null>(null);
  const pointerCopyTriggeredRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      setMenuOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || selectSignal <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, selectSignal]);

  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Node && menuRootRef.current && !menuRootRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  function handleEscape() {
    if (menuOpen) {
      setMenuOpen(false);
      return false;
    }

    return true;
  }

  function handleReset() {
    setMenuOpen(false);
    actionMenu?.onReset();
  }

  function handleDelete() {
    setMenuOpen(false);
    actionMenu?.onDelete();
  }

  return (
    <DialogFrame open={open} title={title} onClose={onClose} onEscape={handleEscape}>
      <div className="mt-5">
        <label className="block">
          <span className="sr-only">{title}</span>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={link}
              readOnly
              className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
              onFocus={(event) => event.currentTarget.select()}
            />
            {actionMenu ? (
              <div ref={menuRootRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  disabled={busy}
                  className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="群组链接更多操作"
                  aria-expanded={menuOpen}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 top-14 z-[90] w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 shadow-2xl">
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      重置链接
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      删除链接
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </label>
        {error ? (
          <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {message}
          </p>
        ) : null}
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="focus-ring h-11 rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
              pointerCopyTriggeredRef.current = true;
              onCopy(inputRef.current);
            }}
            onClick={() => {
              if (pointerCopyTriggeredRef.current) {
                pointerCopyTriggeredRef.current = false;
                return;
              }

              onCopy(inputRef.current);
            }}
            disabled={busy}
            className="focus-ring h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "处理中..." : copyLabel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}

export function RenameConversationDialog({
  open,
  title,
  initialTitle,
  submitting = false,
  error,
  onClose,
  onSubmit
}: {
  open: boolean;
  title: string;
  initialTitle: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (nextTitle: string) => void;
}) {
  const [draftTitle, setDraftTitle] = React.useState(initialTitle);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraftTitle(initialTitle);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [initialTitle, open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draftTitle.trim());
  }

  return (
    <DialogFrame open={open} title={title} onClose={submitting ? () => undefined : onClose} maxWidthClassName="max-w-md">
      <form onSubmit={handleSubmit} className="mt-5">
        <label className="block">
          <span className="text-sm font-semibold text-slate-600">会话标题</span>
          <input
            ref={inputRef}
            value={draftTitle}
            maxLength={60}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="请输入新的会话标题"
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="focus-ring h-11 rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="focus-ring h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "保存中..." : "确定"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  danger = false,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFrame open={open} title={title} onClose={onClose} maxWidthClassName="max-w-md">
      <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
        {description}
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring h-11 rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "focus-ring h-11 rounded-2xl px-5 text-sm font-semibold text-white",
            danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-950 hover:bg-slate-800"
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogFrame>
  );
}
