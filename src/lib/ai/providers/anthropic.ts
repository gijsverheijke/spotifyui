import type { AIProvider, AIMessage, AIResponse, ToolDefinition } from "../types";

interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
}

export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(
    apiKey: string = process.env.ANTHROPIC_API_KEY ?? "",
    model: string = "claude-sonnet-4-6-20250514",
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(
    messages: AIMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<AIResponse> {
    const anthropicMessages = this.convertMessages(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 16384,
      system: systemPrompt,
      messages: anthropicMessages,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Anthropic API error ${response.status}: ${text}`,
      );
    }

    const data = (await response.json()) as AnthropicResponse;
    return this.parseResponse(data);
  }

  private convertMessages(messages: AIMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const blocks: AnthropicContentBlock[] = [];
        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            blocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
        }
        result.push({
          role: "assistant",
          content: blocks.length > 0 ? blocks : msg.content,
        });
      } else if (msg.role === "tool" && msg.toolResults) {
        // Anthropic expects tool results in a user message with tool_result blocks
        result.push({
          role: "user",
          content: msg.toolResults.map((tr) => ({
            type: "tool_result" as const,
            tool_use_id: tr.toolCallId,
            content: tr.content,
          })),
        });
      }
    }

    return result;
  }

  private parseResponse(data: AnthropicResponse): AIResponse {
    let content = "";
    const toolCalls = [];

    for (const block of data.content) {
      if (block.type === "text" && block.text) {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id!,
          name: block.name!,
          arguments: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: data.stop_reason,
    };
  }
}
