"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import NextImage from "next/image";
import { Clock3, FileText, MessageSquareText, X } from "lucide-react";
import adminIngestLogo from "@/assets/admin-ingest/web-logo.png";

export type IngestPromptHistoryItem = {
  id: string;
  title: string;
  time: string;
  attachmentsCount?: number;
};

interface IngestPromptHistoryHoverRailProps {
  items: IngestPromptHistoryItem[];
  onSelect: (messageId: string) => void;
  mobileFloating?: boolean;
}

function truncatePrompt(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();

  return compact.length > 48 ? `${compact.slice(0, 48)}...` : compact;
}

const tickIndexes = Array.from({ length: 13 }, (_, index) => index);
const MOBILE_ORB_SIZE = 40;
const MOBILE_ORB_MARGIN = 12;
const MOBILE_ORB_TOP_INSET = 84;
const MOBILE_ORB_BOTTOM_INSET = 112;
const MOBILE_ORB_POSITION_KEY = "admin-ingest-prompt-history-orb-position-v1";
const MOBILE_LOGO_BOUNCE_INTERVAL_MS = 9_000;
const MOBILE_LOGO_BOUNCE_DURATION_MS = 1_000;

type MobileOrbPosition = {
  x: number;
  y: number;
};

type MobileOrbDragState = {
  pointerId: number;
  pointerStartX: number;
  pointerStartY: number;
  orbStartX: number;
  orbStartY: number;
  moved: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function clampMobileOrbPosition(position: MobileOrbPosition): MobileOrbPosition {
  if (typeof window === "undefined") {
    return position;
  }

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  return {
    x: clamp(
      position.x,
      MOBILE_ORB_MARGIN,
      viewportWidth - MOBILE_ORB_SIZE - MOBILE_ORB_MARGIN
    ),
    y: clamp(
      position.y,
      MOBILE_ORB_TOP_INSET,
      viewportHeight - MOBILE_ORB_SIZE - MOBILE_ORB_BOTTOM_INSET
    )
  };
}

function getDefaultMobileOrbPosition(): MobileOrbPosition {
  if (typeof window === "undefined") {
    return { x: MOBILE_ORB_MARGIN, y: 260 };
  }

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  return clampMobileOrbPosition({
    x: viewportWidth - MOBILE_ORB_SIZE - MOBILE_ORB_MARGIN,
    y: viewportHeight * 0.54
  });
}

function readStoredMobileOrbPosition(): MobileOrbPosition | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(MOBILE_ORB_POSITION_KEY) ?? "null") as {
      x?: unknown;
      y?: unknown;
    } | null;

    if (typeof stored?.x === "number" && typeof stored.y === "number") {
      return clampMobileOrbPosition({ x: stored.x, y: stored.y });
    }
  } catch {
    // Invalid local UI state should fall back to the safe default position.
  }

  return null;
}

function saveMobileOrbPosition(position: MobileOrbPosition) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MOBILE_ORB_POSITION_KEY, JSON.stringify(position));
  } catch {
    // The floating control remains usable when WebView storage is unavailable.
  }
}

