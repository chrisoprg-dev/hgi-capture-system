// api/hunt.js
// HGI Automated Hunt Engine
// Fetches real opportunities from SAM.gov + state portals, analyzes with Claude, stores in Supabase

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SAM_API_KEY = process.env.SAM_GOV_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const HGI_CONTEXT = `Hammerman & Gainer LLC (HGI) — 95 years. Core capabilities:
- Disaster Recovery: CDBG-DR, FEMA PA, HMGP, BRIC, Housing Recovery. Past: Road Home $12B, Restore Louisiana, BP GCCF 1M+ claims
- TPA/Claims: Workers Comp TPA, P&C, Insurance Guaranty Associations. Past: TPCIGA 20yrs Texas, LIGA Louisiana
- Property Tax Appeals: 10+ years City of New Orleans. Replicable model for cities/parishes/counties
- Workforce & Social Services: Louisiana Workforce Commission, unemployment adjudication, benefits admin
- Health & Human Services: LDH, public health program admin, case processing, compliance
- Infrastructure & Capital: Transit authorities, construction management, financial monitoring
- Federal: PBGC 34M beneficiaries, HUD, FEMA, Treasury ERAP-type programs
Geography: Louisiana (all parishes), Texas, Florida, Mississippi, Alabama, Georgia, Federal
NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190`;

// ── SUPABASE HELPERS ──────────────────────────────────────────────────────────
async function supabase(method, table, body = null, params = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": method === "POST" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── CLAUDE HELPER ─────────────────────────────────────────────────────────────
async function claude(prompt, system, maxTokens = 2000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: system || "You are an expert government contracting analyst for HGI.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
}

// ── SAM.GOV FETCH ─────────────────────────────────────────────────────────────
async function fetchSamGov() {
  const naicsCodes = ["541611","541690","561110","561990","524291","923120","921190","541512","541519"];
  const results = [];

  for (const naics of naicsCodes.slice(0, 4)) { // Limit to avoid timeout
    try {
      const params = new URLSearchParams({
        api_key: SAM_API_KEY,
        naicsCode: naics,
        limit: "10",
        postedFrom: getDateDaysAgo(30),
        postedTo: getToday(),
        active: "true",
      });
      const res = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.opportunitiesData) results.push(...data.opportunitiesData);
    } catch(e) {
      console.warn("SAM NAICS fetch failed:", naics, e.message);
    }
  }

  // Also search by keywords relevant to HGI
  const keywords = ["disaster recovery", "CDBG-DR", "grant management", "claims administration", "property tax", "workforce"];
  for (const kw of keywords.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        api_key: SAM_API_KEY,
        keyword: kw,
        limit: "10",
        postedFrom: getDateDaysAgo(30),
        postedTo: getToday(),
        active: "true",
      });
      const res = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.opportunitiesData) results.push(...data.opportunitiesData);
    } catch(e) {
      console.warn("SAM keyword fetch failed:", kw, e.message);
    }
  }

  // Deduplicate by noticeId
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });
}

// ── LAPAC FETCH ───────────────────────────────────────────────────────────────
async function fetchLaPAC() {
  try {
    const res = await fetch("https://lapac.doa.louisiana.gov/vendor/bidding/current-solicitations/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HGI-CaptureSystem/1.0)" }
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseLaPACHtml(html);
  } catch(e) {
    console.warn("LaPAC fetch failed:", e.message);
    return [];
  }
}

function parseLaPACHtml(html) {
  const results = [];
  // Extract table rows with bid info
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const linkRegex = /href=["']([^"']+)["'][^>]*>([^<]+)/i;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length >= 3 && cells[0] && cells[0].length > 3) {
      const linkMatch = linkRegex.exec(row);
      results.push({
        bidNumber: cells[0],
        title: cells[1] || cells[0],
        agency: cells[2] || "Louisiana State Agency",
        dueDate: cells[3] || "",
        url: linkMatch ? "https://lapac.doa.louisiana.gov" + linkMatch[1] : "https://lapac.doa.louisiana.gov",
        source: "LaPAC",
        state: "LA",
      });
    }
  }
  return results.slice(0, 20);
}

