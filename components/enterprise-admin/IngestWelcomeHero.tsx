"use client";

import type { AdminIngestDisplayProfile } from "@/lib/enterprise/admin-ingest-profile";
import { IngestAgentAvatar } from "./IngestAgentAvatar";

type IngestWelcomeHeroProps = {
  profile: AdminIngestDisplayProfile;
  canIngest: boolean;
  onOpenExperts?: () => void;
  compact?: boolean;
};

export function IngestWelcomeHero({ profile, canIngest, onOpenExperts, compact = false }: IngestWelcomeHeroProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <IngestAgentAvatar profile={profile} size="lg" className={compact ? "h-20 w-20 rounded-[26px]" : ""} />
      <h1 className="mt-5 text-[34px] font-black tracking-[0px] text-[#101010]">
        Hi，我是{profile.assistantTitle}
      </h1>
      <p className="mt-2 text-base font-medium text-[#9A9A9A]">{profile.subtitle}</p>
      {!canIngest && onOpenExperts ? (
        <button
          type="button"
          onClick={onOpenExperts}
          className="mt-5 rounded-full bg-[#101010] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#202020]"
        >
          打开专家广场
        </button>
      ) : null}
    </div>
  );
}
