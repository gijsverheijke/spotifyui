export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export interface AIMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  stopReason: string;
}

export interface AIProvider {
  chat(
    messages: AIMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<AIResponse>;
}
