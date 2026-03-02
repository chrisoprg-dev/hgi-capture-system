// api/opportunities.js
// Returns stored opportunities from Supabase with filtering and sorting

export const config = { maxDuration: 30 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(params = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/opportunities${params}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
  return res.json();
}

async function supabaseUpdate(id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function getHuntRuns() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/hunt_runs?order=run_at.desc&limit=5`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) return [];
  return res.json();
}

async function getSignals() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/signals?order=discovered_at.desc&limit=20`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ── PATCH — update a single opportunity (save to tracker, status change) ──
    if (req.method === "PATCH") {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: "ID required" });
      await supabaseUpdate(id, { ...updates, last_updated: new Date().toISOString() });
      return res.status(200).json({ success: true });
    }

    // ── GET — fetch opportunities with filters ──
    const {
      vertical = "all",
      state = "all",
      urgency = "all",
      minOpi = "0",
      limit = "50",
      sort = "opi_score.desc",
      includeSignals = "false",
      includeRuns = "false",
    } = req.query;

    const filters = ["hgi_relevance=neq.LOW"];
    if (vertical !== "all") filters.push(`vertical=eq.${vertical}`);
    if (state !== "all") filters.push(`state=eq.${state}`);
    if (urgency !== "all") filters.push(`urgency=eq.${urgency}`);
    if (parseInt(minOpi) > 0) filters.push(`opi_score=gte.${minOpi}`);

    const queryParams = [
      filters.length > 0 ? filters.join("&") : "",
      `order=${sort}`,
      `limit=${limit}`,
    ].filter(Boolean).join("&");

    const opportunities = await supabaseGet(`?${queryParams}`);

    const response = { opportunities, total: opportunities.length };

    if (includeRuns === "true") {
      response.huntRuns = await getHuntRuns();
    }
    if (includeSignals === "true") {
      response.signals = await getSignals();
    }

    return res.status(200).json(response);

  } catch(err) {
    console.error("Opportunities API error:", err);
    return res.status(500).json({ error: err.message });
  }
}