import { redirect } from "next/navigation";
import { WaitlistPanel } from "@/app/waitlist/waitlist-panel";
import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  try {
    const user = await getCurrentUser();

    if (user.betaAccess || isAdminUser(user)) {
      redirect("/knowledge");
    }

    return (
      <main className="min-h-dvh bg-canvas px-4 py-10 sm:px-6">
        <WaitlistPanel
          user={{
            email: user.email,
            name: user.name,
            betaRequestedAt: user.betaRequestedAt?.toISOString() ?? null
          }}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/waitlist");
    }

    throw error;
  }
}
