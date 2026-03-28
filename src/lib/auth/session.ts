import { SpotifyApiClient } from "../spotify/client";
import type { AIMessage } from "../ai/types";
import type { SpotifyUser } from "../spotify/types";

export interface Session {
  spDc: string;
  client: SpotifyApiClient;
  messages: AIMessage[];
  profile: SpotifyUser | null;
}

const sessions = new Map<string, Session>();

export function createSession(spDc: string): string {
  const id = crypto.randomUUID();
  sessions.set(id, {
    spDc,
    client: new SpotifyApiClient(spDc),
    messages: [],
    profile: null,
  });
  return id;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function hasSession(id: string): boolean {
  return sessions.has(id);
}
