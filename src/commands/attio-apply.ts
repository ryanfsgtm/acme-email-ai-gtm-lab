import fs from "node:fs/promises";
import path from "node:path";
import { attioClientFromEnv } from "../lib/attio.js";
import { readJsonl } from "../lib/jsonl.js";
import { inspectRemoteSeedState, type RemoteSeedRow, type SeedKind } from "../lib/attio-state.js";
import type { Account, Contact, Opportunity } from "../lib/schema.js";

interface AttioRecordResponse { data: { id: { record_id: string } } }
interface AttioNoteResponse { data: { id: { note_id: string } } }
interface MemberResponse { data: Array<{ email_address: string }> }
interface SeedNote {
  externalId: string; parentExternalId: string; title: string; format: "markdown";
  createdAt: string; content: string;
}
interface LedgerRow extends RemoteSeedRow { workspaceId: string }

const domainFor = (accountId: string): string => `${accountId.replaceAll("_", "-")}.acme-email.example.com`;
const emailFor = (contact: Contact): string => `${contact.id.replaceAll("_", "-")}@${domainFor(contact.accountId)}`;

function splitName(name: string): { first_name: string; last_name: string; full_name: string } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts.shift() ?? name, last_name: parts.join(" "), full_name: name };
}

function dealStage(opportunity: Opportunity): string {
  if (opportunity.outcome === "Won") return "Won 🎉";
  if (opportunity.outcome === "Lost") return "Lost";
  if (opportunity.stage === "Prospecting") return "Lead";
  return "In Progress";
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>, label: string): Promise<void> {
  let cursor = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]!);
      completed += 1;
      if (completed % 100 === 0 || completed === items.length) console.log(`${label}: ${completed}/${items.length}`);
    }
  }));
}

