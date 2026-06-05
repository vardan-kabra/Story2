// Shared, dependency-free types used by both the API and the client UI.

export type Role = "HR_ADMIN" | "CAMPUS_HEAD" | "EMPLOYEE";

export interface ToolInvocation {
  tool: string;
  input: Record<string, unknown>;
  allowed: boolean;
  recordCount: number;
  note?: string;
}

export interface AskResponse {
  answer: string;
  toolsUsed: ToolInvocation[];
  sources: Record<string, unknown>[];
  sourceLabels: string[];
  confidence: string | null;
  role: Role;
}

export interface HistoryEntry {
  id: string;
  query: string;
  role: Role;
  campus: string | null;
  employeeName: string | null;
  response: AskResponse;
  at: string; // ISO timestamp
}

/** Campus codes available in the demo (stand-in for Nucleus campus list). */
export const CAMPUSES: { code: string; name: string }[] = [
  { code: "FSK", name: "Fountainhead School Koba" },
  { code: "FWGS", name: "Fountainhead World Green School" },
  { code: "FHQ", name: "Fountainhead Corporate Office" },
];

/** Employee identities available in the demo (stand-in for Nucleus users). */
export const EMPLOYEES: string[] = [
  "Ankita Sharma",
  "Meera Nair",
  "Vikram Desai",
  "Priya Menon",
  "Ramesh Iyer",
  "Sneha Patel",
  "Arjun Rao",
  "Kavya Reddy",
  "Rohan Gupta",
  "Divya Krishnan",
  "Anil Kumar",
  "Neha Joshi",
  "Suresh Pillai",
  "Pooja Shah",
  "Manoj Verma",
];
