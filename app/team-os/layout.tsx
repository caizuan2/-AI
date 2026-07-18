import type { ReactNode } from "react";
import { headers } from "next/headers";
import { TeamOsLayout } from "@/apps/team-os/app/layout";
import {
  TEAM_OS_PUBLIC_ENTRY_HEADER,
  isTeamOsPublicEntry
} from "@/apps/team-os/features/auth/constants";
import { enforceTeamOsPageAccess } from "@/apps/team-os/features/auth/services/team-os-page-access";

export const dynamic = "force-dynamic";

export default async function TeamOsRouteLayout({ children }: { children: ReactNode }) {
  if (isTeamOsPublicEntry(headers().get(TEAM_OS_PUBLIC_ENTRY_HEADER))) {
    return children;
  }

  const user = await enforceTeamOsPageAccess("/team-os");

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
