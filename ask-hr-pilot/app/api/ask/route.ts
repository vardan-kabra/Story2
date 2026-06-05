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

  const { query, role } = (body ?? {}) as { query?: unknown; role?: unknown };

  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "A non-empty 'query' string is required." }, { status: 400 });
  }

  // Default to the least-privileged role if none/invalid is supplied.
  const resolvedRole: Role = isRole(role) ? role : "EMPLOYEE";

  try {
    const result = await askHr(query.trim(), resolvedRole);
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
