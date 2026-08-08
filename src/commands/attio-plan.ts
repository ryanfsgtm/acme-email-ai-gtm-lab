import fs from "node:fs/promises";
import path from "node:path";

export async function attioPlan(seedDir: string, reportFile: string): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(path.join(seedDir, "seed-manifest.json"), "utf8")) as {
    counts: Record<string, number>;
  };
  const count = (key: string): number => {
    const value = manifest.counts[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid seed count for ${key}`);
    }
    return value;
  };
  const operations = [
    { phase: 1, object: "companies", action: "assert", count: count("companies"), identity: "domain" },
    { phase: 2, object: "people", action: "assert", count: count("people"), identity: "email" },
    { phase: 3, object: "deals", action: "create-or-reconcile", count: count("deals"), identity: "ACME opportunity marker" },
    { phase: 4, object: "notes", action: "create-if-missing", count: count("notes"), identity: "[ACME Call call_NNNNN] title marker" },
  ];
  const plan = {
    provider: "attio",
    mode: "dry-run",
    destructiveOperations: 0,
    requiresExplicitApply: true,
    operations,
    totalWrites: operations.reduce((sum, operation) => sum + operation.count, 0),
    warning: "This plan does not write to Attio. Inspect it before running a future apply command.",
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(plan, null, 2));
  console.log(`Saved plan to ${path.relative(process.cwd(), reportFile)}`);
}
