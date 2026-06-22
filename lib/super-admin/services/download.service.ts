import { enterpriseDownloads } from "@/lib/enterprise/mock-data";
import type { DownloadPackage } from "@/types/super-admin";

function normalizePackage(item: (typeof enterpriseDownloads)[number]): DownloadPackage {
  return {
    ...item,
    version: item.latestVersion,
    changelog: item.releaseNotes
  };
}

export function getDownloadPackages(): DownloadPackage[] {
  return enterpriseDownloads.map(normalizePackage);
}

export function getUserAppVersions(): DownloadPackage[] {
  return getDownloadPackages().filter((item) => item.group === "用户端");
}

export function getIngestAppVersions(): DownloadPackage[] {
  return getDownloadPackages().filter((item) => item.group === "投喂管理员端");
}

export function getSuperAdminAppVersions(): DownloadPackage[] {
  return getDownloadPackages().filter((item) => item.group === "超级管理员端");
}
