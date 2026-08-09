import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/build-course-prompt-ledger.mjs <cass-export.json> <output.md>");
}

const events = JSON.parse(await readFile(inputPath, "utf8"));
const messages = events
  .filter((event) => event.type === "response_item"
    && event.payload?.type === "message"
    && event.payload?.role === "user")
  .map((event) => ({
    timestamp: event.timestamp,
    text: (event.payload.content ?? [])
      .filter((item) => item.type === "input_text")
      .map((item) => item.text)
      .join("\n")
      .trim(),
  }))
  .filter((message) => message.text && !message.text.startsWith("<environment_context>"));

function redact(text) {
  return text
    .replace(/\b[0-9a-f]{64}\b/gi, "[REDACTED TEMPORARY API KEY]")
    .replaceAll("/Users/ryan/Downloads/Course\\ Guide\\ -\\ AI\\ in\\ GTM\\ School\\ July\\ 2026.pdf", "[local course guide PDF]")
    .replaceAll("/Users/ryan/Downloads/Where\\ the\\ Wild\\ Computers\\ Are\\ -\\ AI\\ in\\ GTM\\ -\\ 2026-08-20.pdf", "[local session deck PDF]");
}

const lines = [];
for (const message of messages) {
  for (const line of redact(message.text).split("\n")) lines.push(`> ${line}`.trimEnd());
  lines.push("", "---", "");
}
lines.splice(-3);
lines.push("");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join("\n")}\n`);
