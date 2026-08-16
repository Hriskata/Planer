// Minimal in-memory fixed-window rate limiter — no new dependency, appropriate for a
// single-process, small-scale self-hosted app (no need for Redis-backed distributed
// limiting). Keyed by whatever the caller chooses; routes/auth.js keys login attempts
// by the submitted username rather than the request IP, since requests arrive through
// a Cloudflare Tunnel and Express's req.ip doesn't reflect the real client without
// `trust proxy` configured to match — an IP-keyed limiter here would either be a no-op
// (everyone sharing one bucket) or a foot-gun (one legitimate user's retries locking
// out everyone else behind the tunnel).

const buckets = new Map(); // key -> { count, resetAt }

function checkAndConsume(key, { max, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false };
  }
  if (bucket.count >= max) {
    return { limited: true, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { limited: false };
}

function reset(key) {
  buckets.delete(key);
}

// Periodic sweep so long-idle keys don't sit in memory forever — this app's process
// can run for months between restarts.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  },
  10 * 60 * 1000
).unref();

module.exports = { checkAndConsume, reset };
