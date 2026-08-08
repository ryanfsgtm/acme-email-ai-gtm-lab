interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

type Phase = "start" | "end";

interface SurveyPayload {
  clientId: string;
  phase: Phase;
  role?: string;
  familiarity: number;
  confidence: number;
  tools?: string[];
  goal?: string;
  confidenceChange?: "increased" | "same" | "decreased";
  likelyUse?: number;
  mostValuable?: string;
  takeaway?: string;
}

const roles = new Set(["Sales", "Marketing", "RevOps / GTM Ops", "Customer Success", "Leadership", "Other"]);
const tools = new Set(["Claude Code", "Codex", "Cursor", "Other", "None yet"]);
const valuable = new Set(["Tool landscape", "Attio setup", "Naive vs. systematic", "Building the analysis system", "Live coding", "Other"]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function scale(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new Error(`${field} must be an integer from 1 to 5.`);
  }
  return Number(value);
}

function parseSurvey(input: unknown, phase: Phase): SurveyPayload {
  if (!input || typeof input !== "object") throw new Error("Survey body must be an object.");
  const body = input as Record<string, unknown>;
  const clientId = text(body.clientId, 80);
  if (!clientId || !/^[a-zA-Z0-9-]{16,80}$/.test(clientId)) throw new Error("Invalid anonymous browser ID.");
  const payload: SurveyPayload = {
    clientId,
    phase,
    familiarity: scale(body.familiarity, "familiarity"),
    confidence: scale(body.confidence, "confidence"),
  };
  if (phase === "start") {
    const role = text(body.role, 40);
    if (!role || !roles.has(role)) throw new Error("Choose a role.");
    const selectedTools = Array.isArray(body.tools)
      ? body.tools.filter((item): item is string => typeof item === "string" && tools.has(item)).slice(0, 5)
      : [];
    if (!selectedTools.length) throw new Error("Choose at least one coding-agent experience option.");
    if (selectedTools.includes("None yet") && selectedTools.length > 1) {
      throw new Error("Choose “None yet” by itself.");
    }
    payload.role = role;
    payload.tools = selectedTools;
    payload.goal = text(body.goal, 400) ?? undefined;
  } else {
    const confidenceChange = text(body.confidenceChange, 20);
    if (!confidenceChange || !["increased", "same", "decreased"].includes(confidenceChange)) {
      throw new Error("Choose how your confidence changed.");
    }
    const mostValuable = text(body.mostValuable, 60);
    if (!mostValuable || !valuable.has(mostValuable)) throw new Error("Choose the most valuable section.");
    payload.confidenceChange = confidenceChange as SurveyPayload["confidenceChange"];
    payload.likelyUse = scale(body.likelyUse, "likelyUse");
    payload.mostValuable = mostValuable;
    payload.takeaway = text(body.takeaway, 600) ?? undefined;
  }
  return payload;
}

async function saveSurvey(env: Env, payload: SurveyPayload): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO survey_responses (
      client_id, phase, role, familiarity, confidence, tools_json, goal,
      confidence_change, likely_use, most_valuable, takeaway, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_id, phase) DO UPDATE SET
      role = excluded.role,
      familiarity = excluded.familiarity,
      confidence = excluded.confidence,
      tools_json = excluded.tools_json,
      goal = excluded.goal,
      confidence_change = excluded.confidence_change,
      likely_use = excluded.likely_use,
      most_valuable = excluded.most_valuable,
      takeaway = excluded.takeaway,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    payload.clientId, payload.phase, payload.role ?? null, payload.familiarity, payload.confidence,
    JSON.stringify(payload.tools ?? []), payload.goal ?? null, payload.confidenceChange ?? null,
    payload.likelyUse ?? null, payload.mostValuable ?? null, payload.takeaway ?? null,
  ).run();
}

interface GroupRow { label: string | number; count: number }

async function grouped(env: Env, phase: Phase, column: string): Promise<GroupRow[]> {
  const allowed = new Set(["role", "familiarity", "confidence", "confidence_change", "likely_use", "most_valuable"]);
  if (!allowed.has(column)) throw new Error("Invalid aggregation column.");
  const result = await env.DB.prepare(`
    SELECT ${column} AS label, COUNT(*) AS count
    FROM survey_responses
    WHERE phase = ? AND ${column} IS NOT NULL
    GROUP BY ${column}
    ORDER BY ${column}
  `).bind(phase).all<GroupRow>();
  return result.results;
}

async function results(env: Env): Promise<Response> {
  const [counts, rolesResult, startFamiliarity, startConfidence, endFamiliarity, endConfidence, changes, likelyUse, valuableResult, toolsResult, paired] = await Promise.all([
    env.DB.prepare("SELECT phase AS label, COUNT(*) AS count FROM survey_responses GROUP BY phase").all<GroupRow>(),
    grouped(env, "start", "role"),
    grouped(env, "start", "familiarity"),
    grouped(env, "start", "confidence"),
    grouped(env, "end", "familiarity"),
    grouped(env, "end", "confidence"),
    grouped(env, "end", "confidence_change"),
    grouped(env, "end", "likely_use"),
    grouped(env, "end", "most_valuable"),
    env.DB.prepare("SELECT tools_json FROM survey_responses WHERE phase = 'start'").all<{ tools_json: string }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS paired_count,
        ROUND(AVG(e.confidence - s.confidence), 2) AS confidence_delta,
        ROUND(AVG(e.familiarity - s.familiarity), 2) AS familiarity_delta
      FROM survey_responses s
      JOIN survey_responses e ON e.client_id = s.client_id AND e.phase = 'end'
      WHERE s.phase = 'start'
    `).first<{ paired_count: number; confidence_delta: number | null; familiarity_delta: number | null }>(),
  ]);
  const toolCounts = new Map<string, number>();
  for (const row of toolsResult.results) {
    try {
      for (const item of JSON.parse(row.tools_json) as string[]) toolCounts.set(item, (toolCounts.get(item) ?? 0) + 1);
    } catch {}
  }
  return json({
    updatedAt: new Date().toISOString(),
    counts: Object.fromEntries(counts.results.map((row) => [String(row.label), row.count])),
    start: { roles: rolesResult, familiarity: startFamiliarity, confidence: startConfidence, tools: [...toolCounts].map(([label, count]) => ({ label, count })) },
    end: { familiarity: endFamiliarity, confidence: endConfidence, changes, likelyUse, valuable: valuableResult },
    paired,
  });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true });
  if (request.method === "GET" && url.pathname === "/api/results") return results(env);
  const match = url.pathname.match(/^\/api\/survey\/(start|end)$/);
  if (request.method === "POST" && match) {
    try {
      const payload = parseSurvey(await request.json(), match[1] as Phase);
      await saveSurvey(env, payload);
      return json({ ok: true, phase: payload.phase });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Invalid survey response." }, 400);
    }
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
