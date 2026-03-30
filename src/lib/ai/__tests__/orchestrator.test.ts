import { describe, it, expect, vi } from "vitest";
import { Orchestrator, extractHtml } from "../orchestrator";
import type { AIProvider, AIResponse } from "../types";
import type { ToolHandler } from "../orchestrator";
import type { SpotifyClient } from "../../spotify/types";

function makeProvider(responses: AIResponse[]): AIProvider {
  let callIndex = 0;
  return {
    chat: vi.fn(async () => {
      const resp = responses[callIndex];
      if (!resp) throw new Error("No more mock responses");
      callIndex++;
      return resp;
    }),
  };
}

function makeSpotifyClient(): SpotifyClient {
  return {
    getAccessToken: vi.fn(async () => "mock-token"),
    getUserId: vi.fn(async () => "user123"),
    getUserProfile: vi.fn(async () => ({ id: "user123", display_name: "Test" })),
    search: vi.fn(async () => ({ tracks: { items: [] } })),
    getTopItems: vi.fn(async () => ({ items: [] })),
    getRecentlyPlayed: vi.fn(async () => ({ items: [] })),
    getSavedTracks: vi.fn(async () => ({ items: [] })),
    getFollowedArtists: vi.fn(async () => ({ artists: { items: [] } })),
    getUserPlaylists: vi.fn(async () => ({ items: [] })),
    getPlaylist: vi.fn(async () => ({ id: "pl1" })),
    getArtistTopTracks: vi.fn(async () => ({ tracks: [] })),
    getTracks: vi.fn(async () => ({ tracks: [] })),
    getArtists: vi.fn(async () => ({ artists: [] })),
    getAlbum: vi.fn(async () => ({ id: "alb1" })),
    createPlaylist: vi.fn(async () => ({ id: "pl-new", name: "New Playlist" })),
  };
}

const testTool: ToolHandler = {
  definition: {
    name: "get_user_profile",
    description: "Get the current user's profile",
    input_schema: { type: "object", properties: {} },
  },
  execute: vi.fn(async () =>
    JSON.stringify({ display_name: "Test User", id: "user123" }),
  ),
};

