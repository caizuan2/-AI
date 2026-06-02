import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  try {
    const user = await getCurrentUser();
    const isAdmin = isAdminUser(user);

    if (!user.licenseActivated) {
      redirect("/unlock");
    }

    return <AppShell user={{ ...user, isAdmin }}>{children}</AppShell>;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }

    throw error;
  }
}
