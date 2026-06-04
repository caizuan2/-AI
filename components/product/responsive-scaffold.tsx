import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ResponsiveScaffold({
  children,
  rightPanel,
  className
}: {
  children: ReactNode;
  rightPanel?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]", className)}>
      <div className="min-w-0">{children}</div>
      {rightPanel ? <div className="hidden xl:block">{rightPanel}</div> : null}
    </div>
  );
}