// ── ANALYZE OPPORTUNITY WITH CLAUDE ──────────────────────────────────────────
async function analyzeOpportunity(opp) {
  const prompt = `Analyze this government procurement opportunity for HGI and return JSON only.

OPPORTUNITY DATA:
Title: ${opp.title}
Agency: ${opp.agency}
State: ${opp.state || "Federal"}
NAICS: ${opp.naics || ""}
Set-Aside: ${opp.setAside || "Full & Open"}
Due Date: ${opp.dueDate || "Unknown"}
Posted: ${opp.postedDate || ""}
Value: ${opp.estimatedValue || "Not specified"}
Description: ${opp.description || ""}
${opp.rfpText ? "RFP TEXT:\n" + opp.rfpText.slice(0, 3000) : ""}

HGI PROFILE:
${HGI_CONTEXT}

Return ONLY this JSON (no markdown):
{
  "vertical": "disaster|tpa|workforce|health|infrastructure|tax_appeals|federal",
  "opiScore": number 0-100,
  "urgency": "IMMEDIATE|ACTIVE|PIPELINE|WATCH",
  "strategicImportance": "TIER_1|TIER_2|TIER_3",
  "hgiRelevance": "HIGH|MEDIUM|LOW",
  "hgiFit": "1-2 sentences on fit",
  "whyHgiWins": ["reason 1", "reason 2", "reason 3"],
  "keyRequirements": ["req 1", "req 2"],
  "scopeOfWork": ["deliverable 1", "deliverable 2", "deliverable 3", "deliverable 4"],
  "captureAction": "single most important action HGI should take this week",
  "incumbent": "name if detectable or empty",
  "recompete": true or false,
  "description": "2-3 sentence plain English summary"
}`;

  try {
    const raw = await claude(prompt, "You are a senior capture analyst for HGI. Return ONLY valid JSON.", 1500);
    const clean = raw.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    return JSON.parse(clean.slice(s, e + 1));
  } catch(err) {
    console.warn("Analysis failed for:", opp.title, err.message);
    return {
      vertical: "federal",
      opiScore: 50,
      urgency: "WATCH",
      strategicImportance: "TIER_3",
      hgiRelevance: "MEDIUM",
      hgiFit: "Needs manual review",
      whyHgiWins: ["HGI has relevant past performance"],
      keyRequirements: [],
      scopeOfWork: [],
      captureAction: "Review opportunity manually",
      incumbent: "",
      recompete: false,
      description: opp.description || opp.title,
    };
  }
}

// ── FETCH OPPORTUNITY DOCUMENTS ───────────────────────────────────────────────
async function fetchDocuments(opp) {
  if (!opp.sourceUrl) return [];
  const docs = [];
  try {
    const res = await fetch(opp.sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HGI-CaptureSystem/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return [];
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("pdf")) {
      const buf = await res.arrayBuffer();
      docs.push({ name: "solicitation.pdf", url: opp.sourceUrl, type: "pdf", size: buf.byteLength });
    } else {
      const html = await res.text();
      // Extract PDF/doc links
      const linkRegex = /href=["']([^"']*\.(pdf|docx?)[^"']*)/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const docUrl = resolveUrl(m[1], opp.sourceUrl);
        if (docUrl) docs.push({ name: docUrl.split("/").pop().split("?")[0], url: docUrl, type: m[2] });
      }
    }
  } catch(e) {
    console.warn("Doc fetch failed:", e.message);
  }
  return docs.slice(0, 5);
}

