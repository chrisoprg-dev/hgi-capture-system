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
    // ── POST — handle set_batch action ──
    if (req.method === "POST" && req.body.action === "set_batch") {
      const huntRunData = {
        batch_number: req.body.batch,
        status: 'completed',
        run_at: new Date().toISOString()
      };
      
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/hunt_runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(huntRunData),
      });
      
      if (!res2.ok) throw new Error("Failed to insert hunt_run");
      
      return res.status(200).json({ success: true, batch: req.body.batch });
    }

    // ── PATCH — update a single opportunity (save to tracker, status change) ──
    if (req.method === "PATCH") {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: "ID required" });
      await supabaseUpdate(id, { ...updates, last_updated: new Date().toISOString() });
      return res.status(200).json({ success: true });
    }

    // ── GET — fetch opportunities with filters ──
    const {
      action,
      source_url,
      vertical = "all",
      state = "all",
      urgency = "all",
      minOpi = "0",
      limit = "50",
      sort = "opi_score.desc",
      includeSignals = "false",
      includeRuns = "false",
    } = req.query;

    // Handle get_batch action
    if (action === "get_batch") {
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/hunt_runs?status=eq.completed&order=run_at.desc&limit=1&select=batch_number`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Accept": "application/json",
        },
      });
      if (!res2.ok) return res.status(500).json({ error: "Failed to query hunt_runs" });
      const runs = await res2.json();
      const batch = runs.length > 0 ? runs[0].batch_number : 0;
      return res.status(200).json({ batch });
    }

    // Handle source_url check
    if (source_url) {
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?source_url=eq.${encodeURIComponent(source_url)}&select=id&limit=1`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Accept": "application/json",
        },
      });
      if (!res2.ok) return res.status(500).json({ error: "Failed to check source_url" });
      const records = await res2.json();
      return res.status(200).json({ exists: records.length > 0 });
    }

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