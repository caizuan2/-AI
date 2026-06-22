import type { SuperAdminPlatform } from "@/types/super-admin-sync";

const platformMeta: Record<SuperAdminPlatform, { label: string; className: string }> = {
  web: {
    label: "Web",
    className: "border-sky-200 bg-sky-50 text-sky-700"
  },
  android_apk: {
    label: "Android APK",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  windows_exe: {
    label: "Windows EXE",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700"
  }
};

export function getPlatformLabel(platform: SuperAdminPlatform) {
  return platformMeta[platform].label;
}

export function DevicePlatformBadge({ platform }: { platform: SuperAdminPlatform }) {
  const meta = platformMeta[platform];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
