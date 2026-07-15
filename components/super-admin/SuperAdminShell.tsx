import type { ReactNode } from "react";
import { SuperAdminSidebar } from "@/components/super-admin/SuperAdminSidebar";
import { SuperAdminTopbar } from "@/components/super-admin/SuperAdminTopbar";

export function SuperAdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-100 text-slate-950">
      <div className="min-h-dvh min-w-0">
        <SuperAdminSidebar />
        <div className="min-w-0 lg:ml-[280px]">
          <SuperAdminTopbar />
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
