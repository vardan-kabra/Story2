import { getDb } from "./db";
import { getPolicyByTopic as lookupPolicy, type Policy } from "./policies";

/**
 * The "safe query layer".
 *
 * Each exported function is a parameterised, allow-listed query. Claude can
 * only ask the backend to run one of THESE functions (via the tool layer) — it
 * never generates or executes SQL. All statements are parameterised, so user
 * input is never interpolated into SQL text.
 *
 * Every function returns a `QueryResult`:
 *   - `records`: rows suitable for display in a table AND for sending back to
 *     Claude as grounding data.
 *   - `note`: an optional human-readable note (e.g. "no records found").
 *   - `source`: where the data came from (table name / policy document).
 */
export interface QueryResult {
  records: Record<string, unknown>[];
  note?: string;
  source: string;
}

export interface EmployeeFilters {
  joiningDateAfter?: string; // ISO date (YYYY-MM-DD); matches joining_date > value
  joiningDateBefore?: string; // ISO date (YYYY-MM-DD); matches joining_date < value
  role?: string;
  department?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function resolveCampusId(campus: string): { id: number; code: string; name: string } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, code, name FROM campuses
       WHERE code = ? COLLATE NOCASE OR name = ? COLLATE NOCASE`,
    )
    .get(campus, campus) as { id: number; code: string; name: string } | undefined;
  return row ?? null;
}

interface EmployeeRow {
  id: number;
  name: string;
  email: string | null;
  campus: string | null;
  department: string | null;
  role: string | null;
  joining_date: string | null;
  manager: string | null;
  // Rows double as display/grounding records.
  [key: string]: unknown;
}

const EMPLOYEE_SELECT = `
  SELECT
    e.id            AS id,
    e.name          AS name,
    e.email         AS email,
    c.code          AS campus,
    e.department    AS department,
    e.role          AS role,
    e.joining_date  AS joining_date,
    m.name          AS manager
  FROM employees e
  LEFT JOIN campuses c  ON c.id = e.campus_id
  LEFT JOIN employees m ON m.id = e.manager_id
`;

// ── safe queries ─────────────────────────────────────────────────────────────

/** Looks up employees whose name matches (case-insensitive, partial). */
export function getEmployeeByName(name: string): QueryResult {
  const db = getDb();
  const rows = db
    .prepare(`${EMPLOYEE_SELECT} WHERE e.name LIKE ? COLLATE NOCASE ORDER BY e.name`)
    .all(`%${name}%`) as EmployeeRow[];

  return {
    records: rows,
    source: "employees",
    note: rows.length === 0 ? `No employee found matching "${name}".` : undefined,
  };
}

/** Returns leave balances (casual/sick/earned) for an employee by name. */
export function getLeaveBalance(employeeName: string): QueryResult {
  const db = getDb();
  const employees = db
    .prepare(
      `SELECT e.id AS id, e.name AS name, c.code AS campus
       FROM employees e LEFT JOIN campuses c ON c.id = e.campus_id
       WHERE e.name LIKE ? COLLATE NOCASE ORDER BY e.name`,
    )
    .all(`%${employeeName}%`) as { id: number; name: string; campus: string | null }[];

  if (employees.length === 0) {
    return { records: [], source: "leave_balances", note: `No employee found matching "${employeeName}".` };
  }

  const stmt = db.prepare(
    `SELECT leave_type, entitled, used, remaining
     FROM leave_balances WHERE employee_id = ? ORDER BY leave_type`,
  );

  const records: Record<string, unknown>[] = [];
  for (const emp of employees) {
    const balances = stmt.all(emp.id) as {
      leave_type: string;
      entitled: number;
      used: number;
      remaining: number;
    }[];
    for (const b of balances) {
      records.push({ employee: emp.name, campus: emp.campus, ...b });
    }
  }

  return {
    records,
    source: "leave_balances",
    note: records.length === 0 ? `No leave balance records for "${employeeName}".` : undefined,
  };
}

/** Lists employees at a campus, with optional joining-date/role/department filters. */
export function getEmployeesByCampus(campus: string, filters: EmployeeFilters = {}): QueryResult {
  const resolved = resolveCampusId(campus);
  if (!resolved) {
    return { records: [], source: "employees", note: `No campus found matching "${campus}".` };
  }

  const db = getDb();
  const where: string[] = ["e.campus_id = ?"];
  const params: unknown[] = [resolved.id];

  if (filters.joiningDateAfter) {
    where.push("e.joining_date > ?");
    params.push(filters.joiningDateAfter);
  }
  if (filters.joiningDateBefore) {
    where.push("e.joining_date < ?");
    params.push(filters.joiningDateBefore);
  }
  if (filters.role) {
    where.push("e.role = ? COLLATE NOCASE");
    params.push(filters.role);
  }
  if (filters.department) {
    where.push("e.department = ? COLLATE NOCASE");
    params.push(filters.department);
  }

  const rows = db
    .prepare(`${EMPLOYEE_SELECT} WHERE ${where.join(" AND ")} ORDER BY e.joining_date, e.name`)
    .all(...params) as EmployeeRow[];

  return {
    records: rows,
    source: `employees (campus ${resolved.code})`,
    note: rows.length === 0 ? `No employees matched the given filters at ${resolved.code}.` : undefined,
  };
}

/** Lists employees in a department (across campuses). */
export function getEmployeesByDepartment(department: string): QueryResult {
  const db = getDb();
  const rows = db
    .prepare(`${EMPLOYEE_SELECT} WHERE e.department = ? COLLATE NOCASE ORDER BY c.code, e.name`)
    .all(department) as EmployeeRow[];

  return {
    records: rows,
    source: "employees",
    note: rows.length === 0 ? `No employees found in department "${department}".` : undefined,
  };
}

/** Returns the reporting manager for an employee. */
export function getReportingManager(employeeName: string): QueryResult {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         e.name        AS employee,
         c.code        AS campus,
         m.name        AS manager,
         m.role        AS manager_role,
         m.email       AS manager_email
       FROM employees e
       LEFT JOIN employees m ON m.id = e.manager_id
       LEFT JOIN campuses c  ON c.id = e.campus_id
       WHERE e.name LIKE ? COLLATE NOCASE
       ORDER BY e.name`,
    )
    .all(`%${employeeName}%`) as Record<string, unknown>[];

  if (rows.length === 0) {
    return { records: [], source: "employees", note: `No employee found matching "${employeeName}".` };
  }

  const withoutManager = rows.filter((r) => !r.manager);
  const note =
    withoutManager.length === rows.length
      ? `${rows[0].employee} has no reporting manager on record (top of hierarchy).`
      : undefined;

  return { records: rows, source: "employees", note };
}

