import { describe, it, expect, beforeAll } from "vitest";
import { ensureDb } from "../lib/db";
import * as q from "../lib/safeQueries";

// Requires data/ask-hr.db — `npm test` seeds it via the pretest script.
beforeAll(async () => {
  await ensureDb();
});

describe("safe query layer", () => {
  it("getCampuses returns all three campuses", () => {
    const codes = q.getCampuses().records.map((r) => r.code).sort();
    expect(codes).toEqual(["FHQ", "FSK", "FWGS"]);
  });

  it("getLeaveBalance reports Priya's casual balance (7) with her campus", () => {
    const casual = q
      .getLeaveBalance("Priya")
      .records.find((r) => r.leave_type === "casual") as Record<string, unknown>;
    expect(casual.remaining).toBe(7);
    expect(casual.campus).toBe("FSK");
  });

  it("getReportingManager resolves Ramesh -> Meera Nair", () => {
    const rec = q.getReportingManager("Ramesh").records[0];
    expect(rec.manager).toBe("Meera Nair");
  });

  it("getEmployeesByCampus(FWGS, after Apr 2025) returns the right joiners in date order", () => {
    const names = q
      .getEmployeesByCampus("FWGS", { joiningDateAfter: "2025-04-30" })
      .records.map((r) => r.name);
    expect(names).toEqual(["Kavya Reddy", "Arjun Rao", "Anil Kumar"]);
  });

  it("getDirectReports(Ankita) returns her three reports", () => {
    const names = q
      .getDirectReports("Ankita")
      .records.map((r) => r.name)
      .sort();
    expect(names).toEqual(["Meera Nair", "Pooja Shah", "Vikram Desai"]);
  });

  it("getPendingHRRequests(7) returns only requests pending more than 7 days", () => {
    const rows = q.getPendingHRRequests(7).records;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Number(r.days_pending)).toBeGreaterThan(7);
  });

  it("getPolicyByTopic finds the maternity policy with a source", () => {
    const rec = q.getPolicyByTopic("maternity leave").records[0];
    expect(rec.title).toBe("Maternity Leave Policy");
    expect(String(rec.source)).toContain("Maternity Leave");
  });

  it("getPolicyByTopic returns nothing + a note for an unknown topic", () => {
    const res = q.getPolicyByTopic("pet insurance");
    expect(res.records).toHaveLength(0);
    expect(res.note).toMatch(/No HR policy/i);
  });
});
