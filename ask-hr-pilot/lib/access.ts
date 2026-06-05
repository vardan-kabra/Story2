import type { Role } from "./auth";

/**
 * The authenticated principal for a request.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NUCLEUS ERP INTEGRATION POINT
 * In production this would be derived from the authenticated Nucleus session
 * (user id, role, home campus), NOT supplied by the client. Here the UI sends
 * it directly so the access model can be demonstrated.
 * ───────────────────────────────────────────────────────────────────────────
 */
export interface Principal {
  role: Role;
  /** CAMPUS_HEAD: the campus code they govern (e.g. "FSK"). */
  campus?: string | null;
  /** EMPLOYEE: their own full name (their identity). */
  employeeName?: string | null;
}

/** Tools an EMPLOYEE may use — their own personal data + general policies. */
const EMPLOYEE_ALLOWED = new Set([
  "getEmployeeByName",
  "getLeaveBalance",
  "getReportingManager",
  "getPolicyByTopic",
]);

/** For EMPLOYEE self-scoping: which record field names the subject person. */
const SUBJECT_KEY: Record<string, string> = {
  getEmployeeByName: "name",
  getLeaveBalance: "employee",
  getReportingManager: "employee",
};

/** Tools whose `campus` input is forced to the CAMPUS_HEAD's own campus. */
export const CAMPUS_INPUT_TOOLS = new Set([
  "getEmployeesByCampus",
  "summarizeLeaveStatus",
]);

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Coarse, principal-aware authorization decided BEFORE running a tool.
 * (Per-tool elevated-role gating still also applies via `tools.ts`.)
 */
export function authorizeTool(principal: Principal, toolName: string): AccessDecision {
  if (principal.role === "EMPLOYEE") {
    if (!EMPLOYEE_ALLOWED.has(toolName)) {
      return {
        allowed: false,
        reason:
          "EMPLOYEE access is limited to your own record (profile, leave balance, reporting manager) and general HR policies.",
      };
    }
    if (!principal.employeeName) {
      return { allowed: false, reason: "No employee identity is set for this session." };
    }
  }

  if (principal.role === "CAMPUS_HEAD" && !principal.campus && toolName !== "getPolicyByTopic") {
    return { allowed: false, reason: "No campus is set for this CAMPUS_HEAD session." };
  }

  return { allowed: true };
}

/** If true, rewrite the tool's `campus` input to the principal's campus. */
export function shouldForceCampus(principal: Principal, toolName: string): boolean {
  return principal.role === "CAMPUS_HEAD" && !!principal.campus && CAMPUS_INPUT_TOOLS.has(toolName);
}

export interface ScopeOutcome {
  records: Record<string, unknown>[];
  redactedCount: number;
}

/**
 * Filters a tool's result records down to what the principal may see, AFTER the
 * query runs. This is the data-level enforcement that complements the coarse
 * authorization above.
 */
export function scopeRecords(
  principal: Principal,
  toolName: string,
  records: Record<string, unknown>[],
): ScopeOutcome {
  // HR_ADMIN sees everything.
  if (principal.role === "HR_ADMIN") {
    return { records, redactedCount: 0 };
  }

  // CAMPUS_HEAD: keep only records belonging to their campus (records without a
  // campus field — e.g. policies — are not campus-specific and are kept).
  if (principal.role === "CAMPUS_HEAD") {
    if (!principal.campus) return { records, redactedCount: 0 };
    const campus = principal.campus.toUpperCase();
    const kept: Record<string, unknown>[] = [];
    let redacted = 0;
    for (const r of records) {
      const recCampus = r.campus;
      if (recCampus === undefined || recCampus === null) kept.push(r);
      else if (String(recCampus).toUpperCase() === campus) kept.push(r);
      else redacted++;
    }
    return { records: kept, redactedCount: redacted };
  }

  // EMPLOYEE: policies are open; otherwise keep only records about themselves.
  if (principal.role === "EMPLOYEE") {
    if (toolName === "getPolicyByTopic") return { records, redactedCount: 0 };
    const key = SUBJECT_KEY[toolName];
    const self = (principal.employeeName ?? "").toLowerCase();
    if (!key || !self) return { records: [], redactedCount: records.length };
    const kept: Record<string, unknown>[] = [];
    let redacted = 0;
    for (const r of records) {
      if (String(r[key] ?? "").toLowerCase() === self) kept.push(r);
      else redacted++;
    }
    return { records: kept, redactedCount: redacted };
  }

  return { records, redactedCount: 0 };
}

/** Human-readable description of the principal's data scope (for the prompt). */
export function describeScope(principal: Principal): string {
  switch (principal.role) {
    case "HR_ADMIN":
      return "You have HR_ADMIN access: full visibility across all campuses.";
    case "CAMPUS_HEAD":
      return principal.campus
        ? `You are a CAMPUS_HEAD for campus ${principal.campus}. You can ONLY see data for ${principal.campus}; records from other campuses are hidden from you.`
        : "You are a CAMPUS_HEAD but no campus is set, so only general policies are available.";
    case "EMPLOYEE":
      return principal.employeeName
        ? `You are ${principal.employeeName}, an EMPLOYEE. You may ONLY see your own record (your profile, your leave balance, your reporting manager) and general HR policies. You cannot see other employees, directory listings, pending requests, or campus-wide summaries.`
        : "You are an EMPLOYEE but no identity is set, so only general policies are available.";
    default:
      return "";
  }
}
