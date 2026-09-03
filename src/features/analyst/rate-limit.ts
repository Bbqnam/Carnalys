export class FixedWindowRequestLimiter {
  private readonly requests = new Map<string, number[]>();

  consume(key: string, nowMs: number, maximum: number, windowMs: number) {
    const recent = (this.requests.get(key) ?? []).filter((timestamp) => timestamp > nowMs - windowMs);
    if (recent.length >= maximum) {
      return { allowed: false, retryAfterMs: Math.max(1, recent[0] + windowMs - nowMs) };
    }
    recent.push(nowMs);
    this.requests.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }
}

