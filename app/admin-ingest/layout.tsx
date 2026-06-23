import type { ReactNode } from "react";

export default function AdminIngestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919] antialiased">
      {children}
    </div>
  );
}
