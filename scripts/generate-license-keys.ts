import { LicenseKeyStatus, PrismaClient } from "@prisma/client";
import { generatePlainLicenseKey, hashLicenseKey } from "@/lib/auth/license";

const prisma = new PrismaClient();

function readCount() {
  const countArgIndex = process.argv.findIndex((arg) => arg === "--count");
  const value = countArgIndex >= 0 ? process.argv[countArgIndex + 1] : "10";
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new Error("请输入合法数量，例如 pnpm license:generate --count 100。");
  }

  return count;
}

async function main() {
  const count = readCount();
  const keys = new Set<string>();

  while (keys.size < count) {
    keys.add(generatePlainLicenseKey());
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
