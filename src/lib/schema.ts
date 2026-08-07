import { z } from "zod";

export const WorldSchema = z.object({
  seed: z.number().int(),
  company: z.object({ name: z.string(), category: z.string(), description: z.string() }),
  scale: z.object({
    accounts: z.number().int().positive(),
    contacts: z.number().int().positive(),
    opportunities: z.number().int().positive(),
    transcripts: z.number().int().positive(),
    months: z.number().int().positive(),
  }),
  segments: z.array(z.object({
    name: z.string(), minEmployees: z.number(), maxEmployees: z.number(),
    minArr: z.number(), maxArr: z.number(), weight: z.number().positive(),
  })),
  personas: z.array(z.string()),
  competitors: z.array(z.string()),
  callTypes: z.array(z.object({ name: z.string(), weight: z.number().positive() })),
});

export type World = z.infer<typeof WorldSchema>;

export interface Account {
  id: string;
  name: string;
  segment: string;
  employees: number;
  region: string;
  industry: string;
  arr: number;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  title: string;
  persona: string;
  email: string;
}

export interface Opportunity {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  stage: string;
  competitor: string | null;
  closeDate: string;
  outcome: "Open" | "Won" | "Lost";
}

export interface TranscriptManifestRow {
  id: string;
  accountId: string;
  opportunityId: string | null;
  callType: string;
  occurredAt: string;
  durationMinutes: number;
  path: string;
  sha256: string;
  wordCount: number;
}

