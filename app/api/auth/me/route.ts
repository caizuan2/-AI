import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: {
    id: string;
    phone: string;
    email: string | null;
    name: string;
    avatar_url: null;
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
        email: user.email,
        name: user.name,
        avatar_url: null,
        licenseActivated: user.licenseActivated
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
