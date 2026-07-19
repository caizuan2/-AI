import type { ReactNode } from "react";
import { TeamOsShell } from "@/apps/team-os/components/TeamOsShell";
import type { TeamOsUser } from "@/apps/team-os/types";

export function TeamOsLayout({ children, user }: { children: ReactNode; user: TeamOsUser }) {
  return <TeamOsShell user={user}>{children}</TeamOsShell>;
}
