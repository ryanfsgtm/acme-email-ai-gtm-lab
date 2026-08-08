const DEFAULT_BASE_URL = "https://api.attio.com/v2";

export interface AttioObject {
  api_slug: string;
  singular_noun: string;
  plural_noun: string;
}

export class AttioClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = DEFAULT_BASE_URL,
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async request<T>(method: string, path: string, data?: unknown): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 7; attempt += 1) {
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
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
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
