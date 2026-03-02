import type { Context } from 'hono';
import { config } from '@/config';
import { resolveClientIp } from './utils';

/**
 * In-memory rate limit store for elevation endpoints
 * Maps user+IP combinations to their request timestamps
 */
const elevationRateLimit = new Map<string, { timestamps: number[]; lastSeenAt: number }>();

/**
 * Removes stale entries from the rate limit store
 * Entries are considered stale after 3x the rate limit window (minimum 5 minutes)
 */
export const pruneElevationRateLimit = (now: number): void => {
  const staleAfterMs = Math.max(config.pim.rateLimitWindowMs * 3, 5 * 60 * 1000);

  for (const [key, entry] of elevationRateLimit.entries()) {
    if (now - entry.lastSeenAt > staleAfterMs) {
      elevationRateLimit.delete(key);
    }
  }
};

/**
 * Enforces rate limiting for elevation endpoints
 * Returns a 429 response if the rate limit is exceeded, null otherwise
 *
 * @param c - Hono context
 * @param userId - User ID for rate limiting
 * @param route - Route identifier for rate limiting
 * @returns Response object if rate limited, null if allowed
 */
export const enforceElevationRateLimit = (
  c: Context,
  userId: string,
  route: string
): Response | null => {
  const now = Date.now();
  pruneElevationRateLimit(now);

  const clientIp = resolveClientIp(c);
  const key = `${route}:${userId}:${clientIp}`;
  const existing = elevationRateLimit.get(key)?.timestamps ?? [];
  const recent = existing.filter((timestamp) => now - timestamp <= config.pim.rateLimitWindowMs);

  if (recent.length >= config.pim.rateLimitMaxRequests) {
    const earliest = recent[0] ?? now;
    const retryAfterMs = Math.max(1_000, config.pim.rateLimitWindowMs - (now - earliest));
    return c.json(
      {
        error: 'Too many elevation requests. Please retry shortly.',
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      },
      429
    );
  }

  recent.push(now);
  elevationRateLimit.set(key, {
    timestamps: recent,
    lastSeenAt: now,
  });

  return null;
};
