export interface UnsignedTx {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
}

export interface LaunchPreview {
  name: string;
  ticker: string;
  description: string;
  network: string;
  targetContract: string;
  baseCost: string;
  mode: string;
  antiSniper: string;       // e.g. "60s (1 MIN)" | "DISABLED"
  antiSniperDuration: number; // raw seconds (0 or 60) — used to rebuild calldata
  imageRef: string;          // current image URL (empty string if none)
}

export type ChatEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolName: string; status: "running" | "done"; duration?: number }
  | { type: "tx_payload"; needsApproval: false; launchTx: UnsignedTx; preview: LaunchPreview }
  | { type: "launch_result"; txHash: `0x${string}`; preview: LaunchPreview }
  | { type: "launch_error"; message: string; preview?: LaunchPreview }
  | { type: "credits_required"; freeRemaining: number; otrCredits: number }
  | { type: "done" }
  | { type: "error"; message: string };

export interface CreditInfo {
  walletAddress: string;
  freeChatsUsed: number;
  freeChatsTotal: number;
  freeRemaining: number;
  otrCredits: number;
  hasAccess: boolean;
  totalChats: number;
}

export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  walletAddress: string,
  conversationId: number | null,
  onEvent: (event: ChatEvent) => void
): Promise<void> {
  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, walletAddress, conversationId }),
  });

  // 402 = credits exhausted — parse JSON body and emit credits_required
  if (res.status === 402) {
    try {
      const body = await res.json() as { freeRemaining?: number; otrCredits?: number };
      onEvent({ type: "credits_required", freeRemaining: body.freeRemaining ?? 0, otrCredits: body.otrCredits ?? 0 });
    } catch {
      onEvent({ type: "credits_required", freeRemaining: 0, otrCredits: 0 });
    }
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `HTTP ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as ChatEvent;
          onEvent(event);
        } catch {
          // malformed event — ignore
        }
      }
    }
  }
}

export async function fetchCredits(walletAddress: string): Promise<CreditInfo | null> {
  if (!walletAddress) return null;
  try {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const res = await fetch(`${baseUrl}/api/credits/${walletAddress}`);
    if (!res.ok) return null;
    return res.json() as Promise<CreditInfo>;
  } catch {
    return null;
  }
}
