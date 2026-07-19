import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyTeamOsLicensePlatformPage() {
  redirect("/super-admin/licenses/team-os");
}
