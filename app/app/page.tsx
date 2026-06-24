import { redirect } from "next/navigation";
import { enforceUserAppPageAccess } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function AppEntryPage() {
  await enforceUserAppPageAccess("/app");
  redirect("/app/chat");
}
