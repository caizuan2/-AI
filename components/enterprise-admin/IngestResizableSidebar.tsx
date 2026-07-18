"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_WIDTH_KEY = "admin-ingest-sidebar-width";
const SIDEBAR_WIDTH_VAR = "--admin-ingest-sidebar-width";

function clampSidebarWidth(value: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));
}

function applySidebarWidth(width: number) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
}

export function IngestResizableSidebar({
  children,
  className = "",
  ariaLabel = "Admin ingest Agent sidebar"
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  useEffect(() => {
    const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    const nextWidth = Number.isFinite(storedWidth) && storedWidth > 0
      ? clampSidebarWidth(storedWidth)
      : DEFAULT_SIDEBAR_WIDTH;

    setWidth(nextWidth);
    applySidebarWidth(nextWidth);
  }, []);

  function startResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = width;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);

      setWidth(nextWidth);
      applySidebarWidth(nextWidth);
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
    }

    function handleMouseUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <aside
      aria-label={ariaLabel}
      className={["relative hidden h-screen shrink-0 flex-col border-r md:flex", className].join(" ")}
      style={{ width }}
    >
      {children}
      <div
        aria-hidden="true"
        onMouseDown={startResize}
        className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none select-none transition hover:bg-orange-100/70"
      >
        <div className="absolute right-0 top-1/2 h-12 w-px -translate-y-1/2 rounded-full bg-[#d8d8d4]" />
      </div>
    </aside>
  );
}
