import { Search } from "lucide-react";
import type { ChangeEventHandler } from "react";

type SearchInputProps = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
};

export function SearchInput({ value, onChange, placeholder = "搜索" }: SearchInputProps) {
  return (
    <label className="relative block w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="focus-ring h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-sm text-ink shadow-sm placeholder:text-slate-400"
      />
    </label>
  );
}
