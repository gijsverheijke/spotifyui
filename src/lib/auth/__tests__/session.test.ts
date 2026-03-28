import { describe, it, expect } from "vitest";
import { createSession, getSession, deleteSession, hasSession } from "../session";
import { SpotifyApiClient } from "../../spotify/client";

describe("session store", () => {
  it("creates a session with a UUID id", () => {
    const id = createSession("my-cookie");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("retrieves a created session", () => {
    const id = createSession("cookie-abc");
    const session = getSession(id);
    expect(session).toBeDefined();
    expect(session!.spDc).toBe("cookie-abc");
    expect(session!.client).toBeInstanceOf(SpotifyApiClient);
    expect(session!.messages).toEqual([]);
    expect(session!.profile).toBeNull();
  });

  it("returns undefined for unknown session", () => {
    expect(getSession("nonexistent")).toBeUndefined();
  });

  it("deletes a session", () => {
    const id = createSession("cookie-del");
    expect(hasSession(id)).toBe(true);
    expect(deleteSession(id)).toBe(true);
    expect(hasSession(id)).toBe(false);
    expect(getSession(id)).toBeUndefined();
  });

  it("delete returns false for unknown session", () => {
    expect(deleteSession("nonexistent")).toBe(false);
  });

  it("creates independent sessions", () => {
    const id1 = createSession("cookie-1");
    const id2 = createSession("cookie-2");
    expect(id1).not.toBe(id2);

    const s1 = getSession(id1)!;
    const s2 = getSession(id2)!;
    expect(s1.spDc).toBe("cookie-1");
    expect(s2.spDc).toBe("cookie-2");

    s1.messages.push({ role: "user", content: "hello" });
    expect(s2.messages).toEqual([]);
  });
});
