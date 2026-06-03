import { LicenseKeyStatus, PrismaClient } from "@prisma/client";
import {
  generatePlainLicenseKey,
  hashLicenseKey,
  redeemLicenseKey
} from "@/lib/auth/license";

const prisma = new PrismaClient();
const TEST_PHONE = "+8613900000000";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function resetTestUser() {
  return prisma.user.upsert({
    where: {
      phone: TEST_PHONE
    },
    update: {
      name: "License Smoke Test",
      isActive: true,
      licenseActivated: false
    },
    create: {
      phone: TEST_PHONE,
      name: "License Smoke Test",
      passwordHash: "smoke-test-user",
      isActive: true,
      licenseActivated: false
    }
  });
}

async function main() {
  const user = await resetTestUser();
  const code = generatePlainLicenseKey();

  await prisma.licenseKey.create({
    data: {
      keyHash: hashLicenseKey(code),
      status: LicenseKeyStatus.UNUSED
    }
  });

  const activated = await redeemLicenseKey(user.id, code);
  assert(activated.licenseActivated === true, "首次激活应该成功。");

  const afterActivation = await prisma.licenseKey.findUnique({
    where: {
      keyHash: hashLicenseKey(code)
    }
  });

  assert(afterActivation?.status === LicenseKeyStatus.USED, "激活后卡密状态应该变为 USED。");

  try {
    await redeemLicenseKey(user.id, code);
    throw new Error("重复激活不应该成功。");
  } catch (error) {
    assert(getErrorMessage(error) === "卡密已使用。", "重复激活应返回“卡密已使用”。");
  }

  try {
    await redeemLicenseKey(user.id, generatePlainLicenseKey());
    throw new Error("不存在卡密不应该激活成功。");
  } catch (error) {
    assert(getErrorMessage(error) === "卡密不存在。", "不存在卡密应返回“卡密不存在”。");
  }

  console.log("License smoke test passed.");
  console.log(`Used test code: ${code}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
