import { describe, expect, it } from "vitest";
import type { AttioClient } from "../src/lib/attio.js";
import { inspectRemoteSeedState } from "../src/lib/attio-state.js";

function record(workspaceId: string, recordId: string, attribute: string, value: string) {
  return { id: { workspace_id: workspaceId, record_id: recordId }, values: { [attribute]: [{ value }] } };
}

describe("Attio remote seed reconciliation", () => {
  it("counts only stable ACME markers and reports duplicates", async () => {
    const workspaceId = "workspace-1";
    const client = {
      get: async (path: string) => {
        if (path === "/objects") return { data: [{ id: { workspace_id: workspaceId } }] };
        if (path.startsWith("/notes")) return { data: [
          { id: { workspace_id: workspaceId, note_id: "note-1" }, title: "[ACME Call call_00001] Discovery" },
          { id: { workspace_id: workspaceId, note_id: "note-2" }, title: "[ACME Call call_00001] Discovery" },
          { id: { workspace_id: workspaceId, note_id: "other" }, title: "Unrelated note" },
        ] };
        throw new Error(`Unexpected GET ${path}`);
      },
      request: async (_method: string, path: string) => {
        if (path.includes("companies")) return { data: [
          record(workspaceId, "company-1", "description", "ACME Account ID: acct_00001 | SMB"),
          record(workspaceId, "sample", "description", "Attio sample company"),
        ] };
        if (path.includes("people")) return { data: [
          record(workspaceId, "person-1", "description", "ACME Contact ID: person_00001 | Persona: Marketing"),
        ] };
        if (path.includes("deals")) return { data: [
          record(workspaceId, "deal-1", "name", "ACME renewal [opp_00001]"),
        ] };
        throw new Error(`Unexpected request ${path}`);
      },
    } as unknown as AttioClient;

    const state = await inspectRemoteSeedState(client);

    expect(state.workspaceId).toBe(workspaceId);
    expect(state.rows).toHaveLength(5);
    expect(state.duplicates).toEqual([{ kind: "note", externalId: "call_00001", attioIds: ["note-1", "note-2"] }]);
    expect(state.totals).toEqual({ companies: 2, people: 1, deals: 1, notes: 3 });
  });

  it("handles a completely empty new workspace", async () => {
    const client = {
      get: async (path: string) => path === "/objects"
        ? { data: [{ id: { workspace_id: "workspace-empty" } }] }
        : { data: [] },
      request: async () => ({ data: [] }),
    } as unknown as AttioClient;

    const state = await inspectRemoteSeedState(client);
    expect(state.workspaceId).toBe("workspace-empty");
    expect(state.rows).toEqual([]);
    expect(state.duplicates).toEqual([]);
  });
});
