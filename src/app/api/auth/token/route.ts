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

  const client = new SpotifyApiClient(spDc);

  let profile: SpotifyUser;
  try {
    profile = await client.get<SpotifyUser>("/me");
  } catch {
    return Response.json({ error: "Invalid Spotify cookie" }, { status: 401 });
  }

  const sessionId = createSession(spDc);
  const session = getSession(sessionId);
  if (session) {
    session.profile = profile;
  }

  return Response.json({
    sessionId,
    profile: {
      displayName: profile.display_name ?? "Spotify User",
      avatar: profile.images[0]?.url,
    },
  });
}
