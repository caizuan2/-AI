"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type {
  ExpertMarketItem,
  ExpertMarketResponse,
  ExpertMarketSection,
  SelectedKnowledgeBase
} from "../types";

interface ExpertMarketDrawerProps {
  open: boolean;
  selected: SelectedKnowledgeBase[];
  onAdd: (item: ExpertMarketItem) => void;
  onRemove: (kbId: string) => void;
  onClose: () => void;
}

function isSelected(selected: SelectedKnowledgeBase[], kbId: string) {
  return selected.some((item) => item.kb_id === kbId);
}

function filterSections(sections: ExpertMarketSection[], query: string) {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return sections;
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => [
        item.title,
        item.expertName,
        item.description,
        item.category
      ].filter(Boolean).join(" ").toLowerCase().includes(keyword))
    }))
    .filter((section) => section.items.length > 0);
}

export function ExpertMarketDrawer({
  open,
  selected,
  onAdd,
  onRemove,
  onClose
}: ExpertMarketDrawerProps) {
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("专家库暂未连接");
  const [sections, setSections] = React.useState<ExpertMarketSection[]>([]);
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
  const [marketLoaded, setMarketLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setExpandedSections({});

    if (marketLoaded) {
      return;
    }

    const controller = new AbortController();

    async function loadExpertMarket() {
      setLoading(true);
      setMessage("正在连接专家库...");

      try {
        const response = await fetch("/api/user/expert-market", {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json"
          },
          signal: controller.signal
        });
        const payload = await response.json().catch(() => null) as ExpertMarketResponse | null;

        if (!response.ok || !payload?.ok) {
          setSections([]);
          setMessage(payload?.message || "专家库暂未连接");
          return;
        }

        setSections(payload.sections);
        setMessage(payload.sections.length > 0 ? "" : payload.message || "专家库暂无可展示内容");
        setMarketLoaded(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSections([]);
          setMessage("专家库暂未连接");
        }
      } finally {
        setLoading(false);
      }
    }

    void loadExpertMarket();

    return () => controller.abort();
  }, [marketLoaded, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const visibleSections = filterSections(sections, query);
  const hasSearch = query.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[90] isolate" role="dialog" aria-modal="true" aria-label="专家知识库">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/20"
        aria-label="关闭专家知识库"
        onClick={onClose}
      />
      <aside
        className="absolute bottom-24 right-3 flex h-[42vh] min-h-[260px] w-[90vw] max-w-[380px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:right-5 sm:w-[360px]"
        style={{
          bottom: "max(5.75rem, calc(env(safe-area-inset-bottom, 0px) + 4.75rem))",
          height: "min(58dvh, 520px)",
          maxHeight: "calc(100dvh - 7rem)"
        }}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-50 px-3 text-sm text-slate-500 ring-1 ring-slate-100">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="搜索专家或知识库"
              />
            </label>
            <button
              type="button"
              onClick={onClose}
              className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label="关闭专家库"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium text-slate-500">
              正在加载专家库...
            </div>
          ) : visibleSections.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {visibleSections.map((section) => {
                const expanded = hasSearch || Boolean(expandedSections[section.key]);

                return (
                  <section key={section.key} className="py-2 first:pt-0 last:pb-0">
                    <div className={[
                      "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition",
                      expanded
                        ? "border-slate-300 bg-slate-100"
                        : "border-slate-100 bg-slate-50"
                    ].join(" ")}>
                      <h3 className="text-[15px] font-bold text-slate-950">{section.title}</h3>
                      <button
                        type="button"
                        onClick={() => setExpandedSections((current) => ({
                          ...current,
                          [section.key]: !current[section.key]
                        }))}
                        className="focus-ring inline-flex h-7 min-w-7 items-center justify-center rounded-full text-base font-black leading-none text-slate-700 hover:bg-white/70"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "收起" : "展开"}${section.title}`}
                      >
                        ...
                      </button>
                    </div>

                    {expanded ? (
                      <div className="space-y-2 pt-2">
                        {section.items.map((item) => {
                          const added = isSelected(selected, item.kb_id);

                          return (
                            <article key={item.kb_id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <p className="min-w-0 truncate text-sm font-bold text-slate-950">{item.title}</p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (added) {
                                      onRemove(item.kb_id);
                                    } else {
                                      onAdd(item);
                                    }
                                  }}
                                  className={[
                                    "focus-ring inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold transition",
                                    added
                                      ? "border-slate-200 bg-slate-50 text-slate-600 hover:border-red-100 hover:bg-red-50 hover:text-red-600"
                                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                                  ].join(" ")}
                                >
                                  {added ? "取消" : "+ 添加"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
              {message || "专家库暂未连接"}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
