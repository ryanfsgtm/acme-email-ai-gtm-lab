import fs from "node:fs";
import readline from "node:readline";

export async function readJsonl<T>(file: string): Promise<T[]> {
  const rows: T[] = [];
  const input = fs.createReadStream(file, "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line) as T);
  }
  return rows;
}

export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\n`;
}
