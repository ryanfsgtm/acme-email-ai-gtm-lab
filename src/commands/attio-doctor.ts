import { attioClientFromEnv, type AttioObject } from "../lib/attio.js";

interface ListResponse<T> { data: T[] }
interface Member { email_address: string }

export async function attioDoctor(): Promise<void> {
  const client = attioClientFromEnv();
  const objects = await client.get<ListResponse<AttioObject>>("/objects");
  const notes = await client.get<ListResponse<unknown>>("/notes?limit=1");
  const companies = await client.request<ListResponse<unknown>>("POST", "/objects/companies/records/query", { limit: 1 });
  const members = await client.get<ListResponse<Member>>("/workspace_members");
  const slugs = new Set(objects.data.map((object) => object.api_slug));
  const required = ["companies", "people", "deals"];
  const missing = required.filter((slug) => !slugs.has(slug));

  console.log("✓ Attio credentials accepted");
  console.log(`✓ Object configuration readable (${objects.data.length} objects)`);
  console.log("✓ Notes readable");
  console.log("✓ Records readable");
  console.log("✓ Workspace members readable");
  if (missing.length) {
    throw new Error(`Enable these standard objects in Attio before seeding: ${missing.join(", ")}`);
  }
  console.log("✓ Companies, People, and Deals are enabled");
  const configuredOwner = process.env.ATTIO_DEAL_OWNER_EMAIL?.trim();
  if (configuredOwner && !members.data.some((member) => member.email_address === configuredOwner)) {
    throw new Error(`ATTIO_DEAL_OWNER_EMAIL does not match a workspace member: ${configuredOwner}`);
  }
  if (!configuredOwner && members.data.length !== 1) {
    throw new Error("This workspace has multiple members. Set ATTIO_DEAL_OWNER_EMAIL in .env.");
  }
  console.log(`✓ Deal owner resolved (${configuredOwner ?? members.data[0]?.email_address})`);
  console.log(`  Existing note sample count: ${notes.data.length}`);
  console.log(`  Existing company sample count: ${companies.data.length}`);
  console.log("Read-only check complete; no records were changed.");
}
