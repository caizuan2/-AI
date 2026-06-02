import { randomBytes } from "crypto";
import { LicenseKeyStatus, PrismaClient } from "@prisma/client";
import { hashLicenseKey } from "@/lib/auth/license";

const prisma = new PrismaClient();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function readCount() {
  const countArgIndex = process.argv.findIndex((arg) => arg === "--count");
  const value = countArgIndex >= 0 ? process.argv[countArgIndex + 1] : "10";
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new Error("请输入合法数量，例如 pnpm license:generate --count 100。");
  }

  return count;
}

function randomGroup(length: number) {
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function generateLicenseKey() {
  return `AIKB-${randomGroup(4)}-${randomGroup(4)}-${randomGroup(4)}`;
}

async function main() {
  const count = readCount();
  const keys = new Set<string>();

  while (keys.size < count) {
    keys.add(generateLicenseKey());
  }

  await prisma.licenseKey.createMany({
    data: Array.from(keys, (key) => ({
      keyHash: hashLicenseKey(key),
      status: LicenseKeyStatus.UNUSED
    })),
    skipDuplicates: true
  });

  console.info("License keys generated. Save these plaintext keys now; database stores only hashes.");
  console.info(Array.from(keys).join("\n"));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "生成卡密失败。");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
