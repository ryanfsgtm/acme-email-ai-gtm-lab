import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../lib/io.js";
import type { TranscriptManifestRow } from "../lib/schema.js";

export async function inventory(dataDir: string, reportFile: string): Promise<void> {
  const lines = (await readFile(path.join(dataDir, "manifest.jsonl"), "utf8")).trim().split("\n");
  const rows = lines.filter(Boolean).map((line) => JSON.parse(line) as TranscriptManifestRow);
  const byCallType = Object.fromEntries(
    [...Map.groupBy(rows, (row) => row.callType)].map(([key, values]) => [key, values.length]),
  );
  const report = {
    transcriptCount: rows.length,
    totalWords: rows.reduce((sum, row) => sum + row.wordCount, 0),
    uniqueAccounts: new Set(rows.map((row) => row.accountId)).size,
    linkedOpportunities: rows.filter((row) => row.opportunityId).length,
    byCallType,
    manifestCoverage: 1,
  };
  await writeJson(reportFile, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

