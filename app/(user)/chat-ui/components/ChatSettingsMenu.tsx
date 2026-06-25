"use client";

import * as React from "react";
import { ImagePlus, KeyRound, LogOut, PencilLine, RefreshCw, UserCircle } from "lucide-react";
import type { ChangePasswordInput } from "../types";

interface ChatSettingsMenuProps {
  open: boolean;
  userName?: string;
  userAccount?: string;
  onOpenAvatar?: () => void;
  onLogout?: () => void;
  onChangeName?: (name: string) => Promise<void> | void;
  onChangePassword?: (input: ChangePasswordInput) => Promise<void> | void;
  onSwitchAccount?: () => void;
}

export function SwitchAccountConfirmDialog({
  open,
  account,
  onCancel,
  onConfirm
}: {
  open: boolean;
  account: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-account-title"
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h2 id="switch-account-title" className="text-lg font-bold text-slate-950">切换账号</h2>
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">当前账号：{account || "当前用户"}</p>
          <p className="mt-2 leading-6 text-slate-500">切换账号会回到登录页，但不会清除本地历史展示。</p>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            className="focus-ring h-11 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            使用其他账号登录
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring h-11 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeNameDialog({
  open,
  defaultName,
  saving,
  error,
  onCancel,
  onSubmit
}: {
  open: boolean;
  defaultName: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = React.useState(defaultName);

  React.useEffect(() => {
    if (open) {
      setValue(defaultName);
    }
  }, [defaultName, open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open, saving]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onCancel();
        }
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-name-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h2 id="change-name-title" className="text-lg font-bold text-slate-950">修改名称</h2>
        <label className="mt-4 block">
          <span className="text-xs font-semibold text-slate-500">新的显示名称</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            autoComplete="name"
            maxLength={20}
            autoFocus
          />
        </label>
        <p className="mt-2 text-xs text-slate-400">名称长度需为 2 到 20 个字符。</p>
        {error ? (
          <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={saving}
            className="focus-ring h-11 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "保存中..." : "确定"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="focus-ring h-11 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

export function ChatSettingsMenu({
  open,
  userName = "当前用户",
  userAccount = "",
  onOpenAvatar,
  onLogout,
  onChangeName,
  onChangePassword,
  onSwitchAccount
}: ChatSettingsMenuProps) {
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [nameDialogOpen, setNameDialogOpen] = React.useState(false);
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [switchAccountOpen, setSwitchAccountOpen] = React.useState(false);

  if (!open) {
    return null;
  }

  async function handleNameSubmit(input: string) {
    const nextName = input.trim();
    const nameLength = Array.from(nextName).length;

    setNameError(null);
    setMessage(null);

    if (!nextName) {
      setNameError("名称不能为空。");
      return;
    }

    if (nameLength < 2 || nameLength > 20) {
      setNameError("名称长度需要在 2 到 20 个字符之间。");
      return;
    }

    if (!onChangeName) {
      setNameError("修改名称能力未接入。");
      return;
    }

    setNameSaving(true);

    try {
      await onChangeName(nextName);
      setNameDialogOpen(false);
      setMessage("名称已修改。");
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "修改名称失败，请稍后重试。");
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage("当前密码、新密码和确认密码不能为空。");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("新密码至少需要 6 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("两次输入的新密码不一致。");
      return;
    }

    setSaving(true);

    try {
      await onChangePassword?.({
        currentPassword,
        newPassword,
        confirmPassword
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOpen(false);
      setMessage("密码已修改。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改密码失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute bottom-12 right-0 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="rounded-xl bg-slate-50 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <UserCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
          账号信息
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
          {userAccount ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{userAccount}</p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">当前用户</p>
          )}
        </div>
      </div>

      {message ? (
        <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {message}
        </div>
      ) : null}

      <div className="mt-2 space-y-1">
        <button
          type="button"
          onClick={onOpenAvatar}
          className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <ImagePlus className="h-4 w-4 text-slate-500" aria-hidden="true" />
          修改头像
        </button>
        <button
          type="button"
          onClick={() => {
            setPasswordOpen(false);
            setNameError(null);
            setMessage(null);
            setNameDialogOpen(true);
          }}
          className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <PencilLine className="h-4 w-4 text-slate-500" aria-hidden="true" />
          修改名称
        </button>
        <button
          type="button"
          onClick={() => {
            setPasswordOpen((value) => !value);
            setMessage(null);
          }}
          className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
          aria-expanded={passwordOpen}
        >
          <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
          修改密码
        </button>

        {passwordOpen ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-2 rounded-xl bg-slate-50 p-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">当前密码</span>
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                autoComplete="current-password"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">新密码</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">确认新密码</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                autoComplete="new-password"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="focus-ring h-10 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存新密码"}
            </button>
          </form>
        ) : null}

        <button
          type="button"
          onClick={() => setSwitchAccountOpen(true)}
          className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4 text-slate-500" aria-hidden="true" />
          切换账号
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          退出登录
        </button>
      </div>
      <SwitchAccountConfirmDialog
        open={switchAccountOpen}
        account={userAccount || userName}
        onCancel={() => setSwitchAccountOpen(false)}
        onConfirm={() => {
          setSwitchAccountOpen(false);
          onSwitchAccount?.();
        }}
      />
      <ChangeNameDialog
        open={nameDialogOpen}
        defaultName={userName}
        saving={nameSaving}
        error={nameError}
        onCancel={() => {
          if (!nameSaving) {
            setNameDialogOpen(false);
            setNameError(null);
          }
        }}
        onSubmit={handleNameSubmit}
      />
    </div>
  );
}
