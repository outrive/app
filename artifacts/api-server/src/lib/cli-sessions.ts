// ─── CLI Session Store ────────────────────────────────────────────────────────
// In-memory map: sessionId → { status, walletAddress, createdAt }
// Sessions expire after 5 minutes. A background interval cleans up stale entries.

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface SessionEntry {
  status: "pending" | "confirmed";
  walletAddress?: string;
  createdAt: number;
}

const SESSIONS = new Map<string, SessionEntry>();

// Background cleanup — runs every 60 s, unref'd so it never blocks Node exit
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (now - s.createdAt > TTL_MS) SESSIONS.delete(id);
  }
}, 60_000).unref();

export type SessionStatus =
  | { status: "pending" }
  | { status: "confirmed"; walletAddress: string }
  | { status: "expired" }
  | { status: "not_found" };

export function createSession(sessionId: string): void {
  SESSIONS.set(sessionId, { status: "pending", createdAt: Date.now() });
}

export function confirmSession(sessionId: string, walletAddress: string): boolean {
  const s = SESSIONS.get(sessionId);
  if (!s) return false;
  if (Date.now() - s.createdAt > TTL_MS) {
    SESSIONS.delete(sessionId);
    return false;
  }
  if (s.status !== "pending") return false;
  SESSIONS.set(sessionId, { ...s, status: "confirmed", walletAddress });
  return true;
}

export function getSession(sessionId: string): SessionStatus {
  const s = SESSIONS.get(sessionId);
  if (!s) return { status: "not_found" };
  if (Date.now() - s.createdAt > TTL_MS) {
    SESSIONS.delete(sessionId);
    return { status: "expired" };
  }
  if (s.status === "confirmed") return { status: "confirmed", walletAddress: s.walletAddress! };
  return { status: "pending" };
}
