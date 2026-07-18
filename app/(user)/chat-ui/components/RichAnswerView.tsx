import * as React from "react";
import { Sparkles } from "lucide-react";
import type { ProviderStatus } from "../types";
import { buildRichAnswerSections } from "../lib/answer-format";
import { AnswerSectionCard } from "./AnswerSectionCard";

interface RichAnswerViewProps {
  answer: string;
  customerAnswer?: string | null;
  providerStatus?: ProviderStatus | null;
}

export function RichAnswerView({ answer, customerAnswer, providerStatus }: RichAnswerViewProps) {
  const sections = buildRichAnswerSections({
    answer,
    customerAnswer,
    providerStatus
  });

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2 text-blue-600">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-950">现在建议你这样回复</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          以下内容基于小董AI大脑🧠资料整理，并补充了更易理解的表达方式。
        </p>
      </header>

      <div className="h-px bg-slate-200" aria-hidden="true" />

      <div className="grid gap-3">
        {sections.map((section) => (
          <AnswerSectionCard
            key={section.id}
            title={section.title}
            subtitle={section.subtitle}
            content={section.content}
            icon={section.icon}
          />
        ))}
      </div>
    </div>
  );
}
