import { describe, expect, it } from "vitest";
import { attioRetryDelayMs } from "../src/lib/attio.js";

describe("Attio retry timing", () => {
  it("honors a numeric Retry-After header", () => {
    const response = new Response("", { status: 429, headers: { "retry-after": "3" } });
    expect(attioRetryDelayMs(response, 0, 0, () => 0)).toBe(3_000);
  });

  it("honors an HTTP-date Retry-After header", () => {
    const now = Date.parse("2026-08-08T12:00:00Z");
    const response = new Response("", {
      status: 429,
      headers: { "retry-after": "Sat, 08 Aug 2026 12:00:05 GMT" },
    });
    expect(attioRetryDelayMs(response, 0, now, () => 0)).toBe(5_000);
  });

  it("backs off more conservatively for rate limits than server errors", () => {
    const limited = new Response("", { status: 429 });
    const unavailable = new Response("", { status: 503 });
    expect(attioRetryDelayMs(limited, 0, 0, () => 0)).toBe(2_000);
    expect(attioRetryDelayMs(unavailable, 0, 0, () => 0)).toBe(500);
    expect(attioRetryDelayMs(limited, 9, 0, () => 0)).toBe(60_000);
  });
});
