import type { Metadata } from "next";
import { AppChatExperience } from "./AppChatExperience";
import { enforceUserAppPageAccess } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "小董AI",
  description: "AI Knowledge OS 用户端"
};

export default async function AppEntryPage() {
  await enforceUserAppPageAccess("/app");

  return <AppChatExperience />;
}
