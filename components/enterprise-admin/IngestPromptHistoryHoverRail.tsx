"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, FileText, MessageSquareText } from "lucide-react";

export type IngestPromptHistoryItem = {
  id: string;
  title: string;
  time: string;
  attachmentsCount?: number;
};

interface IngestPromptHistoryHoverRailProps {
  items: IngestPromptHistoryItem[];
  onSelect: (messageId: string) => void;
}

function truncatePrompt(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();

  return compact.length > 48 ? `${compact.slice(0, 48)}...` : compact;
}

const tickIndexes = Array.from({ length: 13 }, (_, index) => index);

export function IngestPromptHistoryHoverRail({
  items,
  onSelect
}: IngestPromptHistoryHoverRailProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleItems = items.slice(0, 24);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <>
      <div
        className="fixed bottom-[180px] right-10 top-[220px] z-40 hidden w-8 lg:block"
        aria-label="历史提示词快速定位热区"
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
        onFocus={openPanel}
        onBlur={scheduleClose}
      >
        <div className="flex h-full items-center justify-center">
          <button
            type="button"
            className="flex h-full w-8 items-center justify-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111]/15"
            aria-label="展开历史提示词"
          >
            <span className="flex flex-col items-center justify-center gap-2" aria-hidden="true">
              {tickIndexes.map((index) => {
                const emphasized = index === 6;
                const width = emphasized ? "w-6" : index % 3 === 0 ? "w-4" : "w-2.5";

                return (
                  <span
                    key={index}
                    className={[
                      "h-[2px] rounded-full transition-colors",
                      width,
                      emphasized
                        ? open ? "bg-[#8d8d86]" : "bg-[#a9a9a2]"
                        : open ? "bg-[#b9b9b2]" : "bg-[#d8d8d3]"
                    ].join(" ")}
                  />
                );
              })}
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="fixed bottom-[180px] right-[76px] top-[220px] z-50 hidden w-[330px] lg:block"
          onMouseEnter={openPanel}
          onMouseLeave={scheduleClose}
        >
          <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-neutral-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-[#f0f0ed] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f4f2] text-[#333]">
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#202020]">历史提示词</p>
                <p className="text-[11px] text-[#8a8a84]">点击只定位，不重新生成</p>
              </div>
            </div>
            <span className="rounded-full bg-[#f6f6f4] px-2 py-1 text-[11px] font-semibold text-[#777]">
              {items.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {visibleItems.length ? (
              visibleItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[#f7f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111]/15"
                  title={item.title}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f0ed] text-[11px] font-semibold text-[#555]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#242424]">
                      {truncatePrompt(item.title)}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#8a8a84]">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        {item.time || "刚刚"}
                      </span>
                      {item.attachmentsCount ? (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          {item.attachmentsCount} 个附件
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[#888]">
                暂无历史提示词
              </div>
            )}
          </div>
        </div>
      </div>
      ) : null}
    </>
  );
}
