import { faker } from "@faker-js/faker";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import worldJson from "../../world/acme-email.json" with { type: "json" };
import { writeJson, writeJsonl, sha256 } from "../lib/io.js";
import { integer, pick, weighted } from "../lib/random.js";
import { WorldSchema, type Account, type Contact, type Opportunity, type TranscriptManifestRow } from "../lib/schema.js";

const regions = ["United States", "Canada", "United Kingdom", "DACH", "Benelux", "Nordics", "France", "ANZ"] as const;
const industries = ["Software", "Financial Services", "Healthcare", "Manufacturing", "Retail", "Professional Services", "Education", "Media"] as const;
const stages = ["Prospecting", "Discovery", "Evaluation", "Technical validation", "Procurement", "Closed"] as const;

function transcriptText(callId: string, account: Account, contact: Contact, opportunity: Opportunity | undefined, callType: string): string {
  return [
    `Call ID: ${callId}`,
    `Account: ${account.name}`,
    `Call type: ${callType}`,
    "",
    `Alex (ACME Email): Thanks for joining. I want to understand how your team runs lifecycle marketing today.`,
    `${contact.name} (${contact.title}): We have several campaigns running, but reporting and handoffs take more work than they should.`,
    `Alex (ACME Email): What would need to change for this project to be successful?`,
    `${contact.name}: The workflow needs to be understandable to the whole team, and we need confidence that the CRM data stays accurate.`,
    opportunity ? `Alex (ACME Email): We'll document those requirements as we evaluate the ${opportunity.name} project.` : "Alex (ACME Email): Let's capture that and agree on next steps.",
    `${contact.name}: That works. Send the technical details and we'll review them internally.`,
    "",
  ].join("\n");
}

export async function generate(outputDir: string): Promise<void> {
  const world = WorldSchema.parse(worldJson);
  faker.seed(world.seed);
  const random = () => faker.number.float({ min: 0, max: 1 });

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(path.join(outputDir, "transcripts"), { recursive: true });

  const accounts: Account[] = Array.from({ length: world.scale.accounts }, (_, index) => {
    const segment = weighted(world.segments, random);
    return {
      id: `acct_${String(index + 1).padStart(5, "0")}`,
      name: faker.company.name(),
      segment: segment.name,
      employees: integer(segment.minEmployees, segment.maxEmployees, random),
      region: pick(regions, random),
      industry: pick(industries, random),
      arr: integer(segment.minArr, segment.maxArr, random),
    };
  });

  const contacts: Contact[] = Array.from({ length: world.scale.contacts }, (_, index) => {
    const account = pick(accounts, random);
    const persona = pick(world.personas, random);
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    return {
      id: `person_${String(index + 1).padStart(5, "0")}`,
      accountId: account.id,
      name: `${first} ${last}`,
      title: persona,
      persona,
      email: faker.internet.email({ firstName: first, lastName: last, provider: "example.invalid" }).toLowerCase(),
    };
  });

  const opportunities: Opportunity[] = Array.from({ length: world.scale.opportunities }, (_, index) => {
    const account = pick(accounts, random);
    const outcome = pick(["Open", "Won", "Lost"] as const, random);
    return {
      id: `opp_${String(index + 1).padStart(5, "0")}`,
      accountId: account.id,
      name: `${account.name} Marketing Automation`,
      amount: account.arr,
      stage: outcome === "Open" ? pick(stages.slice(0, -1), random) : "Closed",
      competitor: random() < 0.55 ? pick(world.competitors, random) : null,
      closeDate: faker.date.between({ from: "2025-02-20", to: "2026-08-20" }).toISOString(),
      outcome,
    };
  });

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const contactsByAccount = Map.groupBy(contacts, (contact) => contact.accountId);
  const opportunitiesByAccount = Map.groupBy(opportunities, (opportunity) => opportunity.accountId);
  const manifest: TranscriptManifestRow[] = [];

  for (let index = 0; index < world.scale.transcripts; index += 1) {
    const account = pick(accounts, random);
    const contact = pick(contactsByAccount.get(account.id) ?? contacts, random);
    const opportunity = random() < 0.88 ? pick(opportunitiesByAccount.get(account.id) ?? opportunities, random) : undefined;
    const callType = weighted(world.callTypes, random).name;
    const id = `call_${String(index + 1).padStart(5, "0")}`;
    const relativePath = `transcripts/${id}.txt`;
    const text = transcriptText(id, accountById.get(account.id)!, contact, opportunity, callType);
    await writeFile(path.join(outputDir, relativePath), text);
    manifest.push({
      id,
      accountId: account.id,
      opportunityId: opportunity?.id ?? null,
      callType,
      occurredAt: faker.date.between({ from: "2025-02-20", to: "2026-08-20" }).toISOString(),
      durationMinutes: integer(8, 55, random),
      path: relativePath,
      sha256: sha256(text),
      wordCount: text.trim().split(/\s+/).length,
    });
  }

  await Promise.all([
    writeJsonl(path.join(outputDir, "accounts.jsonl"), accounts),
    writeJsonl(path.join(outputDir, "contacts.jsonl"), contacts),
    writeJsonl(path.join(outputDir, "opportunities.jsonl"), opportunities),
    writeJsonl(path.join(outputDir, "manifest.jsonl"), manifest),
    writeJson(path.join(outputDir, "generation.json"), { seed: world.seed, scale: world.scale, generatedAt: new Date().toISOString() }),
  ]);
}

