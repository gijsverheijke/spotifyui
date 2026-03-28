import { describe, it, expect } from "vitest";
import { createSession, getSession, deleteSession, hasSession } from "../session";

describe("session store", () => {
  it("creates a session and returns an id", () => {
    const id = createSession("sp_dc_abc");
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    const session = getSession(id);
    expect(session).toBeDefined();
    expect(session!.spDc).toBe("sp_dc_abc");
    expect(session!.messages).toEqual([]);
  });

  it("hasSession returns true for existing session", () => {
    const id = createSession("sp_dc_has");
    expect(hasSession(id)).toBe(true);
  });

  it("hasSession returns false for unknown id", () => {
    expect(hasSession("nonexistent")).toBe(false);
  });

  it("deletes a session", () => {
    const id = createSession("sp_dc_del");
    expect(deleteSession(id)).toBe(true);
    expect(getSession(id)).toBeUndefined();
  });

  it("delete returns false for unknown id", () => {
    expect(deleteSession("nonexistent")).toBe(false);
  });

  it("creates independent sessions", () => {
    const id1 = createSession("sp_dc_1");
    const id2 = createSession("sp_dc_2");
    expect(id1).not.toBe(id2);

    const s1 = getSession(id1)!;
    const s2 = getSession(id2)!;
    s1.messages.push({ role: "user", content: "hello" });
    expect(s2.messages).toEqual([]);
  });
});
