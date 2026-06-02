import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "warning";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const styles: Record<BadgeVariant, string> = {
    default: "bg-teal-50 text-teal-700 ring-teal-100",
    secondary: "bg-slate-100 text-slate-700 ring-slate-200",
    outline: "bg-white text-slate-600 ring-line",
    warning: "bg-amber-50 text-amber-700 ring-amber-100"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
