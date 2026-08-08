const DEFAULT_BASE_URL = "https://api.attio.com/v2";
const MAX_ATTEMPTS = 10;

export function attioRetryDelayMs(response: Response, attempt: number, now = Date.now(), random = Math.random): number {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const specifiedDelay = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - now;
    if (Number.isFinite(specifiedDelay) && specifiedDelay > 0) {
      return Math.ceil(specifiedDelay + random() * 500);
    }
  }
  const base = response.status === 429 ? 2_000 : 500;
  const backoff = Math.min(60_000, base * 2 ** attempt);
  return backoff + Math.floor(random() * Math.min(1_000, backoff / 4));
}

export interface AttioObject {
  api_slug: string;
  singular_noun: string;
  plural_noun: string;
}

export class AttioClient {
  private retryNotBefore = 0;

  constructor(
    private readonly token: string,
    private readonly baseUrl = DEFAULT_BASE_URL,
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async request<T>(method: string, path: string, data?: unknown): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const cooldown = this.retryNotBefore - Date.now();
      if (cooldown > 0) await new Promise((resolve) => setTimeout(resolve, cooldown));
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            ...(data === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: data === undefined ? undefined : JSON.stringify(data),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const body = await response.text();
      if (response.ok) return JSON.parse(body) as T;
      let message = body;
      try {
        const parsed = JSON.parse(body) as { message?: string };
        message = parsed.message ?? body;
      } catch {}
      lastError = new Error(`Attio ${response.status}: ${message}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
      const delay = attioRetryDelayMs(response, attempt);
      if (response.status === 429) this.retryNotBefore = Math.max(this.retryNotBefore, Date.now() + delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError ?? new Error("Attio request failed");
  }
}

export function attioClientFromEnv(): AttioClient {
  const token = process.env.ATTIO_API_KEY?.trim();
  if (!token) throw new Error("ATTIO_API_KEY is missing. Copy .env.example to .env and add a scoped Attio token.");
  return new AttioClient(token, process.env.ATTIO_API_URL?.trim() || DEFAULT_BASE_URL);
}
