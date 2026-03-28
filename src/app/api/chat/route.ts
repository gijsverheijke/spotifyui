import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { MinimaxProvider } from "@/lib/ai/providers/minimax";
import { Orchestrator, type ToolHandler } from "@/lib/ai/orchestrator";
import { getSession } from "@/lib/auth/session";
import { executeTool, spotifyTools } from "@/lib/spotify/tools";

type ChatModel = "minimax" | "anthropic";

interface ChatRequestBody {
  message?: unknown;
  sessionId?: unknown;
  model?: unknown;
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function getProvider(model: ChatModel) {
  if (model === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    return new AnthropicProvider(apiKey);
  }

  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not configured");
  }
  return new MinimaxProvider(apiKey);
}

function buildToolHandlers(): ToolHandler[] {
  return spotifyTools.map((definition) => ({
    definition,
    execute: async (args, spotify) => {
      const result = await executeTool(spotify, definition.name, args);
      return JSON.stringify(result);
    },
  }));
}

function getAssistantMessage(content: string, html: string | null): string {
  const text = content.replace(/```html\s*[\s\S]*?```/g, "").trim();
  if (text) {
    return text;
  }

  if (html) {
    return "Generated a page for you.";
  }

  return "Done.";
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonError(400, "Missing request body");
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const model = body.model;

  if (!message) {
    return jsonError(400, "Missing message");
  }

  if (!sessionId) {
    return jsonError(400, "Missing sessionId");
  }

  if (model !== "minimax" && model !== "anthropic") {
    return jsonError(400, "Invalid model");
  }

  const session = getSession(sessionId);
  if (!session) {
    return jsonError(401, "Invalid session");
  }

  try {
    const provider = getProvider(model);
    const orchestrator = new Orchestrator(
      provider,
      buildToolHandlers(),
      session.client,
    );
    const result = await orchestrator.chat(message, session.messages);

    session.messages = result.messages;

    const lastAssistantMessage =
      result.messages.findLast((entry) => entry.role === "assistant")?.content ?? "";

    return Response.json({
      message: getAssistantMessage(lastAssistantMessage, result.html),
      html: result.html,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Chat request failed";
    return jsonError(500, message);
  }
}
