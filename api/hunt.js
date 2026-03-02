// api/hunt.js — HGI Automated Hunt Engine
export const config = { maxDuration: 60 };

const HGI_CONTEXT = `Hammerman & Gainer LLC (HGI) — 95 years.
- Disaster Recovery: CDBG-DR, FEMA PA, HMGP, BRIC. Past: Road Home $12B, Restore Louisiana, BP GCCF 1M+ claims
- TPA/Claims: Workers Comp TPA, P&C, Insurance Guaranty. Past: TPCIGA 20yrs Texas, LIGA Louisiana
- Property Tax Appeals: 10+ years City of New Orleans
- Workforce: Louisiana Workforce Commission, unemployment adjudication, benefits admin
- Health: LDH, public health program admin, case processing
- Infrastructure: Transit, construction management, capital program oversight
- Federal: PBGC 34M beneficiaries, HUD, FEMA, Treasury ERAP-type
NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190`;

function getToday() { return new Date().toISOString().split("T")[0]; }
function getDaysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; }
function safeId(s) { return (s||"").replace(/[^a-zA-Z0-9\-_]/g,"-").slice(0,80); }
function resolveUrl(href, base) {
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) return null;
  try { return href.startsWith("http") ? href : new URL(href, base).href; } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const SAM_KEY = process.env.SAM_GOV_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: "Missing Supabase environment variables",
      SUPABASE_URL: SUPABASE_URL ? "set" : "MISSING",
      SUPABASE_SERVICE_KEY: SUPABASE_KEY ? "set" : "MISSING",
    });
  }

  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Accept": "application/json",
  };

  const dbGet = async (table, params="") => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: dbHeaders });
    if (!r.ok) throw new Error(`DB GET ${table}: ${await r.text()}`);
    return r.json();
  };

  const dbUpsert = async (table, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...dbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(data),
    });
    if (!r.ok) console.warn(`DB upsert ${table}:`, await r.text());
  };

  const dbPatch = async (table, id, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: dbHeaders, body: JSON.stringify(data),
    });
    if (!r.ok) console.warn(`DB patch ${table}:`, await r.text());
  };

  const askClaude = async (prompt, system, maxTokens=1500) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, system, messages:[{role:"user",content:prompt}] }),
    });
    const d = await r.json();
    return d.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "";
  };

  const fetchSam = async () => {
    if (!SAM_KEY) { console.warn("No SAM_GOV_API_KEY set"); return []; }
    const results = [];
    const searches = [
      { naicsCode: "541611" }, { naicsCode: "561110" },
      { keyword: "disaster+recovery" }, { keyword: "claims+administration" },
    ];
    for (const search of searches) {
      try {
        const params = new URLSearchParams({
          api_key: SAM_KEY, limit: "10",
          postedFrom: getDaysAgo(45), postedTo: getToday(), active: "true", ...search,
        });
        const r = await fetch(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, { headers: { "Accept":"application/json" } });
        if (!r.ok) { console.warn("SAM error:", r.status); continue; }
        const d = await r.json();
        if (d.opportunitiesData) results.push(...d.opportunitiesData);
      } catch(e) { console.warn("SAM search error:", e.message); }
    }
    const seen = new Set();
    return results.filter(r => { if (seen.has(r.noticeId)) return false; seen.add(r.noticeId); return true; });
  };

  const fetchLaPAC = async () => {
    try {
      const r = await fetch("https://lapac.doa.louisiana.gov/vendor/bidding/current-solicitations/", {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (!r.ok) return [];
      const html = await r.text();
      const results = [];
      const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowM;
      while ((rowM = rowRx.exec(html)) !== null) {
        const cells = [...rowM[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1].replace(/<[^>]+>/g,"").trim());
        const linkM = /href=["']([^"']+)["']/i.exec(rowM[1]);
        if (cells.length >= 2 && cells[0]?.length > 3) {
          results.push({
            id: "lapac-" + safeId(cells[0]),
            title: cells[1] || cells[0],
            agency: cells[2] || "Louisiana State Agency",
            dueDate: cells[3] || "",
            sourceUrl: linkM ? resolveUrl(linkM[1], "https://lapac.doa.louisiana.gov") : "https://lapac.doa.louisiana.gov",
          });
        }
      }
      return results.slice(0,15);
    } catch(e) { console.warn("LaPAC error:", e.message); return []; }
  };

  const analyzeOne = async (opp) => {
    const prompt = `Analyze for HGI. Return JSON only.
Title: ${opp.title}
Agency: ${opp.agency}
State: ${opp.state||"Federal"}
Due: ${opp.due_date||"Unknown"}
Description: ${(opp.description||opp.rfp_text||"").slice(0,2000)}
HGI: ${HGI_CONTEXT}

Return ONLY:
{"vertical":"disaster|tpa|workforce|health|infrastructure|tax_appeals|federal","opiScore":0-100,"urgency":"IMMEDIATE|ACTIVE|PIPELINE|WATCH","strategicImportance":"TIER_1|TIER_2|TIER_3","hgiRelevance":"HIGH|MEDIUM|LOW","hgiFit":"string","whyHgiWins":["a","b","c"],"keyRequirements":["a","b"],"scopeOfWork":["a","b","c","d"],"captureAction":"string","incumbent":"","recompete":false,"description":"string"}`;
    try {
      const raw = await askClaude(prompt, "Return ONLY valid JSON.", 1200);
      const clean = raw.replace(/```json|```/g,"").trim();
      return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}")+1));
    } catch(e) { console.warn("Analysis failed:", e.message); return null; }
  };

  const fetchDocs = async (url) => {
    if (!url) return [];
    try {
      const r = await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" }, redirect:"follow" });
      if (!r.ok) return [];
      const html = await r.text();
      const docs = [];
      const rx = /href=["']([^"']*\.(pdf|docx?)[^"']*)/gi;
      let m;
      while ((m = rx.exec(html)) !== null) {
        const docUrl = resolveUrl(m[1], url);
        if (docUrl) docs.push({ name: docUrl.split("/").pop().split("?")[0], url: docUrl, type: m[2] });
      }
      return docs.slice(0,5);
    } catch(e) { return []; }
  };

  const samToRecord = (opp) => ({
    id: "sam-" + safeId(opp.noticeId || opp.solicitationNumber || opp.title),
    title: opp.title,
    agency: opp.fullParentPathName || "Federal Agency",
    state: opp.placeOfPerformance?.state?.code || "Federal",
    solicitation_number: opp.solicitationNumber,
    naics: opp.naicsCode,
    set_aside: opp.typeOfSetAsideDescription || opp.typeOfSetAside,
    contract_type: opp.type,
    due_date: opp.responseDeadLine,
    posted_date: opp.postedDate,
    source: "SAM.gov",
    source_url: opp.uiLink || `https://sam.gov/opp/${opp.noticeId}/view`,
    description: (opp.description||"").slice(0,1000),
    rfp_text: opp.description || "",
    status: "discovered",
    discovered_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  });

  const summary = { fetched: 0, analyzed: 0, errors: 0 };

  try {
    console.log("PASS 1: Fetching SAM.gov...");
    const samResults = await fetchSam();
    console.log(`SAM: ${samResults.length} results`);
    for (const opp of samResults) {
      try { await dbUpsert("opportunities", samToRecord(opp)); summary.fetched++; }
      catch(e) { summary.errors++; }
    }

    console.log("PASS 1: Fetching LaPAC...");
    const lapacResults = await fetchLaPAC();
    console.log(`LaPAC: ${lapacResults.length} results`);
    for (const opp of lapacResults) {
      try {
        await dbUpsert("opportunities", {
          id: opp.id, title: opp.title, agency: opp.agency, state: "LA",
          due_date: opp.dueDate, source: "LaPAC", source_url: opp.sourceUrl,
          description: opp.title, status: "discovered",
          discovered_at: new Date().toISOString(), last_updated: new Date().toISOString(),
        });
        summary.fetched++;
      } catch(e) { summary.errors++; }
    }

    console.log("PASS 2: Analyzing unanalyzed...");
    const unanalyzed = await dbGet("opportunities", "?analyzed_at=is.null&order=discovered_at.desc&limit=8");
    console.log(`Analyzing ${unanalyzed.length} records`);

    for (const opp of unanalyzed) {
      try {
        const analysis = await analyzeOne(opp);
        if (!analysis) { summary.errors++; continue; }
        if (analysis.hgiRelevance === "LOW" && analysis.opiScore < 25) {
          await dbPatch("opportunities", opp.id, { analyzed_at: new Date().toISOString(), hgi_relevance: "LOW", opi_score: analysis.opiScore });
          continue;
        }
        const docs = ["IMMEDIATE","ACTIVE"].includes(analysis.urgency) ? await fetchDocs(opp.source_url) : [];
        await dbPatch("opportunities", opp.id, {
          vertical: analysis.vertical, opi_score: analysis.opiScore,
          urgency: analysis.urgency, strategic_importance: analysis.strategicImportance,
          hgi_relevance: analysis.hgiRelevance, hgi_fit: analysis.hgiFit,
          why_hgi_wins: analysis.whyHgiWins, key_requirements: analysis.keyRequirements,
          scope_of_work: analysis.scopeOfWork, capture_action: analysis.captureAction,
          incumbent: analysis.incumbent||"", recompete: analysis.recompete||false,
          description: analysis.description||opp.description,
          documents: docs, documents_fetched: docs.length>0,
          analyzed_at: new Date().toISOString(), last_updated: new Date().toISOString(),
        });
        summary.analyzed++;
      } catch(e) { console.warn("Analysis error:", opp.title, e.message); summary.errors++; }
    }

    await dbUpsert("hunt_runs", {
      run_at: new Date().toISOString(),
      source: req.method==="POST" ? "manual" : "cron",
      opportunities_found: summary.fetched,
      opportunities_new: summary.analyzed,
      status: "completed",
    });

    console.log("Hunt complete:", summary);
    return res.status(200).json({ success: true, ...summary, timestamp: new Date().toISOString() });

  } catch(err) {
    console.error("Hunt engine error:", err);
    try { await dbUpsert("hunt_runs", { run_at: new Date().toISOString(), source: "manual", status: "error", error: err.message }); } catch(e2) {}
    return res.status(500).json({ error: err.message, summary });
  }
}