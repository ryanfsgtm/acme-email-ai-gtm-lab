import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../lib/io.js";
import type { TranscriptManifestRow } from "../lib/schema.js";

export async function validate(dataDir: string): Promise<void> {
  const lines = (await readFile(path.join(dataDir, "manifest.jsonl"), "utf8")).trim().split("\n");
  const rows = lines.filter(Boolean).map((line) => JSON.parse(line) as TranscriptManifestRow);
  const failures: string[] = [];
  for (const row of rows) {
    const text = await readFile(path.join(dataDir, row.path), "utf8").catch(() => null);
    if (text === null) failures.push(`${row.id}: missing ${row.path}`);
    else if (sha256(text) !== row.sha256) failures.push(`${row.id}: checksum mismatch`);
  }
  if (failures.length) throw new Error(`Validation failed:\n${failures.slice(0, 20).join("\n")}`);
  process.stdout.write(`Validated ${rows.length} transcripts with no missing or modified files.\n`);
}

