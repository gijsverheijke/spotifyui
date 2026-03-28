import { describe, it, expect, vi, beforeEach } from "vitest";
import { MinimaxProvider } from "../providers/minimax";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MinimaxProvider", () => {
  const provider = new MinimaxProvider("test-minimax-key", "MiniMax-M1");

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends correct request format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "Hello!" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    await provider.chat(
      [{ role: "user", content: "Hi" }],
      [],
      "You are helpful.",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.minimax.chat/v1/text/chatcompletion_v2",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-minimax-key",
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("MiniMax-M1");
    // System prompt should be injected as first user/assistant exchange
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("You are helpful.");
    expect(body.messages[1].role).toBe("assistant");
    // Actual user message should follow
    expect(body.messages[2]).toEqual({ role: "user", content: "Hi" });
  });

  it("includes tools in OpenAI format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "Sure" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const tools = [
      {
        name: "search",
        description: "Search Spotify",
        input_schema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      },
    ];

    await provider.chat(
      [{ role: "user", content: "Find jazz" }],
      tools,
      "System",
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Search Spotify",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      },
    ]);
    expect(body.tool_choice).toBe("auto");
  });

  it("parses text response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "Here you go" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await provider.chat(
      [{ role: "user", content: "Hi" }],
      [],
      "System",
    );

    expect(result.content).toBe("Here you go");
    expect(result.toolCalls).toBeUndefined();
    expect(result.stopReason).toBe("stop");
  });

  it("parses tool_calls response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "search",
                    arguments: '{"query":"jazz"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    });

    const result = await provider.chat(
      [{ role: "user", content: "Find jazz" }],
      [],
      "System",
    );

    expect(result.content).toBe("");
    expect(result.toolCalls).toEqual([
      { id: "call_123", name: "search", arguments: { query: "jazz" } },
    ]);
    expect(result.stopReason).toBe("tool_calls");
  });

  it("converts tool results to tool role messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "Done" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    await provider.chat(
      [
        { role: "user", content: "Search" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "call_1", name: "search", arguments: { query: "jazz" } },
          ],
        },
        {
          role: "tool",
          content: "",
          toolResults: [
            { toolCallId: "call_1", content: '{"results":[]}' },
          ],
        },
      ],
      [],
      "System",
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);

    // Assistant message should have tool_calls
    const assistantMsg = body.messages.find(
      (m: { role: string; tool_calls?: unknown[] }) =>
        m.role === "assistant" && m.tool_calls,
    );
    expect(assistantMsg.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "search", arguments: '{"query":"jazz"}' },
      },
    ]);

    // Tool result message
    const toolMsg = body.messages.find(
      (m: { role: string }) => m.role === "tool",
    );
    expect(toolMsg).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"results":[]}',
    });
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [], "System"),
    ).rejects.toThrow("Minimax API error 500: Internal Server Error");
  });

  it("throws when no choices returned", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [], "System"),
    ).rejects.toThrow("Minimax returned no choices");
  });
});