/** Returns the direct reports of a manager. */
export function getDirectReports(managerName: string): QueryResult {
  const db = getDb();
  const managers = db
    .prepare(`SELECT id, name FROM employees WHERE name LIKE ? COLLATE NOCASE`)
    .all(`%${managerName}%`) as { id: number; name: string }[];

  if (managers.length === 0) {
    return { records: [], source: "employees", note: `No manager found matching "${managerName}".` };
  }

  const stmt = db.prepare(
    `${EMPLOYEE_SELECT} WHERE e.manager_id = ? ORDER BY e.name`,
  );

  const records: Record<string, unknown>[] = [];
  for (const mgr of managers) {
    const reports = stmt.all(mgr.id) as EmployeeRow[];
    for (const r of reports) records.push({ ...r, reports_to: mgr.name });
  }

  return {
    records,
    source: "employees",
    note: records.length === 0 ? `No employees report to "${managerName}".` : undefined,
  };
}

/** Returns HR requests still pending for more than `days` days. */
export function getPendingHRRequests(days: number): QueryResult {
  const db = getDb();
  const minDays = Number.isFinite(days) ? days : 7;

  const rows = db
    .prepare(
      `SELECT
         r.id              AS request_id,
         e.name            AS employee,
         c.code            AS campus,
         r.request_type    AS request_type,
         r.status          AS status,
         r.submitted_date  AS submitted_date,
         CAST(julianday('now') - julianday(r.submitted_date) AS INTEGER) AS days_pending,
         r.details         AS details
       FROM hr_requests r
       LEFT JOIN employees e ON e.id = r.employee_id
       LEFT JOIN campuses c  ON c.id = e.campus_id
       WHERE r.status = 'pending'
         AND julianday('now') - julianday(r.submitted_date) > ?
       ORDER BY days_pending DESC`,
    )
    .all(minDays) as Record<string, unknown>[];

  return {
    records: rows,
    source: "hr_requests",
    note: rows.length === 0 ? `No pending HR requests older than ${minDays} days.` : undefined,
  };
}

/** Retrieves HR policy entries for a topic from the policy knowledge base. */
export function getPolicyByTopic(topic: string): QueryResult {
  const policies: Policy[] = lookupPolicy(topic);

  if (policies.length === 0) {
    return {
      records: [],
      source: "hrPolicies.json",
      note: `No HR policy found for topic "${topic}".`,
    };
  }

  return {
    records: policies.map((p) => ({
      title: p.title,
      source: p.source,
      content: p.content,
    })),
    source: policies.map((p) => p.source).join("; "),
  };
}

/** Summarises remaining leave per employee for a campus (optionally a role). */
export function summarizeLeaveStatus(campus: string, role?: string): QueryResult {
  const resolved = resolveCampusId(campus);
  if (!resolved) {
    return { records: [], source: "leave_balances", note: `No campus found matching "${campus}".` };
  }

  const db = getDb();
  const params: unknown[] = [resolved.id];
  let roleClause = "";
  if (role) {
    roleClause = "AND e.role = ? COLLATE NOCASE";
    params.push(role);
  }

  const rows = db
    .prepare(
      `SELECT
         e.name AS employee,
         e.role AS role,
         SUM(CASE WHEN lb.leave_type = 'casual' THEN lb.remaining ELSE 0 END) AS casual_remaining,
         SUM(CASE WHEN lb.leave_type = 'sick'   THEN lb.remaining ELSE 0 END) AS sick_remaining,
         SUM(CASE WHEN lb.leave_type = 'earned' THEN lb.remaining ELSE 0 END) AS earned_remaining
       FROM employees e
       LEFT JOIN leave_balances lb ON lb.employee_id = e.id
       WHERE e.campus_id = ? ${roleClause}
       GROUP BY e.id
       ORDER BY e.name`,
    )
    .all(...params) as Record<string, unknown>[];

  const note =
    rows.length === 0
      ? `No employees${role ? ` with role "${role}"` : ""} found at ${resolved.code}.`
      : undefined;

  return { records: rows, source: `leave_balances (campus ${resolved.code})`, note };
}
