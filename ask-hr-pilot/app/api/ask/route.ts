import { NextResponse } from "next/server";
import { askHr } from "@/lib/anthropic";
import { isRole, type Role } from "@/lib/auth";

// better-sqlite3 + the Anthropic SDK need the Node.js runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { query, role, campus, employeeName } = (body ?? {}) as {
    query?: unknown;
    role?: unknown;
    campus?: unknown;
    employeeName?: unknown;
  };

  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "A non-empty 'query' string is required." }, { status: 400 });
  }

  // Default to the least-privileged role if none/invalid is supplied.
  // In production this principal would come from the authenticated Nucleus
  // session, not from the request body.
  const resolvedRole: Role = isRole(role) ? role : "EMPLOYEE";
  const principal = {
    role: resolvedRole,
    campus: resolvedRole === "CAMPUS_HEAD" && typeof campus === "string" ? campus : null,
    employeeName:
      resolvedRole === "EMPLOYEE" && typeof employeeName === "string" ? employeeName : null,
  };

  try {
    const result = await askHr(query.trim(), principal);
    return NextResponse.json({
      answer: result.answer,
      toolsUsed: result.toolsUsed,
      sources: result.sources,
      sourceLabels: result.sourceLabels,
      confidence: result.confidence,
      role: resolvedRole,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    // Surface configuration errors (missing key / unseeded DB) clearly to the UI.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
