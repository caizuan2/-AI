import type { ReactNode } from "react";
import { enforceUserAppPageAccess } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function ChatWorkspaceGuardLayout({ children }: { children: ReactNode }) {
  await enforceUserAppPageAccess("/chat");

  return children;
}