export async function attioApply(dataDir: string, seedDir: string, ledgerFile: string, approved: boolean, concurrency: number): Promise<void> {
  if (!approved) throw new Error("Refusing to write. Re-run with --approve after reviewing npm run attio:plan.");
  const client = attioClientFromEnv();
  const accounts = await readJsonl<Account>(path.join(dataDir, "accounts.jsonl"));
  const contacts = await readJsonl<Contact>(path.join(dataDir, "contacts.jsonl"));
  const opportunities = await readJsonl<Opportunity>(path.join(dataDir, "opportunities.jsonl"));
  const notes = await readJsonl<SeedNote>(path.join(seedDir, "notes.jsonl"));
  const members = await client.get<MemberResponse>("/workspace_members");
  const configuredOwner = process.env.ATTIO_DEAL_OWNER_EMAIL?.trim();
  if (configuredOwner && !members.data.some((member) => member.email_address === configuredOwner)) {
    throw new Error(`ATTIO_DEAL_OWNER_EMAIL does not match a workspace member: ${configuredOwner}`);
  }
  if (!configuredOwner && members.data.length !== 1) {
    throw new Error("This workspace has multiple members. Set ATTIO_DEAL_OWNER_EMAIL in .env.");
  }
  const ownerEmail = configuredOwner ?? members.data[0]!.email_address;

  console.log("Reconciling the remote workspace before writing...");
  const remote = await inspectRemoteSeedState(client);
  if (remote.duplicates.length) {
    throw new Error(`Found ${remote.duplicates.length} duplicate ACME identifiers in Attio. Run npm run attio:verify and resolve them before applying.`);
  }

  await fs.mkdir(path.dirname(ledgerFile), { recursive: true });
  const completed = new Map<string, LedgerRow>();
  try {
    for (const row of await readJsonl<LedgerRow>(ledgerFile)) {
      if (row.workspaceId !== remote.workspaceId) {
        throw new Error("The import ledger belongs to a different Attio workspace. Move it aside before seeding this workspace.");
      }
      completed.set(`${row.kind}:${row.externalId}`, row);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const ledger = await fs.open(ledgerFile, "a");
  let ledgerWrites = Promise.resolve();
  const record = async (row: RemoteSeedRow): Promise<void> => {
    const ledgerRow: LedgerRow = { ...row, workspaceId: remote.workspaceId };
    completed.set(`${row.kind}:${row.externalId}`, ledgerRow);
    ledgerWrites = ledgerWrites.then(async () => { await ledger.write(`${JSON.stringify(ledgerRow)}\n`); });
    await ledgerWrites;
  };

  try {
    const expectedIds: Record<SeedKind, Set<string>> = {
      company: new Set(accounts.map((row) => row.id)),
      person: new Set(contacts.map((row) => row.id)),
      deal: new Set(opportunities.map((row) => row.id)),
      note: new Set(notes.map((row) => row.externalId)),
    };
    for (const row of remote.rows) {
      if (!expectedIds[row.kind].has(row.externalId)) continue;
      const key = `${row.kind}:${row.externalId}`;
      const ledgerRow = completed.get(key);
      if (ledgerRow && ledgerRow.attioId !== row.attioId) {
        throw new Error(`Ledger and Attio disagree for ${key}. Run npm run attio:verify.`);
      }
      if (!ledgerRow) await record(row);
    }

    await runPool(accounts.filter((row) => !completed.has(`company:${row.id}`)), concurrency, async (account) => {
      const response = await client.request<AttioRecordResponse>("PUT", "/objects/companies/records?matching_attribute=domains", {
        data: { values: {
          domains: [domainFor(account.id)], name: account.name,
          description: `ACME Account ID: ${account.id} | ${account.segment} | ${account.industry} | ${account.region} | ${account.employees} employees | ARR $${account.arr}`,
        } },
      });
      await record({ kind: "company", externalId: account.id, attioId: response.data.id.record_id });
    }, "Companies");

    await runPool(contacts.filter((row) => !completed.has(`person:${row.id}`)), concurrency, async (contact) => {
      const response = await client.request<AttioRecordResponse>("PUT", "/objects/people/records?matching_attribute=email_addresses", {
        data: { values: {
          email_addresses: [emailFor(contact)], name: [splitName(contact.name)], job_title: contact.title,
          description: `ACME Contact ID: ${contact.id} | Persona: ${contact.persona}`,
          company: [{ target_object: "companies", target_record_id: completed.get(`company:${contact.accountId}`)!.attioId }],
        } },
      });
      await record({ kind: "person", externalId: contact.id, attioId: response.data.id.record_id });
    }, "People");

    await runPool(opportunities.filter((row) => !completed.has(`deal:${row.id}`)), concurrency, async (opportunity) => {
      const response = await client.request<AttioRecordResponse>("POST", "/objects/deals/records", {
        data: { values: {
          name: `${opportunity.name} [${opportunity.id}]`, stage: dealStage(opportunity), owner: ownerEmail,
          value: opportunity.amount,
          associated_company: { target_object: "companies", target_record_id: completed.get(`company:${opportunity.accountId}`)!.attioId },
        } },
      });
      await record({ kind: "deal", externalId: opportunity.id, attioId: response.data.id.record_id });
    }, "Deals");

    await runPool(notes.filter((row) => !completed.has(`note:${row.externalId}`)), concurrency, async (note) => {
      const createdAt = new Date(note.createdAt).getTime() > Date.now() ? new Date().toISOString() : note.createdAt;
      const response = await client.request<AttioNoteResponse>("POST", "/notes", {
        data: {
          parent_object: "companies",
          parent_record_id: completed.get(`company:${note.parentExternalId}`)!.attioId,
          title: note.title, format: note.format, content: note.content, created_at: createdAt,
        },
      });
      await record({ kind: "note", externalId: note.externalId, attioId: response.data.id.note_id });
    }, "Notes");
  } finally {
    await ledgerWrites;
    await ledger.close();
  }
  console.log(`Attio import complete. Ledger: ${path.relative(process.cwd(), ledgerFile)}`);
}