describe("Orchestrator", () => {
  it("returns HTML from a direct response (no tool calls)", async () => {
    const provider = makeProvider([
      {
        content: 'Here is your page:\n```html\n<div>Hello</div>\n```',
        stopReason: "end_turn",
      },
    ]);

    const orchestrator = new Orchestrator(
      provider,
      [testTool],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Show my profile", []);

    expect(result.html).toBe("<div>Hello</div>");
    expect(result.messages).toHaveLength(2); // user + assistant
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("assistant");
  });

  it("executes tool calls and loops back to provider", async () => {
    const provider = makeProvider([
      {
        content: "Let me fetch your profile.",
        toolCalls: [
          { id: "tc1", name: "get_user_profile", arguments: {} },
        ],
        stopReason: "tool_use",
      },
      {
        content: '```html\n<h1>Test User</h1>\n```',
        stopReason: "end_turn",
      },
    ]);

    const tool: ToolHandler = {
      definition: testTool.definition,
      execute: vi.fn(async () =>
        JSON.stringify({ display_name: "Test User" }),
      ),
    };

    const orchestrator = new Orchestrator(
      provider,
      [tool],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Show my profile", []);

    expect(tool.execute).toHaveBeenCalledOnce();
    expect(result.html).toBe("<h1>Test User</h1>");
    // user, assistant (with tool call), tool (results), assistant (final)
    expect(result.messages).toHaveLength(4);
  });

  it("handles unknown tool gracefully", async () => {
    const provider = makeProvider([
      {
        content: "",
        toolCalls: [
          { id: "tc1", name: "nonexistent_tool", arguments: {} },
        ],
        stopReason: "tool_use",
      },
      {
        content: "Sorry, I encountered an error.\n```html\n<p>Error</p>\n```",
        stopReason: "end_turn",
      },
    ]);

    const orchestrator = new Orchestrator(
      provider,
      [testTool],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Do something", []);

    // The tool result should contain an error
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg?.toolResults?.[0].content).toContain("Unknown tool");
    expect(result.html).toBe("<p>Error</p>");
  });

  it("handles tool execution errors gracefully", async () => {
    const failingTool: ToolHandler = {
      definition: {
        name: "failing_tool",
        description: "A tool that fails",
        input_schema: { type: "object", properties: {} },
      },
      execute: vi.fn(async () => {
        throw new Error("Spotify API down");
      }),
    };

    const provider = makeProvider([
      {
        content: "",
        toolCalls: [{ id: "tc1", name: "failing_tool", arguments: {} }],
        stopReason: "tool_use",
      },
      {
        content: "```html\n<p>Service unavailable</p>\n```",
        stopReason: "end_turn",
      },
    ]);

    const orchestrator = new Orchestrator(
      provider,
      [failingTool],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Do something", []);

    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg?.toolResults?.[0].content).toContain("Spotify API down");
    expect(result.html).toBe("<p>Service unavailable</p>");
  });

  it("respects the max tool rounds safety limit", async () => {
    // Provider always returns tool calls — should stop after 10 rounds
    const responses: AIResponse[] = Array.from({ length: 11 }, () => ({
      content: "Calling tool again...",
      toolCalls: [{ id: "tc1", name: "get_user_profile", arguments: {} }],
      stopReason: "tool_use",
    }));

    const provider = makeProvider(responses);
    const orchestrator = new Orchestrator(
      provider,
      [testTool],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Loop forever", []);

    // Should have called provider exactly 10 times (the max)
    expect(provider.chat).toHaveBeenCalledTimes(10);
    expect(result.html).toBeNull(); // No HTML in tool call responses
  });

  it("preserves conversation history", async () => {
    const provider = makeProvider([
      {
        content: '```html\n<p>Follow-up</p>\n```',
        stopReason: "end_turn",
      },
    ]);

    const history = [
      { role: "user" as const, content: "Show my profile" },
      { role: "assistant" as const, content: "Here it is..." },
    ];

    const orchestrator = new Orchestrator(
      provider,
      [testTool],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Now show it differently", history);

    // History (2) + new user message + assistant response
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].content).toBe("Show my profile");
    expect(result.messages[2].content).toBe("Now show it differently");
  });

  it("executes multiple tool calls in parallel", async () => {
    const tool2: ToolHandler = {
      definition: {
        name: "get_top_items",
        description: "Get top items",
        input_schema: { type: "object", properties: {} },
      },
      execute: vi.fn(async () => JSON.stringify({ items: [] })),
    };

    const provider = makeProvider([
      {
        content: "Fetching data...",
        toolCalls: [
          { id: "tc1", name: "get_user_profile", arguments: {} },
          { id: "tc2", name: "get_top_items", arguments: { type: "artists" } },
        ],
        stopReason: "tool_use",
      },
      {
        content: '```html\n<div>Combined</div>\n```',
        stopReason: "end_turn",
      },
    ]);

    const orchestrator = new Orchestrator(
      provider,
      [testTool, tool2],
      makeSpotifyClient(),
    );

    const result = await orchestrator.chat("Show overview", []);

    expect(testTool.execute).toHaveBeenCalled();
    expect(tool2.execute).toHaveBeenCalled();
    expect(result.html).toBe("<div>Combined</div>");
  });
});

describe("extractHtml", () => {
  it("extracts HTML from code block", () => {
    const text = 'Some text\n```html\n<div>Hello</div>\n```\nMore text';
    expect(extractHtml(text)).toBe("<div>Hello</div>");
  });

  it("returns null when no code block", () => {
    expect(extractHtml("No code here")).toBeNull();
  });

  it("extracts multiline HTML", () => {
    const text = '```html\n<html>\n<body>\n<h1>Title</h1>\n</body>\n</html>\n```';
    expect(extractHtml(text)).toBe(
      "<html>\n<body>\n<h1>Title</h1>\n</body>\n</html>",
    );
  });

  it("ignores non-html code blocks", () => {
    const text = '```js\nconsole.log("hi")\n```';
    expect(extractHtml(text)).toBeNull();
  });

  it("extracts first html block when multiple exist", () => {
    const text = '```html\n<p>First</p>\n```\n```html\n<p>Second</p>\n```';
    expect(extractHtml(text)).toBe("<p>First</p>");
  });
});
