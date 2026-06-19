"use client";

export function IngestExpertCategoryBar({
  primaryCategories,
  secondaryCategories,
  activePrimary,
  activeSecondary,
  onPrimaryChange,
  onSecondaryChange
}: {
  primaryCategories: string[];
  secondaryCategories: string[];
  activePrimary: string;
  activeSecondary: string;
  onPrimaryChange: (category: string) => void;
  onSecondaryChange: (category: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-[24px] border border-[#eeeeeb] bg-white/80 p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {primaryCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onPrimaryChange(category)}
            className={[
              "h-8 rounded-full px-3 text-xs font-semibold transition",
              activePrimary === category
                ? "bg-[#202020] text-white shadow-sm"
                : "bg-[#f4f4f2] text-[#666] hover:bg-[#ececea] hover:text-[#202020]"
            ].join(" ")}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[#f1f1ef] pt-3">
        {secondaryCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onSecondaryChange(category)}
            className={[
              "h-8 rounded-full px-3 text-xs font-semibold transition",
              activeSecondary === category
                ? "bg-[#e9f8ef] text-[#128246] ring-1 ring-[#cbeed8]"
                : "bg-[#fbfbfa] text-[#777] hover:bg-[#f3f3f1] hover:text-[#202020]"
            ].join(" ")}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}

