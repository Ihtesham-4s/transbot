const buckets = new Map();

export function createRateLimiter({ windowMs, max, message }) {
  return (req, res, next) => {
    const key = `${req.ip || "unknown"}:${req.baseUrl || ""}${req.path || ""}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ message });
    }

    return next();
  };
}