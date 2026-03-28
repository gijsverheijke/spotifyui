import { describe, it, expect } from "vitest";
import { totpFromSecret } from "../client";

// ---------------------------------------------------------------------------
// TOTP generation — the token/auth flow requires network calls so we test
// the pure TOTP logic only.
// ---------------------------------------------------------------------------

describe("totpFromSecret", () => {
  const testSecret = new Uint8Array([
    70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108,
    68,
  ]);

  it("generates a 6-digit TOTP code", () => {
    const code = totpFromSecret(testSecret, new Date("2024-01-01T00:00:00Z"));
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it("produces the same code for the same 30-second window", () => {
    const t1 = new Date("2024-01-01T00:00:00Z");
    const t2 = new Date("2024-01-01T00:00:15Z"); // same 30s window
    expect(totpFromSecret(testSecret, t1)).toBe(
      totpFromSecret(testSecret, t2),
    );
  });

  it("produces different codes for different 30-second windows", () => {
    const t1 = new Date("2024-01-01T00:00:00Z");
    const t2 = new Date("2024-01-01T00:00:30Z"); // next 30s window
    expect(totpFromSecret(testSecret, t1)).not.toBe(
      totpFromSecret(testSecret, t2),
    );
  });
});
