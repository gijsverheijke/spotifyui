const MAX_DAILY_REQUESTS = 5;

let count = 0;
let dateKey = "";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export function checkRateLimit(): RateLimitResult {
  const key = today();
  if (key !== dateKey) {
    dateKey = key;
    count = 0;
  }

  if (count >= MAX_DAILY_REQUESTS) {
    return { allowed: false, used: count, limit: MAX_DAILY_REQUESTS };
  }

  count += 1;
  return { allowed: true, used: count, limit: MAX_DAILY_REQUESTS };
}

/** Current usage without incrementing. */
export function getRateLimitStatus(): { used: number; limit: number } {
  const key = today();
  if (key !== dateKey) {
    return { used: 0, limit: MAX_DAILY_REQUESTS };
  }
  return { used: count, limit: MAX_DAILY_REQUESTS };
}
