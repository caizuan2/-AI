"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { IngestExpertCard } from "@/components/enterprise-admin/IngestExpertCard";
import { IngestExpertCategoryBar } from "@/components/enterprise-admin/IngestExpertCategoryBar";
import { IngestExpertTabs } from "@/components/enterprise-admin/IngestExpertTabs";
import {
  ingestExpertPrimaryCategories,
  ingestExpertSecondaryCategories,
  ingestExperts,
  ingestExpertZones,
  type IngestExpert,
  type IngestExpertZoneId
} from "@/lib/enterprise/mock-experts";

export function IngestExpertMarketplace({
  addedExpertIds = [],
  onAddExpert
}: {
  addedExpertIds?: string[];
  onAddExpert: (expert: IngestExpert) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeZone, setActiveZone] = useState<IngestExpertZoneId | "all">("all");
  const [activePrimary, setActivePrimary] = useState("全部");
  const [activeSecondary, setActiveSecondary] = useState("全部");
  const addedSet = useMemo(() => new Set(addedExpertIds), [addedExpertIds]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredExperts = useMemo(() => ingestExperts.filter((expert) => {
    if (activeZone !== "all" && expert.zoneId !== activeZone) {
      return false;
    }

    if (activePrimary !== "全部" && expert.category !== activePrimary) {
      return false;
    }

    if (activeSecondary !== "全部" && expert.subcategory !== activeSecondary) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      expert.name,
      expert.description,
      expert.category,
      expert.subcategory,
      expert.zoneTitle,
      expert.author,
      expert.tags.join(" ")
    ].join(" ").toLowerCase().includes(normalizedQuery);
  }), [activePrimary, activeSecondary, activeZone, normalizedQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (document.activeElement === searchRef.current || query) {
        setQuery("");
        searchRef.current?.blur();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [query]);

  return (
    <section className="w-full space-y-5 pb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-[#202020]">专家广场</h1>
        <div className="flex h-11 min-w-[min(360px,100%)] items-center gap-2 rounded-2xl bg-[#f0f0ef] px-3 text-sm text-[#8a8a86]">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索专家"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#333] outline-none placeholder:text-[#8a8a86]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white"
              aria-label="清空专家搜索"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <IngestExpertTabs zones={ingestExpertZones} activeZone={activeZone} onZoneChange={setActiveZone} />

      <IngestExpertCategoryBar
        primaryCategories={ingestExpertPrimaryCategories}
        secondaryCategories={ingestExpertSecondaryCategories}
        activePrimary={activePrimary}
        activeSecondary={activeSecondary}
        onPrimaryChange={setActivePrimary}
        onSecondaryChange={setActiveSecondary}
      />

      {filteredExperts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredExperts.map((expert) => (
            <IngestExpertCard
              key={expert.id}
              expert={expert}
              isAdded={addedSet.has(expert.id)}
              onAdd={onAddExpert}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[#d9d9d5] bg-white p-8 text-center">
          <p className="text-base font-semibold text-[#202020]">没有找到相关专家</p>
          <p className="mt-2 text-sm text-[#858580]">可以清空搜索词，或切换专区与分类标签。</p>
        </div>
      )}
    </section>
  );
}
