import "server-only";

import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { checkUserLicense } from "@/lib/auth/license";
import {
  getProductFromPath,
  getRequiredLicenseAppTypeForProduct,
  isProductAccess,
  PRODUCT_ACCESS_HEADER,
  roleCanAccessProduct,
  type ProductAccess
} from "@/lib/auth/product-access";
import { getUserRoles } from "@/lib/auth/rbac";
import { LicenseAppTypeMismatchError, type AppError } from "@/lib/errors";
import { writeAuditLog, type AuditAction } from "@/lib/audit-log";
import { getHighestRole, roleSatisfies, type AppRole } from "@/lib/rbac/roles";
import type { AppUser } from "@/lib/auth/session";

export type AuthorizationFailureCode =
  | "UNAUTHORIZED"
  | "LICENSE_REQUIRED"
  | "LICENSE_APP_TYPE_MISMATCH"
  | "FORBIDDEN";

export interface AuthorizationResult {
  product: ProductAccess;
  role: AppRole | null;
  roles: AppRole[];
  licenseValid: boolean;
  accessGranted: boolean;
  user: (AppUser & { role: AppRole; roles: AppRole[] }) | null;
  failureCode?: AuthorizationFailureCode;
}

export interface AuthorizeOptions {
  product?: ProductAccess;
  requiredRole?: AppRole | AppRole[];
  requireLicense?: boolean;
  auditAction?: AuditAction;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  throwOnDenied?: boolean;
}

function getRequestPathname(request?: Request) {
  if (!request) {
    return null;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function getRequestProduct(request?: Request, fallbackPathname?: string | null) {
  const headerProduct = request?.headers.get(PRODUCT_ACCESS_HEADER);

  if (isProductAccess(headerProduct)) {
    return headerProduct;
  }

  return fallbackPathname ? getProductFromPath(fallbackPathname) : "public";
}

function getRequiredRoles(product: ProductAccess, requiredRole?: AppRole | AppRole[]) {
  if (requiredRole) {
    return Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  }

  if (product === "user_app") {
    return ["user" as const];
  }

  if (product === "ingest_admin") {
    return ["kb_admin" as const, "ingest_admin" as const];
  }

  if (product === "super_admin") {
    return ["super_admin" as const];
  }

  return [];
}

async function auditDenied(input: {
  user: AppUser | null;
  role: AppRole | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  request?: Request;
  metadata: Record<string, unknown>;
}) {
  if (!input.user) {
    return;
  }

  await writeAuditLog({
    userId: input.user.id,
    role: input.role,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    request: input.request,
    metadata: input.metadata as Prisma.InputJsonObject
  });
}

function deniedResult(input: {
  product: ProductAccess;
  role: AppRole | null;
  roles: AppRole[];
  user: AuthorizationResult["user"];
  licenseValid?: boolean;
  failureCode: AuthorizationFailureCode;
}): AuthorizationResult {
  return {
    product: input.product,
    role: input.role,
    roles: input.roles,
    licenseValid: input.licenseValid ?? false,
    accessGranted: false,
    user: input.user,
    failureCode: input.failureCode
  };
}

export async function authorize(request?: Request, options: AuthorizeOptions = {}): Promise<AuthorizationResult> {
  const pathname = getRequestPathname(request);
  const product = options.product ?? getRequestProduct(request, pathname);
  const throwOnDenied = options.throwOnDenied ?? true;

  if (product === "public") {
    return {
      product,
      role: null,
      roles: [],
      licenseValid: true,
      accessGranted: true,
      user: null
    };
  }

  let baseUser: AppUser;

  try {
    baseUser = await requireUser();
  } catch (error) {
    if (throwOnDenied) {
      throw error;
    }

    return deniedResult({
      product,
      role: null,
      roles: [],
      user: null,
      failureCode: "UNAUTHORIZED"
    });
  }

  const roles = await getUserRoles(baseUser);
  const role = getHighestRole(roles);
  const user = {
    ...baseUser,
    role,
    roles
  };
  const requiredRoles = getRequiredRoles(product, options.requiredRole);
  const roleAllowed = requiredRoles.length === 0 || requiredRoles.some((required) => roleSatisfies(role, required));
  const productAllowed = roleCanAccessProduct(product, role);

  if (!roleAllowed || !productAllowed) {
    await auditDenied({
      user: baseUser,
      role,
      action: options.auditAction ?? "product.blocked",
      targetType: options.targetType ?? "product_route",
      targetId: options.targetId,
      request,
      metadata: {
        product,
        requiredRoles,
        actualRole: role,
        roleAllowed,
        productAllowed,
        ...(options.metadata ?? {})
      }
    });

    if (throwOnDenied) {
      throw new LicenseAppTypeMismatchError("当前账号不能访问该产品。");
    }

    return deniedResult({
      product,
      role,
      roles,
      user,
      failureCode: "LICENSE_APP_TYPE_MISMATCH"
    });
  }

  const requiredAppType = getRequiredLicenseAppTypeForProduct(product);
  const shouldCheckLicense = options.requireLicense ?? Boolean(requiredAppType);

  if (shouldCheckLicense) {
    try {
      await checkUserLicense(baseUser.id, requiredAppType ?? undefined);
    } catch (error) {
      const appError = error as Partial<AppError>;

      await auditDenied({
        user: baseUser,
        role,
        action: options.auditAction ?? "route.access.denied",
        targetType: options.targetType ?? "product_route",
        targetId: options.targetId,
        request,
        metadata: {
          product,
          requiredAppType,
          code: appError.code,
          ...(options.metadata ?? {})
        }
      });

      if (throwOnDenied) {
        throw error;
      }

      return deniedResult({
        product,
        role,
        roles,
        user,
        failureCode: appError.code === "LICENSE_APP_TYPE_MISMATCH" ? "LICENSE_APP_TYPE_MISMATCH" : "LICENSE_REQUIRED"
      });
    }
  }

  return {
    product,
    role,
    roles,
    licenseValid: true,
    accessGranted: true,
    user
  };
}
