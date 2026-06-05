import Anthropic from "@anthropic-ai/sdk";
import { hasAccess, type Role } from "./auth";
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

function systemPrompt(role: Role): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are 'Ask HR', an assistant for a multi-campus school HR system.",
    `Today's date is ${today}. The current user's role is ${role}.`,
    "",
    "RULES:",
    "- You can ONLY obtain data by calling the provided tools. You must never invent employee data, leave balances, managers, requests, or policy text.",
    "- Use the smallest set of tools needed to answer the question, then give a concise, direct answer.",
    "- For policy questions, rely on the policy tool and ALWAYS cite the policy source returned (e.g. the section/document name). If no policy is found, say so plainly.",
    "- If a tool returns no records, tell the user the information was not found rather than guessing.",
    "- If a tool is denied because the user's role lacks permission, explain that the data requires HR_ADMIN or CAMPUS_HEAD access and do not attempt to work around it.",
    "- Campus codes include FSK (Fountainhead School Koba) and FWGS (Fountainhead World Green School).",
    "- Keep answers focused. If you are uncertain or the data is incomplete, say so explicitly.",
  ].join("\n");
}

/**
 * Runs the Ask HR agent loop:
 *   user query → Claude picks a safe tool → backend validates role + executes
 *   → result fed back to Claude → Claude writes the final answer.
 */
export async function askHr(query: string, role: Role): Promise<AskResult> {
  const anthropic = getClient();

  // Initialise the (read-only) database before any tool can run.
  await ensureDb();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: query },
  ];

  const toolsUsed: ToolInvocation[] = [];
  const sources: Record<string, unknown>[] = [];
  const sourceLabels = new Set<string>();
  let sawEmptyResult = false;

  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: systemPrompt(role),
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

      // Backend permission validation BEFORE executing anything.
      if (!hasAccess(role, spec.requiredRoles)) {
        const required = (spec.requiredRoles ?? []).join(" or ");
        toolsUsed.push({
          tool: block.name,
          input,
          allowed: false,
          recordCount: 0,
          note: `Access denied (requires ${required}).`,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `ACCESS DENIED: "${block.name}" requires role ${required}. The current user is ${role}.`,
        });
        continue;
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

      toolsUsed.push({
        tool: block.name,
        input,
        allowed: true,
        recordCount: result.records.length,
        note: result.note,
      });
      for (const rec of result.records) sources.push({ _tool: block.name, ...rec });
      if (result.source) sourceLabels.add(result.source);
      if (result.records.length === 0) sawEmptyResult = true;

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(
          { records: result.records, note: result.note ?? null, source: result.source },
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
    confidence = "Some data was withheld because the current role lacks permission.";
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
