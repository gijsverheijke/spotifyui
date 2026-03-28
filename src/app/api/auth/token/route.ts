import { createSession, getSession } from "@/lib/auth/session";
import { SpotifyApiClient } from "@/lib/spotify/client";
import type { SpotifyUser } from "@/lib/spotify/types";

interface AuthRequestBody {
  sp_dc?: unknown;
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let body: AuthRequestBody;

  try {
    body = (await request.json()) as AuthRequestBody;
  } catch {
    return badRequest("Missing request body");
  }

  const spDc = typeof body.sp_dc === "string" ? body.sp_dc.trim() : "";
  if (!spDc) {
    return badRequest("Missing sp_dc");
  }

  // Validate the cookie by getting an access token (fast, <1s)
  const client = new SpotifyApiClient(spDc);
  try {
    console.log("[auth] exchanging sp_dc for access token...");
    const t0 = Date.now();
    await client.getAccessToken();
    console.log(`[auth] token obtained in ${Date.now() - t0}ms`);
  } catch (err) {
    console.log("[auth] token exchange failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: "Invalid Spotify cookie", detail: message },
      { status: 401 },
    );
  }

  const sessionId = createSession(spDc);

  // Try to fetch profile with a short timeout — don't block auth on it
  let displayName = "Spotify User";
  let avatar: string | undefined;
  try {
    console.log("[auth] fetching /me profile (3s timeout)...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const token = await client.getAccessToken();
    const resp = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const profile: SpotifyUser = await resp.json();
      displayName = profile.display_name ?? displayName;
      avatar = profile.images?.[0]?.url;
      const session = getSession(sessionId);
      if (session) {
        session.profile = profile;
      }
      console.log(`[auth] profile: ${displayName}`);
    } else {
      console.log(`[auth] /me returned ${resp.status} (non-fatal)`);
    }
  } catch (err) {
    console.log("[auth] /me profile fetch failed (non-fatal):", err);
  }

  return Response.json({
    sessionId,
    profile: { displayName, avatar },
  });
}
