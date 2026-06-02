import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: {
    id: string;
    phone: string;
    name: string;
    licenseActivated: boolean;
  };
}

export async function GET() {
  try {
    const user = await requireUser();

    return apiSuccess<MeResponse>({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        licenseActivated: user.licenseActivated
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
