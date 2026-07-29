type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let operations = 0;

function removeExpired(now: number) {
  operations += 1;
  if (operations % 250 !== 0) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export function checkRateLimit(key: string, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  removeExpired(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0 };
}
