import fs from "node:fs/promises";
import path from "node:path";
import type { Account, Contact, Opportunity, TranscriptManifestRow } from "../lib/schema.js";
import { csvRow, readJsonl } from "../lib/jsonl.js";

function domainFor(accountId: string): string {
  return `${accountId.replaceAll("_", "-")}.acme-email.example.com`;
}

function emailFor(contact: Contact): string {
  return `${contact.id.replaceAll("_", "-")}@${domainFor(contact.accountId)}`;
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  return [parts.shift() ?? name, parts.join(" ")];
}

function dealStage(opportunity: Opportunity): string {
  if (opportunity.outcome === "Won") return "Won 🎉";
  if (opportunity.outcome === "Lost") return "Lost";
  if (opportunity.stage === "Prospecting") return "Lead";
  return "In Progress";
}

export async function attioExport(dataDir: string, outputDir: string): Promise<void> {
  const accounts = await readJsonl<Account>(path.join(dataDir, "accounts.jsonl"));
  const contacts = await readJsonl<Contact>(path.join(dataDir, "contacts.jsonl"));
  const opportunities = await readJsonl<Opportunity>(path.join(dataDir, "opportunities.jsonl"));
  const calls = await readJsonl<TranscriptManifestRow>(path.join(dataDir, "manifest.jsonl"));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  await fs.mkdir(outputDir, { recursive: true });

  let companies = csvRow(["ACME Account ID", "Name", "Domain", "Description"]);
  for (const account of accounts) {
    companies += csvRow([
      account.id,
      account.name,
      domainFor(account.id),
      `Synthetic ACME Email ${account.segment} account | ${account.industry} | ${account.region} | ${account.employees} employees | ARR $${account.arr}`,
    ]);
  }
  await fs.writeFile(path.join(outputDir, "companies.csv"), companies);

  let people = csvRow(["ACME Contact ID", "First name", "Last name", "Email", "Job title", "Company domain", "Description"]);
  for (const contact of contacts) {
    const [first, last] = splitName(contact.name);
    people += csvRow([
      contact.id, first, last, emailFor(contact), contact.title, domainFor(contact.accountId),
      `Synthetic ACME Email contact | Persona: ${contact.persona}`,
    ]);
  }
  await fs.writeFile(path.join(outputDir, "people.csv"), people);

  let deals = csvRow(["ACME Opportunity ID", "Deal name", "Stage", "Value", "Company domain", "Close date", "Description"]);
  for (const opportunity of opportunities) {
    deals += csvRow([
      opportunity.id, opportunity.name, dealStage(opportunity), opportunity.amount,
      domainFor(opportunity.accountId), opportunity.closeDate,
      `Synthetic ACME Email opportunity | Source stage: ${opportunity.stage} | Outcome: ${opportunity.outcome} | Competitor: ${opportunity.competitor ?? "none"}`,
    ]);
  }
  await fs.writeFile(path.join(outputDir, "deals.csv"), deals);

  const noteFile = await fs.open(path.join(outputDir, "notes.jsonl"), "w");
  try {
    for (const call of calls) {
      const account = accountById.get(call.accountId);
      if (!account) throw new Error(`Missing account ${call.accountId} for ${call.id}`);
      const transcript = await fs.readFile(path.join(dataDir, call.path), "utf8");
      const content = [
        `# ${call.callType} call`,
        "",
        `ACME Call ID: ${call.id}`,
        `Account: ${account.name} (${call.accountId})`,
        `Opportunity: ${call.opportunityId ?? "none"}`,
        `Occurred at: ${call.occurredAt}`,
        `Duration: ${call.durationMinutes} minutes`,
        `Source SHA-256: ${call.sha256}`,
        "",
        "## Transcript",
        "",
        transcript.trim(),
      ].join("\n");
      await noteFile.write(`${JSON.stringify({
        externalId: call.id,
        parentObject: "companies",
        parentExternalId: call.accountId,
        parentDomain: domainFor(call.accountId),
        title: `[ACME Call ${call.id}] ${call.callType}`,
        format: "markdown",
        createdAt: call.occurredAt,
        content,
        sha256: call.sha256,
      })}\n`);
    }
  } finally {
    await noteFile.close();
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: path.relative(process.cwd(), dataDir),
    counts: { companies: accounts.length, people: contacts.length, deals: opportunities.length, notes: calls.length },
    files: ["companies.csv", "people.csv", "deals.csv", "notes.jsonl"],
  };
  await fs.writeFile(path.join(outputDir, "seed-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote Attio seed artifacts to ${path.relative(process.cwd(), outputDir)}`);
  console.log(JSON.stringify(manifest.counts));
}
