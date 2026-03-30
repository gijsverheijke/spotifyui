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
          content: `Calling ${toolNames}...`,
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

        onEvent?.({
          type: "tool_result",
          content: `Got results from ${toolNames}`,
        });
      } else {
        // Final text response — extract HTML
        onEvent?.({
          type: "generating",
          content: "Building your page...",
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

export function extractHtml(text: string): string | null {
  // Match ```html ... ``` code blocks
  const match = text.match(/```html\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}
