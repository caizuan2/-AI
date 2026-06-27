"use client";

import * as React from "react";
import Image from "next/image";
import { Target } from "lucide-react";
import type { ChatMode } from "../types";

interface EmptyStateProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  userName?: string | null;
}

export function EmptyState({ mode, onModeChange, userName }: EmptyStateProps) {
  void mode;
  void onModeChange;

  const displayName = typeof userName === "string" ? userName.trim() : "";
  const greetingName = displayName && displayName !== "当前用户" ? displayName : "";
  const greeting = greetingName
    ? `Hi，${greetingName}，我是你的沟通助手`
    : "Hi，我是你的沟通助手";

  return (
    <div className="flex min-h-[520px] flex-1 items-center justify-center px-4 py-8 text-center md:px-8">
      <div className="w-full max-w-3xl">
        <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <Image
            src="/brand/xiaodong-ai-logo.png"
            alt="小董AI Logo"
            fill
            sizes="80px"
            className="object-cover"
            priority
          />
        </div>

        <div className="mt-4 text-center">
          <p className="text-xl font-bold tracking-normal text-slate-950">小董AI</p>
          <p className="mt-1 text-sm font-medium text-slate-500">AI大脑🧠 + AI思考</p>
        </div>

        <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-bold tracking-normal text-slate-950">
          {greeting}
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
          <span className="block">把客户对话、微信截图或经营疑问发给我，我会调用 AI大脑🧠 并结合 AI 思考。</span>
          <span className="block">为你整理可复制内容和下一步建议。</span>
        </p>

        <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2 text-sm font-semibold">
          {["客户对话", "微信截图", "经营疑问", "沟通建议", "下一步建议"].map((item) => (
            <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm">
              {item}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left text-sm leading-6 text-emerald-900">
          <div className="mb-1 inline-flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4" aria-hidden="true" />
            试试这样问
          </div>
          <p>客户说考虑考虑怎么回复？请基于小董AI大脑🧠给我一套能直接复制的回复内容，并给出下一步跟进动作。</p>
        </div>
      </div>
    </div>
  );
}
