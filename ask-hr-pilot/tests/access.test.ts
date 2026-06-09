import { describe, it, expect } from "vitest";
import {
  authorizeTool,
  scopeRecords,
  shouldForceCampus,
  type Principal,
} from "../lib/access";

const admin: Principal = { role: "HR_ADMIN" };
const fskHead: Principal = { role: "CAMPUS_HEAD", campus: "FSK" };
const emp: Principal = { role: "EMPLOYEE", employeeName: "Ramesh Iyer" };

describe("authorizeTool", () => {
  it("lets HR_ADMIN use elevated tools", () => {
    expect(authorizeTool(admin, "getPendingHRRequests").allowed).toBe(true);
    expect(authorizeTool(admin, "summarizeLeaveStatus").allowed).toBe(true);
  });

  it("blocks EMPLOYEE from directory / org-wide tools", () => {
    expect(authorizeTool(emp, "getEmployeesByCampus").allowed).toBe(false);
    expect(authorizeTool(emp, "getDirectReports").allowed).toBe(false);
    expect(authorizeTool(emp, "getPendingHRRequests").allowed).toBe(false);
  });

  it("allows EMPLOYEE personal + general reference tools", () => {
    for (const t of [
      "getEmployeeByName",
      "getLeaveBalance",
      "getReportingManager",
      "getPolicyByTopic",
      "getCampuses",
    ]) {
      expect(authorizeTool(emp, t).allowed).toBe(true);
    }
  });

  it("denies EMPLOYEE personal tools when no identity is set", () => {
    expect(authorizeTool({ role: "EMPLOYEE" }, "getLeaveBalance").allowed).toBe(false);
  });

  it("requires a campus for CAMPUS_HEAD on scoped tools, but not general ones", () => {
    const noCampus: Principal = { role: "CAMPUS_HEAD" };
    expect(authorizeTool(noCampus, "getEmployeesByCampus").allowed).toBe(false);
    expect(authorizeTool(noCampus, "getPolicyByTopic").allowed).toBe(true);
    expect(authorizeTool(noCampus, "getCampuses").allowed).toBe(true);
  });
});

describe("shouldForceCampus", () => {
  it("forces campus only for CAMPUS_HEAD on campus-input tools", () => {
    expect(shouldForceCampus(fskHead, "getEmployeesByCampus")).toBe(true);
    expect(shouldForceCampus(fskHead, "summarizeLeaveStatus")).toBe(true);
    expect(shouldForceCampus(fskHead, "getLeaveBalance")).toBe(false);
    expect(shouldForceCampus(admin, "getEmployeesByCampus")).toBe(false);
  });
});

describe("scopeRecords", () => {
  const empRows = [
    { employee: "Priya Menon", campus: "FSK" },
    { employee: "Arjun Rao", campus: "FWGS" },
  ];

  it("HR_ADMIN sees all records", () => {
    expect(scopeRecords(admin, "getLeaveBalance", empRows).records).toHaveLength(2);
  });

  it("CAMPUS_HEAD keeps only their own campus", () => {
    const out = scopeRecords(fskHead, "getLeaveBalance", empRows);
    expect(out.records).toEqual([{ employee: "Priya Menon", campus: "FSK" }]);
    expect(out.redactedCount).toBe(1);
  });

  it("EMPLOYEE keeps only records about themselves", () => {
    const out = scopeRecords(emp, "getLeaveBalance", [
      { employee: "Ramesh Iyer", campus: "FSK" },
      { employee: "Priya Menon", campus: "FSK" },
    ]);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].employee).toBe("Ramesh Iyer");
    expect(out.redactedCount).toBe(1);
  });

  it("treats policies and the campus list as general (unscoped) for all roles", () => {
    const policies = [{ title: "Maternity", source: "Manual" }];
    const campuses = [{ code: "FSK" }, { code: "FWGS" }, { code: "FHQ" }];
    for (const p of [fskHead, emp]) {
      expect(scopeRecords(p, "getPolicyByTopic", policies).records).toHaveLength(1);
      expect(scopeRecords(p, "getCampuses", campuses).records).toHaveLength(3);
    }
  });
});
