let prismaClient;

function loadPrismaClient() {
  const packageName = "@prisma/client";
  return require(packageName).PrismaClient;
}

function getPrisma() {
  if (!process.env.DATABASE_URL?.trim()) {
    return null;
  }

  const PrismaClient = loadPrismaClient();
  prismaClient ??= new PrismaClient();
  return prismaClient;
}

async function markUserLicenseActivated(userId) {
  const value = String(userId ?? "").trim();

  if (!value) {
    return {
      updated: false,
      reason: "missing_user_id"
    };
  }

  const prisma = getPrisma();

  if (!prisma) {
    return {
      updated: false,
      reason: "missing_database_url"
    };
  }

  const result = await prisma.user.updateMany({
    where: {
      OR: [
        { id: value },
        { phone: value }
      ]
    },
    data: {
      licenseActivated: true
    }
  });

  return {
    updated: result.count > 0,
    count: result.count,
    reason: result.count > 0 ? null : "user_not_found"
  };
}

module.exports = {
  markUserLicenseActivated
};
