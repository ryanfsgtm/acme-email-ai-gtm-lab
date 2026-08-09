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

function phase(index) {
  const promptNumber = index + 1;
  if (promptNumber <= 6) return "1. Choosing the exercise";
  if (promptNumber <= 12) return "2. Building the corpus";
  if (promptNumber <= 21) return "3. Making the CRM real";
  if (promptNumber <= 37) return "4. Building the classroom experience";
  if (promptNumber <= 44) return "5. Clean-room installation and release";
  if (promptNumber <= 47) return "6. Testing the thesis";
  return "7. Right-sizing the live exercise";
}

const grouped = new Map();
for (const [index, message] of messages.entries()) {
  const label = phase(index);
  if (!grouped.has(label)) grouped.set(label, []);
  grouped.get(label).push(message);
}

const lines = [
  "# Instructor appendix: complete prompt ledger",
  "",
  "> This is the user-authored prompt history that produced the ACME Email AI in GTM lab. It was mined from the originating Codex session and ordered chronologically. Wording, capitalization, shorthand, and typos are intentionally preserved. Environment metadata was omitted, local PDF paths were generalized, and the temporary Attio key was redacted.",
  "",
  `**Captured messages:** ${messages.length}  `,
  "**Period:** August 7–9, 2026  ",
  "**What is included:** strategy prompts, terse approvals, check-ins, corrections, deployment requests, and curriculum refinements.",
  "**Not included:** assistant replies, tool output, system instructions, and environment metadata.",
  "",
];

let promptNumber = 1;
for (const [label, phaseMessages] of grouped) {
  lines.push(`## ${label}`, "");
  for (const message of phaseMessages) {
    const localTime = new Date(message.timestamp).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    lines.push(`### Prompt ${promptNumber} · ${localTime}`, "");
    for (const line of redact(message.text).split("\n")) lines.push(`> ${line}`.trimEnd());
    lines.push("");
    promptNumber += 1;
  }
}

lines.push(
  "## How to use this ledger",
  "",
  "Read it as a record of progressive specification. Early prompts establish the business problem. Middle prompts make the environment real and observable. Later prompts are dominated by testing, scope control, regression correction, and teaching design. The short corrections are part of the method: they show that steering an agent is iterative and often conversational.",
  "",
  "For a shorter teaching narrative, see [The prompt journey](PROMPT-JOURNEY.md).",
  "",
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join("\n")}\n`);
