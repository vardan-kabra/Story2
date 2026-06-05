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
  response: AskResponse;
  at: string; // ISO timestamp
}
