/**
 * Simple role-based access control placeholder.
 *
 * In this prototype the caller declares its role in the request. In a real
 * deployment the role (and campus scoping) would be derived from an
 * authenticated Nucleus ERP session — see the placeholder note below.
 */

export type Role = "HR_ADMIN" | "CAMPUS_HEAD" | "EMPLOYEE";

export const ROLES: Role[] = ["HR_ADMIN", "CAMPUS_HEAD", "EMPLOYEE"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/**
 * Returns true if `role` is permitted to use a tool that requires one of
 * `requiredRoles`. If `requiredRoles` is undefined/empty, access is open to all.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NUCLEUS ERP INTEGRATION POINT
 * In production, replace this with a real authorization check:
 *   - Resolve the user + role from the authenticated Nucleus session/JWT.
 *   - Enforce campus scoping (e.g. a CAMPUS_HEAD may only see their campus).
 *   - Enforce field-level rules for sensitive HR data.
 *   - Emit an audit-log entry for every access decision.
 * ───────────────────────────────────────────────────────────────────────────
 */
export function hasAccess(role: Role, requiredRoles?: Role[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return requiredRoles.includes(role);
}
