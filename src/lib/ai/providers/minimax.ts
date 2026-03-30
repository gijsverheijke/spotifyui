import type { AIProvider, AIMessage, AIResponse, ToolDefinition } from "../types";

interface MinimaxMessage {
  role: "user" | "assistant" | "tool";
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: MinimaxToolCall[];
}

interface MinimaxToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface MinimaxTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

interface MinimaxChoice {
  message: {
    content?: string;
    tool_calls?: MinimaxToolCall[];
  };
  finish_reason: string;
}

interface MinimaxResponse {
  choices: MinimaxChoice[];
}

export class MinimaxProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(
    apiKey: string = process.env.MINIMAX_API_KEY ?? "",
    model: string = "MiniMax-M2.7-highspeed",
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(
    messages: AIMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<AIResponse> {
    const minimaxMessages = this.convertMessages(messages, systemPrompt);
    const minimaxTools = this.convertTools(tools);

    const body: Record<string, unknown> = {
      model: this.model,
      messages: minimaxMessages,
      max_tokens: 16384,
    };

    if (minimaxTools.length > 0) {
      body.tools = minimaxTools;
      body.tool_choice = "auto";
    }

    const response = await fetch(
      "https://api.minimax.io/v1/text/chatcompletion_v2",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Minimax API error ${response.status}: ${text}`);
    }

    const data = await response.json();

    // MiniMax returns base_resp on error even with HTTP 200
    const baseResp = (data as Record<string, unknown>).base_resp as { status_code?: number; status_msg?: string } | undefined;
    if (baseResp && baseResp.status_code && baseResp.status_code !== 0) {
      throw new Error(`MiniMax API error: ${baseResp.status_msg ?? "unknown"} (code ${baseResp.status_code})`);
    }
    
    return this.parseResponse(data as MinimaxResponse);
  }

  private convertMessages(
    messages: AIMessage[],
    systemPrompt: string,
  ): MinimaxMessage[] {
    const result: MinimaxMessage[] = [
      { role: "user", content: systemPrompt + "\n\n---\n\nPlease acknowledge that you understand these instructions." },
      { role: "assistant", content: "Understood. I will follow these instructions for generating Spotify data visualizations." },
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const mmMsg: MinimaxMessage = { role: "assistant" };
        if (msg.content) {
          mmMsg.content = msg.content;
        }
        if (msg.toolCalls) {
          mmMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }
        result.push(mmMsg);
      } else if (msg.role === "tool" && msg.toolResults) {
        for (const tr of msg.toolResults) {
          result.push({
            role: "tool",
            tool_call_id: tr.toolCallId,
            content: tr.content,
          });
        }
      }
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): MinimaxTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  private parseResponse(data: MinimaxResponse): AIResponse {
    const choice = data.choices[0];
    if (!choice) {
      throw new Error("Minimax returned no choices");
    }

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: choice.message.content ?? "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: choice.finish_reason,
    };
  }
}
