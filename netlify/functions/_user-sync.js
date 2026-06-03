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

function normalizePhone(input) {
  const value = String(input ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s-]+/g, "");

  if (/^1[3-9]\d{9}$/.test(value)) {
    return `+86${value}`;
  }

  if (/^861[3-9]\d{9}$/.test(value)) {
    return `+${value}`;
  }

  return value;
}

function buildUserWhere(value) {
  const normalized = normalizePhone(value);
  const candidates = Array.from(new Set([
    value,
    normalized,
    normalized.startsWith("+") ? normalized.slice(1) : normalized,
    normalized.startsWith("+86") ? normalized.slice(3) : normalized
  ].filter(Boolean)));

  return {
    OR: [
      ...candidates.map((candidate) => ({ id: candidate })),
      ...candidates.map((candidate) => ({ phone: candidate }))
    ]
  };
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
    where: buildUserWhere(value),
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
