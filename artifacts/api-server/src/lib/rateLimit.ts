// Simple in-memory rate limiter — max 5 launches per wallet per hour
const launchCount = new Map<string, { count: number; resetAt: number }>();

export function checkLaunchRateLimit(walletAddress: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxLaunches = 5;

  const entry = launchCount.get(walletAddress);
  if (!entry || entry.resetAt < now) {
    launchCount.set(walletAddress, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxLaunches - 1 };
  }

  if (entry.count >= maxLaunches) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxLaunches - entry.count };
}
