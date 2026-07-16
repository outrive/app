import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useSignMessage } from 'wagmi';

// ─── OUTRIVE CLI Authorization Page ──────────────────────────────────────────
// Opened by the CLI when the user runs `outrive auth`.
// Reads ?session=<id> from the URL, asks the user to sign a message with their
// wallet, and POSTs the signature to the API to confirm the CLI session.

export default function CliAuthPage() {
  const params   = new URLSearchParams(window.location.search);
  const sessionId = params.get("session") ?? "";

  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [phase, setPhase]   = useState<"idle" | "signing" | "posting" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  // If session ID is missing, show error immediately
  const missingSession = !sessionId;

  async function handleAuthorize() {
    if (!address) return;
    setPhase("signing");
    setErrMsg("");

    try {
      const timestamp = new Date().toISOString();
      const message   = `OUTRIVE CLI Authorization\nSession: ${sessionId}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      setPhase("posting");

      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${baseUrl}/api/cli/auth/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, walletAddress: address, signature, timestamp }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setPhase("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // User rejected the signature — treat gracefully
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("user denied")) {
        setPhase("idle");
        setErrMsg("Signature cancelled. Click Authorize to try again.");
      } else {
        setPhase("error");
        setErrMsg(msg);
      }
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[#C8FF16] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <span className="font-mono text-xl font-bold tracking-widest text-[#C8FF16]">OUTRIVE</span>
          <span className="ml-2 font-mono text-xs text-zinc-500 tracking-widest uppercase">CLI Auth</span>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-950 space-y-6">

          {/* Title */}
          <div>
            <h1 className="text-white font-semibold text-lg">Authorize CLI Access</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Sign a message with your wallet to link this browser session to your terminal.
            </p>
          </div>

          {/* Session ID */}
          {missingSession ? (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-4">
              <p className="text-red-400 text-sm font-mono">Missing <code>?session=</code> parameter. Run <code>outrive auth</code> again.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-lg p-4 space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-widest font-mono">Session ID</p>
              <p className="text-[#C8FF16] font-mono text-sm break-all">{sessionId}</p>
            </div>
          )}

          {/* Flow steps */}
          {!missingSession && (
            <ol className="space-y-3 text-sm text-zinc-400">
              <Step n={1} done={authenticated} label={authenticated ? `Wallet connected: ${address?.slice(0,6)}...${address?.slice(-4)}` : "Connect your wallet"} />
              <Step n={2} done={phase === "done"} label="Sign authorization message" />
              <Step n={3} done={phase === "done"} label="CLI receives confirmation" />
            </ol>
          )}

          {/* Error */}
          {errMsg && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">{errMsg}</p>
            </div>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className="bg-[#C8FF16]/10 border border-[#C8FF16]/40 rounded-lg px-4 py-4 text-center">
              <p className="text-[#C8FF16] font-semibold">✓ CLI Authorized</p>
              <p className="text-zinc-400 text-sm mt-1">Your terminal is now connected. You can close this tab.</p>
            </div>
          )}

          {/* CTA */}
          {!missingSession && phase !== "done" && (
            <>
              {!authenticated ? (
                <button
                  onClick={login}
                  className="w-full bg-[#C8FF16] text-black font-semibold py-3 rounded-lg hover:bg-[#d4ff40] transition-colors"
                >
                  Connect Wallet
                </button>
              ) : (
                <button
                  onClick={handleAuthorize}
                  disabled={phase === "signing" || phase === "posting"}
                  className="w-full bg-[#C8FF16] text-black font-semibold py-3 rounded-lg hover:bg-[#d4ff40] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {phase === "signing" ? "Check wallet…" : phase === "posting" ? "Confirming…" : "Authorize CLI"}
                </button>
              )}
            </>
          )}

          {/* Security note */}
          <p className="text-zinc-600 text-xs text-center leading-relaxed">
            This only grants the CLI read/write access to your OUTRIVE agent session.
            Your private key never leaves your wallet. Sessions expire in 5 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ n, done, label }: { n: number; done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? "bg-[#C8FF16] text-black" : "bg-zinc-800 text-zinc-400"}`}>
        {done ? "✓" : n}
      </span>
      <span className={done ? "text-zinc-300" : "text-zinc-500"}>{label}</span>
    </li>
  );
}
