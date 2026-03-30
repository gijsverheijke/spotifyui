import { SpotifyApiClient } from "../spotify/client";
import type { AIMessage } from "../ai/types";
import type { SpotifyUser } from "../spotify/types";

export interface Session {
  spDc: string;
  client: SpotifyApiClient;
  messages: AIMessage[];
  profile: SpotifyUser | null;
  lastAccessedAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // run cleanup every 5 minutes
const MAX_MESSAGES_PER_SESSION = 20;

const sessions = new Map<string, Session>();

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function createSession(spDc: string): string {
  const id = crypto.randomUUID();
  sessions.set(id, {
    spDc,
    client: new SpotifyApiClient(spDc),
    messages: [],
    profile: null,
    lastAccessedAt: Date.now(),
  });
  return id;
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  const now = Date.now();
  if (now - session.lastAccessedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return undefined;
  }

  session.lastAccessedAt = now;

  // Cap message history to prevent unbounded memory growth
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }

  return session;
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function hasSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return false;
  }
  return true;
}
