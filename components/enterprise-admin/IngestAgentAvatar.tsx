"use client";

import type { AdminIngestDisplayProfile } from "@/lib/enterprise/admin-ingest-profile";

const avatarSizeClasses = {
  xs: "h-7 w-7 rounded-xl text-sm",
  sm: "h-10 w-10 rounded-2xl text-lg",
  md: "h-12 w-12 rounded-2xl text-xl",
  lg: "h-[88px] w-[88px] rounded-[30px] text-[34px]",
};

type IngestAgentAvatarProps = {
  profile: AdminIngestDisplayProfile;
  size?: keyof typeof avatarSizeClasses;
  className?: string;
};

export function IngestAgentAvatar({ profile, size = "md", className = "" }: IngestAgentAvatarProps) {
  const baseClasses = [
    "relative flex shrink-0 items-center justify-center overflow-hidden border border-white/80 shadow-sm",
    avatarSizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (profile.avatarUrl) {
    return (
      <span
        aria-label={profile.avatarLabel}
        className={baseClasses}
        style={{
          backgroundImage: `url("${profile.avatarUrl}")`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
    );
  }

  return (
    <span aria-label={profile.avatarLabel} className={baseClasses} style={{ background: profile.avatarGradient }}>
      <span aria-hidden="true" className="drop-shadow-sm">
        {profile.avatarEmoji}
      </span>
    </span>
  );
}
