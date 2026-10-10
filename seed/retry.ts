// Retry with backoff for Gemini calls on the free tier. Rate limits (429)
// wait for the delay Gemini asks for, or back off exponentially.

import { setTimeout as sleep } from "node:timers/promises";

export const geminiCalls = { generate: 0, embed: 0 };

export async function withRetry<T>(
  label: string,
  kind: keyof typeof geminiCalls,
  run: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    geminiCalls[kind]++;
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts) throw error;
      const limited = isRateLimit(error);
      const wait = limited
        ? Math.max(retryDelayMs(error) ?? 0, 10_000 * 2 ** (attempt - 1))
        : 2_000 * attempt;
      const why = limited ? "rate limited" : errorMessage(error).slice(0, 200);
      console.warn(`${label}: attempt ${attempt} failed (${why}); retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

type ApiErrorLike = { statusCode?: number; responseBody?: string; lastError?: ApiErrorLike } | null;

function isRateLimit(error: unknown): boolean {
  const e = error as ApiErrorLike;
  if (e?.statusCode === 429 || e?.lastError?.statusCode === 429) return true;
  return /429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(errorMessage(error));
}

// Gemini puts RetryInfo in the error body, e.g. "retryDelay": "37s".
function retryDelayMs(error: unknown): number | null {
  const e = error as ApiErrorLike;
  const body = e?.responseBody ?? e?.lastError?.responseBody ?? errorMessage(error);
  const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return match ? Math.ceil(Number(match[1]) * 1000) + 1000 : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return error.message + cause;
  }
  return String(error);
}