// ── SAVE TO SUPABASE ──────────────────────────────────────────────────────────
async function saveOpportunity(oppData) {
  try {
    await supabase("POST", "opportunities", oppData, "?on_conflict=id");
    return true;
  } catch(e) {
    // Try upsert via PATCH if already exists
    try {
      await supabase("PATCH", "opportunities", oppData, `?id=eq.${oppData.id}`);
      return true;
    } catch(e2) {
      console.warn("Save failed:", e2.message);
      return false;
    }
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getToday() { return new Date().toISOString().split("T")[0]; }
function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
function resolveUrl(href, base) {
  if (!href || href.startsWith("javascript:")) return null;
  try {
    if (href.startsWith("http")) return href;
    return new URL(href, base).href;
  } catch { return null; }
}
function makeSafeId(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80);
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth check for cron — Vercel sends Authorization header for cron jobs
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.method === "GET" && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const mode = req.query.mode || req.body?.mode || "full";
  const logEntry = { run_at: new Date().toISOString(), source: "cron", status: "running" };

  try {
    let allOpportunities = [];
    let newCount = 0;

    // ── 1. Fetch from SAM.gov ──
    console.log("Fetching SAM.gov...");
    const samResults = await fetchSamGov();
    console.log(`SAM.gov returned ${samResults.length} results`);

    for (const opp of samResults) {
      const sourceUrl = opp.uiLink || `https://sam.gov/opp/${opp.noticeId}/view`;
      allOpportunities.push({
        id: "sam-" + makeSafeId(opp.noticeId || opp.solicitationNumber || opp.title),
        title: opp.title,
        agency: opp.fullParentPathName || opp.organizationHierarchy?.[0]?.name || "Federal Agency",
        state: extractState(opp),
        solicitation_number: opp.solicitationNumber,
        naics: opp.naicsCode,
        set_aside: opp.typeOfSetAside || opp.typeOfSetAsideDescription,
        contract_type: opp.type,
        due_date: opp.responseDeadLine || opp.archiveDate,
        posted_date: opp.postedDate,
        source: "SAM.gov",
        source_url: sourceUrl,
        description: opp.description?.slice(0, 1000) || "",
        rfp_text: opp.description || "",
        raw_sam_data: opp,
        discovered_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      });
    }

    // ── 2. Fetch from LaPAC ──
    console.log("Fetching LaPAC...");
    const lapacResults = await fetchLaPAC();
    console.log(`LaPAC returned ${lapacResults.length} results`);

    for (const opp of lapacResults) {
      allOpportunities.push({
        id: "lapac-" + makeSafeId(opp.bidNumber || opp.title),
        title: opp.title,
        agency: opp.agency,
        state: "LA",
        solicitation_number: opp.bidNumber,
        due_date: opp.dueDate,
        source: "LaPAC",
        source_url: opp.url,
        description: opp.title,
        rfp_text: "",
        discovered_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      });
    }

    console.log(`Total opportunities to analyze: ${allOpportunities.length}`);

    // ── 3. Filter — only analyze HGI-relevant ones ──
    const toAnalyze = allOpportunities.slice(0, 20); // Cap to avoid timeout

    // ── 4. Analyze each with Claude & save ──
    for (const opp of toAnalyze) {
      try {
        const analysis = await analyzeOpportunity(opp);

        // Skip very low relevance
        if (analysis.hgiRelevance === "LOW" && analysis.opiScore < 30) continue;

        // Fetch documents for active/immediate opportunities
        let docs = [];
        if (analysis.urgency === "IMMEDIATE" || analysis.urgency === "ACTIVE") {
          docs = await fetchDocuments(opp);
        }

        const fullRecord = {
          ...opp,
          vertical: analysis.vertical,
          opi_score: analysis.opiScore,
          urgency: analysis.urgency,
          strategic_importance: analysis.strategicImportance,
          hgi_relevance: analysis.hgiRelevance,
          hgi_fit: analysis.hgiFit,
          why_hgi_wins: analysis.whyHgiWins,
          key_requirements: analysis.keyRequirements,
          scope_of_work: analysis.scopeOfWork,
          capture_action: analysis.captureAction,
          incumbent: analysis.incumbent,
          recompete: analysis.recompete,
          description: analysis.description || opp.description,
          documents: docs,
          documents_fetched: docs.length > 0,
          analyzed_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        };

        const saved = await saveOpportunity(fullRecord);
        if (saved) newCount++;

      } catch(e) {
        console.warn("Failed to process:", opp.title, e.message);
      }
    }

    // ── 5. Log the run ──
    await supabase("POST", "hunt_runs", {
      run_at: new Date().toISOString(),
      source: "automated",
      opportunities_found: allOpportunities.length,
      opportunities_new: newCount,
      status: "completed",
    });

    return res.status(200).json({
      success: true,
      found: allOpportunities.length,
      analyzed: toAnalyze.length,
      saved: newCount,
      timestamp: new Date().toISOString(),
    });

  } catch(err) {
    console.error("Hunt engine error:", err);
    try {
      await supabase("POST", "hunt_runs", {
        run_at: new Date().toISOString(),
        source: "automated",
        status: "error",
        error: err.message,
      });
    } catch(e2) {}
    return res.status(500).json({ error: err.message });
  }
}

function extractState(samOpp) {
  const placeOfPerf = samOpp.placeOfPerformance;
  if (placeOfPerf?.state?.code) return placeOfPerf.state.code;
  if (placeOfPerf?.state?.name) {
    const stateMap = { "Louisiana": "LA", "Texas": "TX", "Florida": "FL", "Mississippi": "MS", "Alabama": "AL", "Georgia": "GA" };
    return stateMap[placeOfPerf.state.name] || placeOfPerf.state.name;
  }
  return "Federal";
}
