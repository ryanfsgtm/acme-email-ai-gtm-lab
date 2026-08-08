import fs from "node:fs/promises";
import path from "node:path";
import { attioClientFromEnv } from "../lib/attio.js";
import { inspectRemoteSeedState, type SeedKind } from "../lib/attio-state.js";
import { readJsonl } from "../lib/jsonl.js";

interface Manifest { counts: { companies: number; people: number; deals: number; notes: number } }

export async function attioVerify(seedDir: string, reportFile: string): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(path.join(seedDir, "seed-manifest.json"), "utf8")) as Manifest;
  const notes = await readJsonl<{ externalId: string }>(path.join(seedDir, "notes.jsonl"));
  const expected: Record<SeedKind, number> = {
    company: manifest.counts.companies,
    person: manifest.counts.people,
    deal: manifest.counts.deals,
    note: notes.length,
  };
  const state = await inspectRemoteSeedState(attioClientFromEnv());
  const unique = { company: 0, person: 0, deal: 0, note: 0 } satisfies Record<SeedKind, number>;
  for (const row of state.rows) unique[row.kind] += 1;
  for (const duplicate of state.duplicates) unique[duplicate.kind] -= duplicate.attioIds.length - 1;
  const mismatches = (Object.keys(expected) as SeedKind[])
    .filter((kind) => unique[kind] !== expected[kind])
    .map((kind) => ({ kind, expected: expected[kind], actualUnique: unique[kind] }));
  const report = {
    workspaceId: state.workspaceId,
    expected,
    unique,
    remoteTotalsIncludingNonAcmeData: state.totals,
    duplicates: state.duplicates,
    mismatches,
    ok: mismatches.length === 0 && state.duplicates.length === 0,
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error(`Attio verification failed. See ${path.relative(process.cwd(), reportFile)}`);
  console.log("✓ Attio contains the complete, duplicate-free ACME Email seed corpus.");
}
