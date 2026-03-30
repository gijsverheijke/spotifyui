import type { AIProvider, AIMessage, ToolDefinition, ToolCall } from "./types";
import type { SpotifyClient } from "../spotify/types";
import { SYSTEM_PROMPT } from "./prompts";

const MAX_TOOL_ROUNDS = 10;

export interface ToolHandler {
  definition: ToolDefinition;
  execute: (
    args: Record<string, unknown>,
    spotify: SpotifyClient,
  ) => Promise<string>;
}

export interface OrchestratorResult {
  html: string | null;
  messages: AIMessage[];
}

export type StreamEvent =
  | { type: "tool_call"; content: string }
  | { type: "tool_result"; content: string }
  | { type: "generating"; content: string }
  | { type: "done"; html: string | null; message: string };

export type StreamCallback = (event: StreamEvent) => void;

export class Orchestrator {
  private provider: AIProvider;
  private tools: ToolHandler[];
  private spotify: SpotifyClient;

  constructor(
    provider: AIProvider,
    tools: ToolHandler[],
    spotify: SpotifyClient,
  ) {
    this.provider = provider;
    this.tools = tools;
    this.spotify = spotify;
  }

  async chat(
    userMessage: string,
    conversationHistory: AIMessage[],
    onEvent?: StreamCallback,
  ): Promise<OrchestratorResult> {
    const messages: AIMessage[] = [
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    const toolDefs = this.tools.map((t) => t.definition);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      onEvent?.({
        type: "generating",
        content: round === 0 ? "Analyzing your request..." : "Thinking about what else to fetch...",
      });

      const response = await this.provider.chat(
        messages,
        toolDefs,
        SYSTEM_PROMPT,
      );

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Notify about tool calls
        const toolNames = response.toolCalls.map((tc) => tc.name).join(", ");
        onEvent?.({
          type: "tool_call",
          content: `Fetching: ${toolNames.replace(/_/g, " ")}`,
        });

        // Add assistant message with tool calls
        messages.push({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // Execute tool calls and collect results
        const toolResults = await this.executeToolCalls(response.toolCalls);

        messages.push({
          role: "tool",
          content: "",
          toolResults,
        });

        const summaries = toolResults.map((r) => summarizeToolResult(r.content));
        onEvent?.({
          type: "tool_result",
          content: summaries.join(" · "),
        });
      } else {
        // Final text response — extract HTML
        onEvent?.({
          type: "generating",
          content: "Designing your page...",
        });

        messages.push({
          role: "assistant",
          content: response.content,
        });

        const html = extractHtml(response.content);
        return { html, messages };
      }
    }

    // Safety limit reached — return what we have
    const lastAssistant = messages.findLast((m) => m.role === "assistant");
    return {
      html: lastAssistant ? extractHtml(lastAssistant.content) : null,
      messages,
    };
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
  ): Promise<{ toolCallId: string; content: string }[]> {
    // Execute tool calls sequentially to avoid Spotify API rate limits
    const results: { toolCallId: string; content: string }[] = [];
    for (const tc of toolCalls) {
        const handler = this.tools.find(
          (t) => t.definition.name === tc.name,
        );

        let content: string;
        if (!handler) {
          content = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
        } else {
          try {
            content = await handler.execute(tc.arguments, this.spotify);
          } catch (err) {
            content = JSON.stringify({
              error: err instanceof Error ? err.message : "Tool execution failed",
            });
          }
        }

        results.push({ toolCallId: tc.id, content });
    }

    return results;
  }

}

function summarizeToolResult(content: string): string {
  try {
    const data = JSON.parse(content);
    if (data.error) return `Error: ${data.error}`;
    if (data.items && Array.isArray(data.items)) {
      const names = data.items.slice(0, 3).map((i: Record<string, unknown>) => i.name || i.title || "?").join(", ");
      const more = data.items.length > 3 ? ` +${data.items.length - 3} more` : "";
      return `${data.items.length} results: ${names}${more}`;
    }
    if (data.name) return data.name;
    if (data.total !== undefined) return `${data.total} items`;
    return "Done";
  } catch {
    return "Done";
  }
}

export function extractHtml(text: string): string | null {
  // Match ```html ... ``` code blocks
  const codeBlock = text.match(/```html\s*\n([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  // Match raw HTML (model didn't wrap in code block)
  const rawHtml = text.match(/(<!DOCTYPE\s+html[\s\S]*|<html[\s\S]*<\/html>)/i);
  if (rawHtml) return rawHtml[1].trim();

  return null;
}
