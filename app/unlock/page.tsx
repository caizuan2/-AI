import { redirect } from "next/navigation";
import { UnlockPanel } from "@/app/unlock/unlock-panel";
import { requireUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function UnlockPage() {
  try {
    const user = await requireUser();

    if (user.licenseActivated) {
      redirect("/");
    }

    return <UnlockPanel user={{ phone: user.phone, name: user.name }} />;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/unlock");
    }

    throw error;
  }
}
