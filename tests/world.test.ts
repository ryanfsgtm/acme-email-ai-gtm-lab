import { describe, expect, it } from "vitest";
import world from "../world/acme-email.json" with { type: "json" };
import { WorldSchema } from "../src/lib/schema.js";

describe("ACME Email world", () => {
  it("has a valid deterministic configuration", () => {
    expect(WorldSchema.parse(world).seed).toBe(20260820);
  });

  it("uses normalized weights", () => {
    expect(world.segments.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
    expect(world.callTypes.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
  });
});

