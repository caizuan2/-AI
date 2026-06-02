import { redirect } from "next/navigation";
import { FeedbackForm } from "@/app/feedback/feedback-form";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  try {
    const user = await getCurrentUser();

    if (!user.licenseActivated) {
      redirect("/unlock");
    }

    return (
      <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <PageHeader
            eyebrow="Feedback"
            title="提交反馈"
            description="告诉我们你遇到的问题、建议或 Bug。反馈会进入管理后台，便于后续跟进。"
          />
          <FeedbackForm
            backHref="/knowledge"
            user={{
              id: user.id,
              email: user.email,
              phone: user.phone,
              name: user.name
            }}
          />
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/feedback");
    }

    throw error;
  }
}
