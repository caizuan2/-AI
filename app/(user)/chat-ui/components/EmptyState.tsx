"use client";

import * as React from "react";
import { BotMessageSquare, Brain, ClipboardList, GitBranch, Target } from "lucide-react";
import type { ChatMode } from "../types";

interface EmptyStateProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function EmptyState({ mode, onModeChange }: EmptyStateProps) {
  void mode;
  void onModeChange;

  const capabilities = [
    {
      title: "RAG / 小董AI大脑🧠调用",
      description: "优先检索小董AI大脑🧠，再组织可落地回答。",
      icon: Brain
    },
    {
      title: "商业 6 段结构",
      description: "用户意图、业务分析、策略、动作、话术、下一步。",
      icon: ClipboardList
    },
    {
      title: "V8 / V9 Agent 面板",
      description: "识别成交机会，输出跟进策略和全局优化状态。",
      icon: GitBranch
    }
  ];

  return (
    <div className="flex min-h-[520px] flex-1 items-center justify-center px-4 py-8 text-center md:px-8">
      <div className="w-full max-w-5xl">
        <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-50 via-white to-violet-50 text-sky-600 shadow-sm ring-1 ring-sky-100">
          <BotMessageSquare className="h-11 w-11" aria-hidden="true" />
        </div>

        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-normal text-slate-950">
          Hi，我是你的业务问题处理助手
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
          把客户对话、微信截图或业务问题发给我，我会调用小董AI大脑🧠并结合 AI 思考，生成解决方案、回复话术和下一步建议。
        </p>

        <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2 text-sm font-semibold">
          {["客户对话", "微信截图", "业务问题", "回复话术", "下一步建议"].map((item) => (
            <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm">
              {item}
            </span>
          ))}
        </div>

        <div className="mt-8 grid gap-3 text-left md:grid-cols-3">
          {capabilities.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-900">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-950">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left text-sm leading-6 text-emerald-900">
          <div className="mb-1 inline-flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4" aria-hidden="true" />
            试试这样问
          </div>
          <p>客户说考虑考虑怎么回复？请基于小董AI大脑🧠给我一套能直接复制的回复话术，并给出下一步跟进动作。</p>
        </div>
      </div>
    </div>
  );
}
