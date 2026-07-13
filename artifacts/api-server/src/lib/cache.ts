import { LRUCache } from "lru-cache";

// In-memory LRU cache with TTL — no Redis dependency
const cache = new LRUCache<string, object>({
  max: 500,
  ttl: 20_000, // 20s default TTL
});

export function cacheGet<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T, ttlMs?: number): void {
  cache.set(key, value as object, ttlMs ? { ttl: ttlMs } : undefined);
}

export function cacheDelete(key: string): void {
  cache.delete(key);
}
