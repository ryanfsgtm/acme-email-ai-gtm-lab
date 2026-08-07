import { describe, expect, it } from "vitest";
import world from "../world/acme-email.json" with { type: "json" };
import { WorldSchema } from "../src/lib/schema.js";
import { generate } from "../src/commands/generate.js";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("ACME Email world", () => {
  it("has a valid deterministic configuration", () => {
    expect(WorldSchema.parse(world).seed).toBe(20260820);
  });

  it("uses normalized weights", () => {
    expect(world.segments.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
    expect(world.callTypes.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
  });

  it("keeps transcript relationships inside the same account", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "acme-world-"));
    await generate(directory);
    const parse = async (name: string) => (await readFile(path.join(directory, name), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const [contacts, opportunities, manifest] = await Promise.all([parse("contacts.jsonl"), parse("opportunities.jsonl"), parse("manifest.jsonl")]);
    const contactAccounts = new Set(contacts.map((row) => row.accountId));
    const opportunityById = new Map(opportunities.map((row) => [row.id, row]));
    expect(contactAccounts.size).toBe(world.scale.accounts);
    for (const call of manifest) {
      if (call.opportunityId) expect(opportunityById.get(call.opportunityId)?.accountId).toBe(call.accountId);
    }
    await rm(directory, { recursive: true, force: true });
  }, 30_000);
});
