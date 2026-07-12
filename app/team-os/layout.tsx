import type { ReactNode } from "react";
import { TeamOsLayout } from "@/apps/team-os/app/layout";
import { enforceUserAppPageAccess } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function TeamOsRouteLayout({ children }: { children: ReactNode }) {
  const user = await enforceUserAppPageAccess("/team-os");

  return (
    <TeamOsLayout
      user={{
        name: user.name || "企业用户",
        identity: user.phone || user.email || user.id
      }}
    >
      {children}
    </TeamOsLayout>
  );
}
