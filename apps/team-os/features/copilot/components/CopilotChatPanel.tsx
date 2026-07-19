"use client";

import * as React from "react";
import { Bot, LoaderCircle, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CopilotClientError, sendCopilotChat } from "@/apps/team-os/features/copilot/services/copilot-client";
import type {
  CopilotAssistantRole,
  CopilotChatMessage
} from "@/apps/team-os/features/copilot/types";

const MAX_MESSAGE_LENGTH = 500;

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function CopilotChatPanel({
  assistantRole,
  companyId,
  suggestedQuestions
}: {
  assistantRole: CopilotAssistantRole;
  companyId: string;
  suggestedQuestions: string[];
}) {
  const [message, setMessage] = React.useState("");
  const [conversation, setConversation] = React.useState<CopilotChatMessage[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [provider, setProvider] = React.useState<string>();
  const [fallbackUsed, setFallbackUsed] = React.useState(false);
  const transcriptRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setConversation([]);
    setMessage("");
    setError(undefined);
    setProvider(undefined);
    setFallbackUsed(false);
  }, [assistantRole, companyId]);

  React.useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversation, sending]);

  const submit = React.useCallback(async (question?: string) => {
    const content = (question ?? message).trim();
    if (!content || sending || content.length > MAX_MESSAGE_LENGTH) return;

    setSending(true);
    setError(undefined);
    setConversation((current) => [
      ...current,
      { role: "user", content, createdAt: new Date().toISOString() }
    ]);
    setMessage("");

    try {
      const result = await sendCopilotChat({ assistantRole, companyId, message: content });
      setConversation(result.conversation);
      setProvider(result.provider);
      setFallbackUsed(result.fallbackUsed);
    } catch (caught) {
      setError(caught instanceof CopilotClientError
        ? caught.message
        : "AI 助手暂时无法回答，请稍后重试。");
    } finally {
      setSending(false);
    }
  }, [assistantRole, companyId, message, sending]);

  const remaining = MAX_MESSAGE_LENGTH - message.length;

  return (
    <Card className="overflow-hidden border-indigo-100 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 to-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              与企业助手对话
            </CardTitle>
            <CardDescription className="mt-1">基于当前授权范围内的运营数据回答，不会修改任务、客户或培训记录。</CardDescription>
          </div>
          <Badge variant="outline" className="bg-white">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            只读分析
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={transcriptRef}
          className="max-h-[30rem] min-h-72 space-y-5 overflow-y-auto bg-slate-50/40 p-4 sm:p-6"
          aria-live="polite"
          aria-label="AI 助手对话记录"
        >
          {conversation.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Bot className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold text-slate-900">从一个运营问题开始</p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">助手会依据你的角色和当前企业范围给出总结、风险提示与下一步建议。</p>
              {suggestedQuestions.length > 0 ? (
                <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedQuestions.slice(0, 4).map((question) => (
                    <Button key={question} variant="outline" size="sm" disabled={sending} onClick={() => void submit(question)}>
                      {question}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : conversation.map((item, index) => {
            const isUser = item.role === "user";
            return (
              <article key={`${item.createdAt}-${index}`} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-white">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
                <div className={`min-w-0 max-w-[88%] sm:max-w-[78%] ${isUser ? "text-right" : "text-left"}`}>
                  <div className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 shadow-sm [overflow-wrap:anywhere] ${isUser ? "rounded-tr-md bg-slate-900 text-white" : "rounded-tl-md border border-slate-200 bg-white text-slate-700"}`}>
                    <p className="whitespace-pre-wrap">{item.content}</p>
                  </div>
                  <p className="mt-1 px-1 text-[11px] text-slate-400">{isUser ? "我" : "AI 助手"} · {formatMessageTime(item.createdAt)}</p>
                </div>
                {isUser ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
              </article>
            );
          })}

          {sending ? (
            <div className="flex items-center gap-3 text-sm text-slate-500" role="status">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-white"><Bot className="h-4 w-4" aria-hidden="true" /></span>
              <span className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                正在分析授权数据…
              </span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-white p-4 sm:p-5">
          {error ? <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p> : null}
          {provider ? (
            <p className="mb-3 text-xs text-slate-400">
              {provider === "rules"
                ? "本轮由规则引擎安全兜底生成，未调用外部模型。"
                : `本轮由 ${provider}${fallbackUsed ? "（备用模型）" : ""} 生成。`}
            </p>
          ) : null}
          <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <label htmlFor="copilot-message" className="sr-only">输入给 AI 助手的问题</label>
            <Textarea
              id="copilot-message"
              value={message}
              rows={3}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={sending}
              placeholder="例如：我今天最需要优先处理什么？"
              className="min-h-24 resize-y"
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-xs ${remaining < 50 ? "text-amber-600" : "text-slate-400"}`}>Enter 发送，Shift + Enter 换行 · 还可输入 {remaining} 字</p>
              <Button type="submit" disabled={sending || message.trim().length === 0}>
                {sending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {sending ? "分析中" : "发送问题"}
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
