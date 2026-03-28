import { SpotifyApiClient } from "../spotify/client";
import type { AIMessage } from "../ai/types";

export interface Session {
  accessToken: string;
  client: SpotifyApiClient;
  messages: AIMessage[];
}

const sessions = new Map<string, Session>();

export function getOrCreateSession(accessToken: string): Session {
  const existing = sessions.get(accessToken);
  if (existing) return existing;

  const session: Session = {
    accessToken,
    client: new SpotifyApiClient(accessToken),
    messages: [],
  };
  sessions.set(accessToken, session);
  return session;
}

export function deleteSession(accessToken: string): boolean {
  return sessions.delete(accessToken);
}
