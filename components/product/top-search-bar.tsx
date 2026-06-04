"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopSearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "搜索知识、提问或粘贴文档链接",
  className
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-14 items-center gap-2 rounded-lg border border-line bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900", className)}>
      <Search className="h-5 w-5 shrink-0 text-muted dark:text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
        placeholder={placeholder}
      />
      <Button variant="ghost" size="icon" aria-label="筛选" title="筛选">
        <SlidersHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