export function IngestPromptHistoryHoverRail({
  items,
  onSelect,
  mobileFloating = false
}: IngestPromptHistoryHoverRailProps) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileOrbPosition, setMobileOrbPosition] = useState<MobileOrbPosition | null>(null);
  const [mobileLogoBouncing, setMobileLogoBouncing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileOrbDragRef = useRef<MobileOrbDragState | null>(null);
  const suppressMobileOrbClickRef = useRef(false);
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

  useEffect(() => {
    if (!mobileFloating) {
      setMobileOpen(false);
      setMobileLogoBouncing(false);
      return;
    }

    const syncPositionToViewport = () => {
      setMobileOrbPosition((current) => clampMobileOrbPosition(
        current ?? readStoredMobileOrbPosition() ?? getDefaultMobileOrbPosition()
      ));
    };

    syncPositionToViewport();
    window.addEventListener("resize", syncPositionToViewport);
    window.visualViewport?.addEventListener("resize", syncPositionToViewport);

    return () => {
      window.removeEventListener("resize", syncPositionToViewport);
      window.visualViewport?.removeEventListener("resize", syncPositionToViewport);
    };
  }, [mobileFloating]);

  useEffect(() => {
    if (!mobileFloating) {
      return;
    }

    let bounceResetTimer: ReturnType<typeof setTimeout> | null = null;
    const bounceInterval = setInterval(() => {
      setMobileLogoBouncing(true);
      bounceResetTimer = setTimeout(() => {
        setMobileLogoBouncing(false);
      }, MOBILE_LOGO_BOUNCE_DURATION_MS);
    }, MOBILE_LOGO_BOUNCE_INTERVAL_MS);

    return () => {
      clearInterval(bounceInterval);
      if (bounceResetTimer) {
        clearTimeout(bounceResetTimer);
      }
    };
  }, [mobileFloating]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  const handleMobileOrbPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const currentPosition = mobileOrbPosition ?? { x: rect.left, y: rect.top };

    mobileOrbDragRef.current = {
      pointerId: event.pointerId,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      orbStartX: currentPosition.x,
      orbStartY: currentPosition.y,
      moved: false
    };
    suppressMobileOrbClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [mobileOrbPosition]);

  const handleMobileOrbPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = mobileOrbDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.pointerStartX;
    const deltaY = event.clientY - drag.pointerStartY;

    if (!drag.moved && Math.hypot(deltaX, deltaY) >= 5) {
      drag.moved = true;
    }

    if (!drag.moved) {
      return;
    }

    event.preventDefault();
    setMobileOrbPosition(clampMobileOrbPosition({
      x: drag.orbStartX + deltaX,
      y: drag.orbStartY + deltaY
    }));
  }, []);

  const finishMobileOrbDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = mobileOrbDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    suppressMobileOrbClickRef.current = drag.moved;
    mobileOrbDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setMobileOrbPosition((current) => {
      if (current) {
        saveMobileOrbPosition(current);
      }

      return current;
    });
  }, []);

  return (
    <>
      <div
        className={mobileFloating
          ? "hidden"
          : "fixed bottom-[180px] right-10 top-[220px] z-40 hidden w-8 lg:block"}
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

      {open && !mobileFloating ? (
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

      {mobileFloating ? (
        <button
          type="button"
          aria-label="打开历史提示词"
          aria-expanded={mobileOpen}
          onPointerDown={handleMobileOrbPointerDown}
          onPointerMove={handleMobileOrbPointerMove}
          onPointerUp={finishMobileOrbDrag}
          onPointerCancel={finishMobileOrbDrag}
          onClick={() => {
            if (suppressMobileOrbClickRef.current) {
              suppressMobileOrbClickRef.current = false;
              return;
            }

            setMobileOpen(true);
          }}
          style={mobileOrbPosition
            ? {
                left: `${mobileOrbPosition.x}px`,
                top: `${mobileOrbPosition.y}px`
              }
            : {
                right: `${MOBILE_ORB_MARGIN}px`,
                top: "54%"
              }}
          className="fixed z-[55] flex h-[40px] w-[40px] touch-none select-none items-center justify-center bg-transparent p-0 transition-transform active:scale-95"
        >
          <NextImage
            src={adminIngestLogo}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={[
              "pointer-events-none h-9 w-9 object-contain",
              mobileLogoBouncing ? "animate-bounce motion-reduce:animate-none" : ""
            ].join(" ")}
          />
        </button>
      ) : null}

      {mobileFloating && mobileOpen ? (
        <div
          className="fixed inset-0 z-[85] flex items-end bg-black/30 px-3 pt-16"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="历史提示词"
            onClick={(event) => event.stopPropagation()}
            className="mx-auto flex max-h-[70dvh] w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-center justify-between border-b border-[#f0f0ed] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef6ff] text-[#0A84FF]">
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#202020]">历史提示词</p>
                  <p className="text-[11px] text-[#8a8a84]">点击定位原消息，不会重新发送</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#f6f6f4] px-2 py-1 text-[11px] font-semibold text-[#777]">
                  {items.length}
                </span>
                <button
                  type="button"
                  aria-label="关闭历史提示词"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#777] transition hover:bg-[#f4f4f2] hover:text-[#202020]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {visibleItems.length ? (
                visibleItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item.id);
                      setMobileOpen(false);
                    }}
                    className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[#f7f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                    title={item.title}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef6ff] text-[11px] font-semibold text-[#0A84FF]">
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
                <div className="px-4 py-10 text-center text-sm text-[#888]">
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
