import { getSession } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";

  if (!sessionId) {
    return Response.json({ valid: false }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ valid: false });
  }

  const profile = session.profile;
  return Response.json({
    valid: true,
    profile: {
      displayName: profile?.display_name ?? "Spotify User",
      avatar: profile?.images?.[0]?.url,
    },
  });
}
