import { getSaaSCoreMetrics, getSaaSSystemHealth } from "@/lib/saas-core/system.service";
import { saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [health, metrics] = await Promise.all([
      getSaaSSystemHealth(),
      getSaaSCoreMetrics()
    ]);

    return saasCoreSuccess({ health, metrics });
  } catch (error) {
    return saasCoreError(error);
  }
}
