import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { getLicenseReactivationUrl } from "@/lib/auth/license-reactivation";
import { PRODUCT_ACCESS_HEADER } from "@/lib/auth/product-access";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  try {
    const user = await getCurrentUser();
    const isAdmin = isAdminUser(user);

    if (!user.licenseActivated) {
      if (headers().get(PRODUCT_ACCESS_HEADER) === "ingest_admin") {
        redirect(getLicenseReactivationUrl("ingest_admin", "/ingest", "missing"));
      }

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
