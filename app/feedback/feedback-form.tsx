"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Bug, Lightbulb, Loader2, MessageSquareWarning, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { unwrapApiResponse } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type FeedbackType = "ISSUE" | "SUGGESTION" | "BUG";

type FeedbackFormProps = {
  backHref: string;
  user: {
    email: string;
    name: string;
  };
};

const typeOptions: Array<{
  value: FeedbackType;
  label: string;
  description: string;
  icon: typeof MessageSquareWarning;
}> = [
  {
    value: "ISSUE",
    label: "问题",
    description: "流程、体验或结果不符合预期。",
    icon: MessageSquareWarning
  },
  {
    value: "SUGGESTION",
    label: "建议",
    description: "希望增加或改进的功能。",
    icon: Lightbulb
  },
  {
    value: "BUG",
    label: "Bug",
    description: "页面、接口或数据出现明显错误。",
    icon: Bug
  }
];

export function FeedbackForm({ backHref, user }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>("ISSUE");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      setError("请填写反馈内容。");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          content: normalizedContent,
          metadata: {
            submittedFrom: "/feedback"
          }
        })
      });

      await unwrapApiResponse<unknown>(response, "提交反馈失败。");
      setContent("");
      setMessage("反馈已提交，谢谢你帮我们把产品磨得更顺手。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "提交反馈失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>反馈表单</CardTitle>
        <CardDescription>
          当前账号：{user.name} · {user.email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submitFeedback} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {typeOptions.map((option) => {
              const Icon = option.icon;
              const active = type === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={cn(
                    "focus-ring rounded-lg border p-4 text-left transition",
                    active ? "border-teal-300 bg-teal-50" : "border-line bg-white hover:bg-slate-50"
                  )}
                >
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg", active ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-600")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{option.description}</span>
                </button>
              );
            })}
          </div>

          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={7}
            maxLength={5000}
            placeholder="请描述你遇到的情况、期望结果，或希望我们改进的地方。"
          />
          <p className="text-right text-xs text-muted">{content.length}/5000</p>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-700">
              {message}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Link
              href={backHref}
              className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              返回
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              提交反馈
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
