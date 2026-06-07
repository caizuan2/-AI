"use client";

import * as React from "react";
import { LogOut, KeyRound, RefreshCw } from "lucide-react";

interface ChatSettingsMenuProps {
  open: boolean;
  onLogout?: () => void;
  onChangePassword?: () => void;
  onSwitchAccount?: () => void;
}

const settings = [
  {
    label: "退出登录",
    icon: LogOut,
    action: "logout"
  },
  {
    label: "修改密码",
    icon: KeyRound,
    action: "change-password"
  },
  {
    label: "切换账号",
    icon: RefreshCw,
    action: "switch-account"
  }
] as const;

export function ChatSettingsMenu({
  open,
  onLogout,
  onChangePassword,
  onSwitchAccount
}: ChatSettingsMenuProps) {
  if (!open) {
    return null;
  }

  function handleAction(action: typeof settings[number]["action"]) {
    if (action === "logout") {
      onLogout?.();
    } else if (action === "change-password") {
      onChangePassword?.();
    } else {
      onSwitchAccount?.();
    }
  }

  return (
    <div className="absolute bottom-12 right-0 z-50 w-36 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
      {settings.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.label}
            type="button"
            onClick={() => handleAction(item.action)}
            className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
