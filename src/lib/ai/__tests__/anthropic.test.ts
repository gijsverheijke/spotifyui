import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "../providers/anthropic";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("AnthropicProvider", () => {
  const provider = new AnthropicProvider("test-api-key", "claude-sonnet-4-6-20250514");

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends correct request format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
      }),
    });

    await provider.chat(
      [{ role: "user", content: "Hi" }],
      [],
      "You are helpful.",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-api-key",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("claude-sonnet-4-6-20250514");
    expect(body.system).toBe("You are helpful.");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(body.tools).toBeUndefined();
  });

  it("includes tools when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Sure" }],
        stop_reason: "end_turn",
      }),
    });

    const tools = [
      {
        name: "get_profile",
        description: "Get profile",
        input_schema: { type: "object", properties: {} },
      },
    ];

    await provider.chat(
      [{ role: "user", content: "Hi" }],
      tools,
      "System",
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([
      {
        name: "get_profile",
        description: "Get profile",
        input_schema: { type: "object", properties: {} },
      },
    ]);
  });

  it("parses text response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Here is your answer" }],
        stop_reason: "end_turn",
      }),
    });

    const result = await provider.chat(
      [{ role: "user", content: "Hi" }],
      [],
      "System",
    );

    expect(result.content).toBe("Here is your answer");
    expect(result.toolCalls).toBeUndefined();
    expect(result.stopReason).toBe("end_turn");
  });

  it("parses tool_use response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "I'll look that up." },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "get_profile",
            input: { user_id: "abc" },
          },
        ],
        stop_reason: "tool_use",
      }),
    });

    const result = await provider.chat(
      [{ role: "user", content: "Who am I?" }],
      [],
      "System",
    );

    expect(result.content).toBe("I'll look that up.");
    expect(result.toolCalls).toEqual([
      { id: "toolu_123", name: "get_profile", arguments: { user_id: "abc" } },
    ]);
    expect(result.stopReason).toBe("tool_use");
  });

  it("converts tool results to user messages with tool_result blocks", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Done" }],
        stop_reason: "end_turn",
      }),
    });

    await provider.chat(
      [
        { role: "user", content: "Hi" },
        {
          role: "assistant",
          content: "Calling tool",
          toolCalls: [{ id: "tc1", name: "get_profile", arguments: {} }],
        },
        {
          role: "tool",
          content: "",
          toolResults: [
            { toolCallId: "tc1", content: '{"name":"Test"}' },
          ],
        },
      ],
      [],
      "System",
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);

    // Assistant message should have tool_use blocks
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "Calling tool" },
      { type: "tool_use", id: "tc1", name: "get_profile", input: {} },
    ]);

    // Tool result should be a user message with tool_result blocks
    expect(body.messages[2].role).toBe("user");
    expect(body.messages[2].content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "tc1",
        content: '{"name":"Test"}',
      },
    ]);
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [], "System"),
    ).rejects.toThrow("Anthropic API error 429: Rate limited");
  });
});
