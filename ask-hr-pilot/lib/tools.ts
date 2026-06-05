import type Anthropic from "@anthropic-ai/sdk";
import type { Role } from "./auth";
import * as q from "./safeQueries";
import type { QueryResult } from "./safeQueries";

/**
 * The allow-listed tool surface exposed to Claude.
 *
 * Each entry pairs:
 *   - `definition`: the JSON-schema tool description Claude sees.
 *   - `execute`: the backend safe-query function that actually runs.
 *   - `requiredRoles`: roles permitted to invoke it (undefined = open to all).
 *
 * Claude can ONLY pick from these tools. It cannot craft SQL or call anything
 * outside this registry. The backend validates `requiredRoles` before running
 * `execute`.
 */
export interface ToolSpec {
  definition: Anthropic.Tool;
  execute: (input: Record<string, unknown>) => QueryResult;
  requiredRoles?: Role[];
}

// Sensitive, organisation-wide views require elevated roles.
const ELEVATED: Role[] = ["HR_ADMIN", "CAMPUS_HEAD"];

export const TOOLS: Record<string, ToolSpec> = {
  getEmployeeByName: {
    definition: {
      name: "getEmployeeByName",
      description:
        "Look up an employee's profile (campus, department, role, joining date, reporting manager) by name. Supports partial, case-insensitive matches.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full or partial employee name." },
        },
        required: ["name"],
      },
    },
    execute: (i) => q.getEmployeeByName(String(i.name ?? "")),
  },

  getLeaveBalance: {
    definition: {
      name: "getLeaveBalance",
      description:
        "Get the leave balances (casual, sick, earned: entitled/used/remaining) for an employee by name.",
      input_schema: {
        type: "object",
        properties: {
          employeeName: { type: "string", description: "Full or partial employee name." },
        },
        required: ["employeeName"],
      },
    },
    execute: (i) => q.getLeaveBalance(String(i.employeeName ?? "")),
  },

  getEmployeesByCampus: {
    definition: {
      name: "getEmployeesByCampus",
      description:
        "List employees at a campus (by campus code such as FSK or FWGS, or by full campus name). Optional filters: joiningDateAfter / joiningDateBefore (ISO dates YYYY-MM-DD; for 'after April 2025' use 2025-04-30), role, and department.",
      input_schema: {
        type: "object",
        properties: {
          campus: { type: "string", description: "Campus code (e.g. FSK, FWGS) or full name." },
          joiningDateAfter: {
            type: "string",
            description: "ISO date YYYY-MM-DD. Returns employees whose joining_date is strictly after this date.",
          },
          joiningDateBefore: {
            type: "string",
            description: "ISO date YYYY-MM-DD. Returns employees whose joining_date is strictly before this date.",
          },
          role: { type: "string", description: "Filter by role, e.g. 'Teacher'." },
          department: { type: "string", description: "Filter by department, e.g. 'Teaching'." },
        },
        required: ["campus"],
      },
    },
    execute: (i) =>
      q.getEmployeesByCampus(String(i.campus ?? ""), {
        joiningDateAfter: i.joiningDateAfter ? String(i.joiningDateAfter) : undefined,
        joiningDateBefore: i.joiningDateBefore ? String(i.joiningDateBefore) : undefined,
        role: i.role ? String(i.role) : undefined,
        department: i.department ? String(i.department) : undefined,
      }),
  },

  getEmployeesByDepartment: {
    definition: {
      name: "getEmployeesByDepartment",
      description: "List employees in a given department (e.g. 'Teaching', 'Administration') across all campuses.",
      input_schema: {
        type: "object",
        properties: {
          department: { type: "string", description: "Department name." },
        },
        required: ["department"],
      },
    },
    execute: (i) => q.getEmployeesByDepartment(String(i.department ?? "")),
  },

  getReportingManager: {
    definition: {
      name: "getReportingManager",
      description: "Find the reporting manager (and their role) for an employee by name.",
      input_schema: {
        type: "object",
        properties: {
          employeeName: { type: "string", description: "Full or partial employee name." },
        },
        required: ["employeeName"],
      },
    },
    execute: (i) => q.getReportingManager(String(i.employeeName ?? "")),
  },

  getDirectReports: {
    definition: {
      name: "getDirectReports",
      description: "List the direct reports of a manager by name (who reports to this person).",
      input_schema: {
        type: "object",
        properties: {
          managerName: { type: "string", description: "Full or partial manager name." },
        },
        required: ["managerName"],
      },
    },
    execute: (i) => q.getDirectReports(String(i.managerName ?? "")),
  },

  getPendingHRRequests: {
    definition: {
      name: "getPendingHRRequests",
      description:
        "List HR requests that have been pending for more than a given number of days. SENSITIVE: organisation-wide view.",
      input_schema: {
        type: "object",
        properties: {
          days: {
            type: "integer",
            description: "Minimum number of days a request must have been pending. Defaults to 7 if unspecified.",
          },
        },
        required: ["days"],
      },
    },
    execute: (i) => q.getPendingHRRequests(Number(i.days ?? 7)),
    requiredRoles: ELEVATED,
  },

  getPolicyByTopic: {
    definition: {
      name: "getPolicyByTopic",
      description:
        "Retrieve HR policy entries for a topic (e.g. 'maternity leave', 'reimbursement documents', 'casual leave') from the policy knowledge base. Each result includes its source citation.",
      input_schema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The policy topic or question keywords." },
        },
        required: ["topic"],
      },
    },
    execute: (i) => q.getPolicyByTopic(String(i.topic ?? "")),
  },

  summarizeLeaveStatus: {
    definition: {
      name: "summarizeLeaveStatus",
      description:
        "Summarise remaining leave (casual/sick/earned) for all employees at a campus, optionally filtered by role (e.g. 'Teacher'). SENSITIVE: campus-wide summary.",
      input_schema: {
        type: "object",
        properties: {
          campus: { type: "string", description: "Campus code (e.g. FSK, FWGS) or full name." },
          role: { type: "string", description: "Optional role filter, e.g. 'Teacher'." },
        },
        required: ["campus"],
      },
    },
    execute: (i) =>
      q.summarizeLeaveStatus(String(i.campus ?? ""), i.role ? String(i.role) : undefined),
    requiredRoles: ELEVATED,
  },
};

/** Tool definitions to pass to the Claude API. */
export function toolDefinitions(): Anthropic.Tool[] {
  return Object.values(TOOLS).map((t) => t.definition);
}
