import { describe, it, expect, beforeAll } from "vitest";
import { ensureDb } from "../lib/db";
import { TOOLS } from "../lib/tools";
import { hasAccess } from "../lib/auth";
import {
  authorizeTool,
  scopeRecords,
  shouldForceCampus,
  type Principal,
} from "../lib/access";

/**
 * Mirrors the per-tool decision the /api/ask agent loop makes for each tool
 * call: coarse role gate + principal authorization, campus forcing, execution,
 * then record scoping. This is the security contract the loop relies on,
 * tested without invoking the model.
 */
function runTool(p: Principal, tool: string, input: Record<string, unknown> = {}) {
  const spec = TOOLS[tool];
  if (!hasAccess(p.role, spec.requiredRoles) || !authorizeTool(p, tool).allowed) {
    return { denied: true, records: [] as Record<string, unknown>[], redacted: 0 };
  }
  if (shouldForceCampus(p, tool) && p.campus) input = { ...input, campus: p.campus };
  const res = spec.execute(input);
  const scoped = scopeRecords(p, tool, res.records);
  return { denied: false, records: scoped.records, redacted: scoped.redactedCount };
}

beforeAll(async () => {
  await ensureDb();
});

describe("role pipeline (authorize -> force -> execute -> scope)", () => {
  it("a FWGS head cannot see an FSK employee's leave", () => {
    const out = runTool({ role: "CAMPUS_HEAD", campus: "FWGS" }, "getLeaveBalance", {
      employeeName: "Priya",
    });
    expect(out.denied).toBe(false);
    expect(out.records).toHaveLength(0);
    expect(out.redacted).toBeGreaterThan(0);
  });

  it("an FSK head only sees FSK pending requests", () => {
    const out = runTool({ role: "CAMPUS_HEAD", campus: "FSK" }, "getPendingHRRequests", {
      days: 7,
    });
    expect(out.denied).toBe(false);
    expect(out.records.length).toBeGreaterThan(0);
    for (const r of out.records) expect(r.campus).toBe("FSK");
  });

  it("a CAMPUS_HEAD's campus argument is forced to their own campus", () => {
    const out = runTool({ role: "CAMPUS_HEAD", campus: "FSK" }, "getEmployeesByCampus", {
      campus: "FWGS",
    });
    expect(out.records.length).toBeGreaterThan(0);
    for (const r of out.records) expect(r.campus).toBe("FSK");
  });

  it("an EMPLOYEE is denied directory tools but can read their own leave", () => {
    const ramesh: Principal = { role: "EMPLOYEE", employeeName: "Ramesh Iyer" };
    expect(runTool(ramesh, "getEmployeesByCampus", { campus: "FSK" }).denied).toBe(true);

    const own = runTool(ramesh, "getLeaveBalance", { employeeName: "Ramesh" });
    expect(own.records.length).toBeGreaterThan(0);

    const other = runTool(ramesh, "getLeaveBalance", { employeeName: "Priya" });
    expect(other.records).toHaveLength(0);
    expect(other.redacted).toBeGreaterThan(0);
  });

  it("every role can enumerate campuses via getCampuses", () => {
    for (const p of [
      { role: "HR_ADMIN" } as Principal,
      { role: "CAMPUS_HEAD", campus: "FSK" } as Principal,
      { role: "EMPLOYEE", employeeName: "Ramesh Iyer" } as Principal,
    ]) {
      expect(runTool(p, "getCampuses").records).toHaveLength(3);
    }
  });
});
