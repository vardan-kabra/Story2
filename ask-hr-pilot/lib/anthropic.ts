import Anthropic from "@anthropic-ai/sdk";
import { hasAccess } from "./auth";
import {
  authorizeTool,
  describeScope,
  scopeRecords,
  shouldForceCampus,
  type Principal,
} from "./access";
import { ensureDb } from "./db";
import { TOOLS, toolDefinitions } from "./tools";

const MODEL = process.env.ASK_HR_MODEL || "claude-opus-4-8";
const MAX_TOOL_ITERATIONS = 5;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  if (!client) client = new Anthropic();
  return client;
}

export interface ToolInvocation {
  tool: string;
  input: Record<string, unknown>;
  allowed: boolean;
  recordCount: number;
  note?: string;
}

export interface AskResult {
  answer: string;
  toolsUsed: ToolInvocation[];
  /** Flattened source records gathered from the safe queries, for the UI table. */
  sources: Record<string, unknown>[];
  /** Distinct data sources / policy citations consulted. */
  sourceLabels: string[];
  /** Optional uncertainty / confidence note. */
  confidence: string | null;
}

function systemPrompt(principal: Principal): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are 'Ask HR', an assistant for a multi-campus school HR system.",
    `Today's date is ${today}. The current user's role is ${principal.role}.`,
    "",
    `ACCESS SCOPE: ${describeScope(principal)}`,
    "",
    "RULES:",
    "- You can ONLY obtain data by calling the provided tools. You must never invent employee data, leave balances, managers, requests, or policy text.",
    "- Use the smallest set of tools needed to answer the question, then give a concise, direct answer.",
    "- For policy questions, rely on the policy tool and ALWAYS cite the policy source returned (e.g. the section/document name). If no policy is found, say so plainly.",
    "- If a tool returns no records, tell the user the information was not found rather than guessing.",
    "- If a tool is denied or records are hidden because of the access scope above, explain the restriction to the user and do not attempt to work around it.",
    "- Tool results are already filtered to what this user is allowed to see; treat anything not returned as not visible to them.",
    "- To answer questions that span multiple or all campuses, FIRST call getCampuses to enumerate every campus, then query each one — never assume which campuses exist.",
    "- Keep answers focused. If you are uncertain or the data is incomplete, say so explicitly.",
  ].join("\n");
}

/**
 * Runs the Ask HR agent loop:
 *   user query → Claude picks a safe tool → backend validates role + executes
 *   → result fed back to Claude → Claude writes the final answer.
 */
export async function askHr(query: string, principal: Principal): Promise<AskResult> {
  const anthropic = getClient();
  const role = principal.role;

  // Initialise the (read-only) database before any tool can run.
  await ensureDb();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: query },
  ];

  const toolsUsed: ToolInvocation[] = [];
  const sources: Record<string, unknown>[] = [];
  const sourceLabels = new Set<string>();
  let sawEmptyResult = false;
  let totalRedacted = 0;

  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: systemPrompt(principal),
      tools: toolDefinitions(),
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    // Preserve the full assistant turn (including thinking + tool_use blocks).
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const spec = TOOLS[block.name];
      const input = (block.input ?? {}) as Record<string, unknown>;

      // Unknown tool (should not happen given the allow-list).
      if (!spec) {
        toolsUsed.push({ tool: block.name, input, allowed: false, recordCount: 0, note: "Unknown tool." });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Tool "${block.name}" is not available.`,
        });
        continue;
      }

      // Backend permission validation BEFORE executing anything:
      //   (1) coarse elevated-role gate from the tool registry, plus
      //   (2) principal-aware authorization (EMPLOYEE allow-list / campus set).
      const coarseOk = hasAccess(role, spec.requiredRoles);
      const fine = authorizeTool(principal, block.name);
      if (!coarseOk || !fine.allowed) {
        const reason = !coarseOk
          ? `requires role ${(spec.requiredRoles ?? []).join(" or ")}`
          : fine.reason;
        toolsUsed.push({
          tool: block.name,
          input,
          allowed: false,
          recordCount: 0,
          note: `Access denied: ${reason}`,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `ACCESS DENIED for "${block.name}" (user is ${role}): ${reason}.`,
        });
        continue;
      }

      // CAMPUS_HEAD: force any campus argument to their own campus.
      if (shouldForceCampus(principal, block.name) && principal.campus) {
        input.campus = principal.campus;
      }

      // Execute the approved safe query.
      let result;
      try {
        result = spec.execute(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolsUsed.push({ tool: block.name, input, allowed: true, recordCount: 0, note: `Error: ${message}` });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Error running "${block.name}": ${message}`,
        });
        continue;
      }

      // Data-level scoping: drop records the principal isn't allowed to see.
      const scoped = scopeRecords(principal, block.name, result.records);
      if (scoped.redactedCount > 0) totalRedacted += scoped.redactedCount;

      const notes: string[] = [];
      if (result.note) notes.push(result.note);
      if (scoped.redactedCount > 0) {
        notes.push(
          `${scoped.redactedCount} record(s) hidden by your access scope (${describeScope(principal)})`,
        );
      }
      const note = notes.length ? notes.join(" ") : undefined;

      toolsUsed.push({
        tool: block.name,
        input,
        allowed: true,
        recordCount: scoped.records.length,
        note,
      });
      for (const rec of scoped.records) sources.push({ _tool: block.name, ...rec });
      if (result.source) sourceLabels.add(result.source);
      if (scoped.records.length === 0) sawEmptyResult = true;

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(
          { records: scoped.records, note: note ?? null, source: result.source },
          null,
          2,
        ),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText =
      "I wasn't able to produce an answer within the allowed number of steps. Please try rephrasing your question.";
  }

  // Lightweight confidence/uncertainty note (in addition to anything Claude said).
  let confidence: string | null = null;
  const deniedTools = toolsUsed.filter((t) => !t.allowed);
  if (toolsUsed.length === 0) {
    confidence = "No data tools were used — this answer is not grounded in the HR database.";
  } else if (deniedTools.length > 0) {
    confidence = `Some data was withheld: your ${role} access scope does not permit it.`;
  } else if (totalRedacted > 0) {
    confidence = `${totalRedacted} record(s) were hidden by your ${role} access scope.`;
  } else if (sawEmptyResult && sources.length === 0) {
    confidence = "No matching records were found, so the answer may be incomplete.";
  }

  return {
    answer: finalText,
    toolsUsed,
    sources,
    sourceLabels: [...sourceLabels],
    confidence,
  };
}
