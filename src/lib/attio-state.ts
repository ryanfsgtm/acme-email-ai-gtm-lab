import type { AttioClient } from "./attio.js";

interface RecordRow {
  id: { workspace_id: string; record_id: string };
  values: Record<string, Array<{ value?: string }>>;
}
interface NoteRow {
  id: { workspace_id: string; note_id: string };
  title: string;
}
interface ListResponse<T> { data: T[] }
interface ObjectRow { id: { workspace_id: string } }

export type SeedKind = "company" | "person" | "deal" | "note";
export interface RemoteSeedRow { kind: SeedKind; externalId: string; attioId: string }
export interface RemoteSeedState {
  workspaceId: string;
  rows: RemoteSeedRow[];
  duplicates: Array<{ kind: SeedKind; externalId: string; attioIds: string[] }>;
  totals: { companies: number; people: number; deals: number; notes: number };
}

const markers: Record<Exclude<SeedKind, "note">, { attribute: string; pattern: RegExp }> = {
  company: { attribute: "description", pattern: /ACME Account ID: (acct_\d{5})/ },
  person: { attribute: "description", pattern: /ACME Contact ID: (person_\d{5})/ },
  deal: { attribute: "name", pattern: /\[(opp_\d{5})\]$/ },
};

async function listRecords(client: AttioClient, object: "companies" | "people" | "deals"): Promise<RecordRow[]> {
  const rows: RecordRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await client.request<ListResponse<RecordRow>>(
      "POST", `/objects/${object}/records/query`, { limit: 500, offset },
    );
    rows.push(...page.data);
    if (page.data.length < 500) return rows;
  }
}

async function listNotes(client: AttioClient): Promise<NoteRow[]> {
  const rows: NoteRow[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await client.get<ListResponse<NoteRow>>(`/notes?limit=50&offset=${offset}`);
    rows.push(...page.data);
    if (page.data.length < 50) return rows;
  }
}

function textValue(record: RecordRow, attribute: string): string {
  return record.values[attribute]?.[0]?.value ?? "";
}

export async function inspectRemoteSeedState(client: AttioClient): Promise<RemoteSeedState> {
  const [objects, companies, people, deals, notes] = await Promise.all([
    client.get<ListResponse<ObjectRow>>("/objects"),
    listRecords(client, "companies"), listRecords(client, "people"), listRecords(client, "deals"), listNotes(client),
  ]);
  const rows: RemoteSeedRow[] = [];
  let workspaceId = objects.data[0]?.id.workspace_id ?? companies[0]?.id.workspace_id ?? people[0]?.id.workspace_id ?? deals[0]?.id.workspace_id ?? notes[0]?.id.workspace_id;

  for (const [kind, records] of [["company", companies], ["person", people], ["deal", deals]] as const) {
    const marker = markers[kind];
    for (const record of records) {
      workspaceId ??= record.id.workspace_id;
      const match = textValue(record, marker.attribute).match(marker.pattern);
      if (match?.[1]) rows.push({ kind, externalId: match[1], attioId: record.id.record_id });
    }
  }
  for (const note of notes) {
    workspaceId ??= note.id.workspace_id;
    const match = note.title.match(/^\[ACME Call (call_\d{5})\]/);
    if (match?.[1]) rows.push({ kind: "note", externalId: match[1], attioId: note.id.note_id });
  }
  if (!workspaceId) throw new Error("Could not determine the Attio workspace ID.");

  const grouped = new Map<string, RemoteSeedRow[]>();
  for (const row of rows) {
    const key = `${row.kind}:${row.externalId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const duplicates = [...grouped.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ kind: group[0]!.kind, externalId: group[0]!.externalId, attioIds: group.map((row) => row.attioId) }));

  return {
    workspaceId,
    rows,
    duplicates,
    totals: { companies: companies.length, people: people.length, deals: deals.length, notes: notes.length },
  };
}
