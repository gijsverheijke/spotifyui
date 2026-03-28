import { describe, it, expect } from "vitest";
import { getOrCreateSession, deleteSession } from "../session";
import { SpotifyApiClient } from "../../spotify/client";

describe("session store", () => {
  it("creates a session for a new access token", () => {
    const session = getOrCreateSession("token-abc");
    expect(session).toBeDefined();
    expect(session.accessToken).toBe("token-abc");
    expect(session.client).toBeInstanceOf(SpotifyApiClient);
    expect(session.messages).toEqual([]);
  });

  it("returns the same session for the same access token", () => {
    const s1 = getOrCreateSession("token-same");
    const s2 = getOrCreateSession("token-same");
    expect(s1).toBe(s2);
  });

  it("deletes a session", () => {
    getOrCreateSession("token-del");
    expect(deleteSession("token-del")).toBe(true);
    // After deletion, a new session is created
    const fresh = getOrCreateSession("token-del");
    expect(fresh.messages).toEqual([]);
  });

  it("delete returns false for unknown token", () => {
    expect(deleteSession("nonexistent")).toBe(false);
  });

  it("creates independent sessions for different tokens", () => {
    const s1 = getOrCreateSession("token-1");
    const s2 = getOrCreateSession("token-2");
    expect(s1).not.toBe(s2);
    expect(s1.accessToken).toBe("token-1");
    expect(s2.accessToken).toBe("token-2");

    s1.messages.push({ role: "user", content: "hello" });
    expect(s2.messages).toEqual([]);
  });
});
