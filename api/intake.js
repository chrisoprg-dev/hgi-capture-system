// api/intake.js — HGI Opportunity Intake Engine
// Receives normalized opportunity data from Make.com or any external source
// Validates, deduplicates, analyzes with Claude, stores in Supabase
export const config = { maxDuration: 60 };

const HGI_CONTEXT = `Hammerman & Gainer LLC (HGI) — 95 years in business.
Core capabilities:
- Disaster Recovery: CDBG-DR, FEMA PA, HMGP, BRIC, Housing Recovery. Past performance: Road Home Program $12B, Restore Louisiana, BP GCCF 1M+ claims processed
- TPA/Claims Administration: Workers Comp TPA, Property & Casualty TPA, Insurance Guaranty Associations. Past: TPCIGA 20+ years Texas, LIGA Louisiana
- Property Tax Appeals: 10+ year history City of New Orleans. Proven recurring-revenue model replicable to any city/parish/county
- Workforce & Social Services: Louisiana Workforce Commission, unemployment adjudication, case management, benefits administration
- Health & Human Services: Louisiana Department of Health, public health program admin, claims processing, compliance monitoring
- Infrastructure & Capital Programs: Transit authorities, construction management, financial oversight, HUD/DOT/FTA program admin
- Federal Programs: PBGC 34M beneficiaries, HUD, FEMA, Treasury ERAP-type programs, federal claims administration
Geography: Louisiana (ALL parishes + municipal), Texas, Florida, Mississippi, Alabama, Georgia, Federal
Key NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190
Small/mid contracts: HGI actively pursues contracts under $500K if recurring or strategic`;

function safeId(s) {
  return (s || "").toString().replace(/[^a-zA-Z0-9\-_]/g, "-").slice(0, 80);
}

function stripScripts(html) {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{3,}/g, " ")
    .trim();
}

function deriveTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
    const lastSegment = pathSegments[pathSegments.length - 1];
    
    if (lastSegment) {
      // Remove file extensions and clean up
      const cleaned = lastSegment
        .replace(/\.(html?|php|aspx?|jsp)$/i, '')
        .replace(/[-_]/g, ' ')
        .trim();
      
      // Title case the result
      return cleaned.replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );
    }
  } catch (e) {
    console.warn("Failed to derive title from URL:", e.message);
  }
  
  return "Untitled Opportunity";
}

function calculateDaysUntilDeadline(dueDateString) {
  if (!dueDateString) return null;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let dueDate = null;
  
  // First try direct Date parsing
  dueDate = new Date(dueDateString);
  if (!isNaN(dueDate.getTime())) {
    dueDate.setHours(0, 0, 0, 0);
    const diffTime = dueDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Try manual parsing for common formats
  const dateStr = dueDateString.trim();
  
  // Try MM/DD/YYYY format
  const mmddyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mmddyyyy) {
    dueDate = new Date(mmddyyyy[3], mmddyyyy[1] - 1, mmddyyyy[2]);
    if (!isNaN(dueDate.getTime())) {
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate - now;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }
  
  // Try Month DD, YYYY format
  const monthMatch = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthMatch) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = monthNames.findIndex(m => m.toLowerCase().startsWith(monthMatch[1].toLowerCase().slice(0, 3)));
    if (monthIndex !== -1) {
      dueDate = new Date(monthMatch[3], monthIndex, monthMatch[2]);
      if (!isNaN(dueDate.getTime())) {
        dueDate.setHours(0, 0, 0, 0);
        const diffTime = dueDate - now;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }
  }
  
  return null;
}

function extractDaysUntilDeadline(dueDateString) {
  if (!dueDateString) return null;
  
  const now = new Date();
  let dueDate = null;
  
  // Try multiple date formats
  const formats = [
    // ISO format
    /^\d{4}-\d{2}-\d{2}/,
    // MM/DD/YYYY or MM-DD-YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // DD/MM/YYYY or DD-MM-YYYY (European)
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // Month DD, YYYY
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/,
    // DD Month YYYY
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/
  ];
  
  // First try direct Date parsing
  dueDate = new Date(dueDateString);
  if (!isNaN(dueDate.getTime())) {
    const diffTime = dueDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // If that fails, try manual parsing
  const dateStr = dueDateString.trim();
  
  // Try ISO format first
  if (formats[0].test(dateStr)) {
    dueDate = new Date(dateStr);
    if (!isNaN(dueDate.getTime())) {
      const diffTime = dueDate - now;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }
  
  // Try MM/DD/YYYY format
  const mmddyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mmddyyyy) {
    dueDate = new Date(mmddyyyy[3], mmddyyyy[1] - 1, mmddyyyy[2]);
    if (!isNaN(dueDate.getTime())) {
      const diffTime = dueDate - now;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }
  
  return null;
}

// Fire-and-forget research brief generation
function triggerResearchBrief(title, agency, description, vertical) {
  fetch("https://hgi-capture-system.vercel.app/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title,
      agency: agency,
      description: description,
      vertical: vertical
    })
  }).catch(error => {
    console.warn("Research brief generation failed:", error.message);
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Enhanced debug logging
  try {
    const body = req.body || {};
    const debugInfo = [body.source || 'no-source', body.source_id || 'no-id', body.title?.slice(0,80) || 'no-title', body.url?.slice(0,80) || 'no-url', body.agency?.slice(0,50) || 'no-agency'].join(' | ');
    const SUPABASE_URL_LOG = process.env.SUPABASE_URL;
    const SUPABASE_KEY_LOG = process.env.SUPABASE_SERVICE_KEY;
    await fetch(SUPABASE_URL_LOG + '/rest/v1/hunt_runs', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY_LOG, 'Authorization': 'Bearer ' + SUPABASE_KEY_LOG, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ source: 'intake_debug', status: debugInfo.slice(0, 200), run_at: new Date().toISOString(), opportunities_found: 0 })
    });
  } catch(e) {}

  // ── Environment variables ────────────────────────────────────────────────
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const INTAKE_SECRET = process.env.INTAKE_SECRET;

  if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
    return res.status(500).json({ error: "Missing required environment variables" });
  }

  // ── Authentication ───────────────────────────────────────────────────────
  const providedSecret = req.headers["x-intake-secret"] || req.body?.intake_secret;
  if (INTAKE_SECRET && providedSecret !== INTAKE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ── Validate required fields ─────────────────────────────────────────────
  const {
    source,
    source_id,
    title: rawTitle,
    agency,
    url,
    posted_date = "",
    response_deadline = "",
    estimated_value = "",
    naics = "",
    set_aside = "",
    contract_type = "",
    state = "",
    description = "",
    raw_html = "",
  } = req.body || {};

  // Only return 400 for completely empty or unparseable requests
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(200).json({
      status: 'skipped',
      reason: 'validation'
    });
  }

  if (!source || !source_id || !agency || !url) {
    return res.status(200).json({
      status: 'skipped',
      reason: 'validation'
    });
  }

  // Derive title if missing or empty
  const title = (rawTitle && rawTitle.trim()) ? rawTitle : deriveTitleFromUrl(url);

  // ── Generate deterministic ID ────────────────────────────────────────────
  const sourcePrefix = source.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const recordId = `${sourcePrefix}-${safeId(source_id)}`;

  // ── DB helpers ───────────────────────────────────────────────────────────
  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Accept": "application/json",
  };

  const dbGet = async (table, params = "") => {
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
    if (!r.ok) throw new Error(`DB upsert ${table}: ${await r.text()}`);
  };

  const dbPatch = async (table, id, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`DB patch ${table}: ${await r.text()}`);
  };

  // ── Rate limit check: max 200 intakes per 24 hours ───────────────────────
  try {
    const recent = await dbGet("opportunities", `?discovered_at=gte.${new Date(Date.now() - 86400000).toISOString()}&select=id`);
    if (recent.length >= 200) {
      return res.status(429).json({ error: "Daily intake limit reached (200 records)" });
    }
  } catch (e) {
    console.warn("Rate limit check failed:", e.message);
  }

  // ── Deduplication check ──────────────────────────────────────────────────
  try {
    const existing = await dbGet("opportunities", `?id=eq.${encodeURIComponent(recordId)}&select=id,opi_score,hgi_relevance`);
    if (existing.length > 0) {
      return res.status(200).json({
        skipped: true,
        reason: "duplicate",
        id: recordId,
        opi_score: existing[0].opi_score,
        hgi_relevance: existing[0].hgi_relevance,
      });
    }
  } catch (e) {
    console.warn("Dedup check failed:", e.message);
  }

  const now = new Date().toISOString();

  // ── DEADLINE SCORING: Calculate days until deadline ──────────────────────
  const days_until_deadline = calculateDaysUntilDeadline(response_deadline);
  let initialStatus = "pending";
  
  if (days_until_deadline !== null && days_until_deadline <= 0) {
    initialStatus = "filtered";
  }

  // ── Save raw record to Supabase immediately ──────────────────────────────
  try {
    const rawRecord = {
      id: recordId,
      title: title.slice(0, 500),
      agency: agency.slice(0, 300),
      state: state.slice(0, 10) || "Unknown",
      source,
      source_url: url.slice(0, 1000),
      solicitation_number: source_id.slice(0, 100),
      naics: naics.slice(0, 10),
      set_aside: set_aside.slice(0, 100),
      contract_type: contract_type.slice(0, 100),
      due_date: response_deadline.slice(0, 50),
      posted_date: posted_date.slice(0, 50),
      estimated_value: estimated_value.slice(0, 100),
      description: description.slice(0, 2000),
      rfp_text: (stripScripts(raw_html) + " " + description).slice(0, 10000),
      status: initialStatus,
      discovered_at: now,
      last_updated: now,
    };

    // Add days_until_deadline if calculated
    if (days_until_deadline !== null) {
      rawRecord.days_until_deadline = days_until_deadline;
    }

    await dbUpsert("opportunities", rawRecord);
  } catch (e) {
    console.error("Failed to save raw record:", e.message);
    return res.status(500).json({ error: "Database save failed", details: e.message });
  }

  // ── Claude analysis ──────────────────────────────────────────────────────
  const fullText = (description + " " + stripScripts(raw_html)).slice(0, 6000);

  // ── Dynamic knowledge injection ──────────────────────────────────────────
  // Detect vertical from content for knowledge retrieval
  const verticalHint = (() => {
    const t = (title + " " + description).toLowerCase();
    if (t.match(/disaster|cdbg|fema|flood|hurricane|recovery|grant/)) return "disaster";
    if (t.match(/workers.comp|tpa|claims.admin|guaranty|insurance|liability/)) return "tpa";
    if (t.match(/tax.appeal|property.tax|ad.valorem|billing.dispute|utility/)) return "appeals";
    if (t.match(/workforce|unemployment|job.training|wioa|career/)) return "workforce";
    if (t.match(/health|medicaid|public.health|hhs|nursing/)) return "health";
    if (t.match(/construction|infrastructure|transit|capital.program/)) return "construction";
    if (t.match(/federal|pbgc|pension|trust.admin/)) return "federal";
    return "general";
  })();

  let hgiKnowledge = "";
  try {
    const kqResp = await fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://hgi-capture-system.vercel.app"}/api/knowledge-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical: verticalHint, max_chunks: 4 }),
    });
    if (kqResp.ok) {
      const kqData = await kqResp.json();
      hgiKnowledge = kqData.prompt_injection || "";
    }
  } catch (e) {
    console.warn("Knowledge query failed, using core doctrine:", e.message);
  }

  // Fallback to embedded core doctrine if knowledge query fails
  if (!hgiKnowledge) {
    hgiKnowledge = `HGI Global / Hammerman & Gainer LLC — 95 years. Crisis response, fiduciary, program administration, claims management.
Past performance: Road Home $12B, Restore Louisiana, BP GCCF 1M+ claims, TPCIGA 28yrs Texas, LIGA Louisiana, PBGC 34M beneficiaries, City of New Orleans WC TPA ($283K/mo), SWBNO Billing Appeals ($200K/mo), Property Tax Appeals 15yrs New Orleans.
Verticals: Disaster Recovery (CDBG-DR/FEMA PA), TPA/Claims, Appeals/Dispute, Construction Management, Workforce, Health, Federal.
Geography: Louisiana all parishes, Texas, Florida, Mississippi, Alabama, Georgia, Federal.
NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190.
Wins through: relationships, recompetes, crisis-triggered programs, replicable recurring models.`;
  }

  const analysisPrompt = `Analyze this procurement opportunity for HGI. Return JSON only.

OPPORTUNITY DATA:
Title: ${title}
Agency: ${agency}
State: ${state || "Unknown"}
Source: ${source}
URL: ${url}
NAICS: ${naics || "Unknown"}
Set-Aside: ${set_aside || "Unknown"}
Estimated Value: ${estimated_value || "Unknown"}
Response Deadline: ${response_deadline || "Unknown"}
Full Text: ${fullText}

HGI PROFILE:
${hgiKnowledge}

SCORING INSTRUCTIONS:
- OPI score 0-100 based on actual match between opportunity requirements and HGI capabilities
- Score 85-100 only if HGI has direct past performance in this exact work
- Score 70-84 if HGI capabilities directly match but no identical past performance
- Score 50-69 if adjacent capability match
- Score below 50 if weak or speculative match
- Consider small contracts (<$500K) if recurring revenue potential exists
- IMMEDIATE if response deadline within 30 days
- ACTIVE if deadline 31-90 days out or unknown but posted recently
- PIPELINE if deadline 91-180 days or pre-solicitation
- WATCH if beyond 180 days or early market research

Return ONLY this exact JSON with no markdown:
{
  "vertical": "disaster|tpa|workforce|health|infrastructure|tax_appeals|federal",
  "opi_score": 0-100,
  "urgency": "IMMEDIATE|ACTIVE|PIPELINE|WATCH",
  "strategic_importance": "TIER_1|TIER_2|TIER_3",
  "hgi_relevance": "HIGH|MEDIUM|LOW",
  "hgi_fit": "1-2 sentences on specific fit",
  "why_hgi_wins": ["specific reason 1", "specific reason 2", "specific reason 3"],
  "key_requirements": ["requirement 1", "requirement 2", "requirement 3"],
  "scope_of_work": ["deliverable 1", "deliverable 2", "deliverable 3", "deliverable 4"],
  "capture_action": "single most important action HGI should take this week",
  "incumbent": "name if known or empty string",
  "recompete": false,
  "description": "2-3 sentence plain English summary of what this contract requires"
}`;

  let analysis = null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: "You are a government contracting analyst. Return ONLY valid JSON. No markdown. No explanation.",
        messages: [{ role: "user", content: analysisPrompt }],
      }),
    });
    const d = await r.json();
    const raw = d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    analysis = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
  } catch (e) {
    console.error("Claude analysis failed:", e.message);
    await dbPatch("opportunities", recordId, { status: "analysis_failed", last_updated: now });
    return res.status(200).json({
      success: false,
      id: recordId,
      error: "Claude analysis failed",
      details: e.message,
      saved: true,
    });
  }

  // ── Filter low relevance ─────────────────────────────────────────────────
  if (analysis.hgi_relevance === "LOW" && analysis.opi_score < 25) {
    await dbPatch("opportunities", recordId, {
      status: "filtered",
      hgi_relevance: "LOW",
      opi_score: analysis.opi_score,
      vertical: analysis.vertical,
      analyzed_at: now,
      last_updated: now,
    });
    return res.status(200).json({
      success: true,
      id: recordId,
      filtered: true,
      reason: "LOW relevance below threshold",
      opi_score: analysis.opi_score,
    });
  }

  // ── Apply deadline proximity adjustment ──────────────────────────────────
  let finalOpiScore = analysis.opi_score;
  let finalStatus = "active";
  let finalUrgency = analysis.urgency;
  
  if (days_until_deadline !== null) {
    if (days_until_deadline <= 0) {
      finalStatus = "filtered";
    } else if (days_until_deadline >= 1 && days_until_deadline <= 6) {
      finalOpiScore = Math.max(0, finalOpiScore - 35);
      finalUrgency = "IMMEDIATE";
    } else if (days_until_deadline >= 7 && days_until_deadline <= 13) {
      finalOpiScore = Math.max(0, finalOpiScore - 20);
      finalUrgency = "CRITICAL";
    } else if (days_until_deadline >= 14 && days_until_deadline <= 20) {
      finalOpiScore = Math.max(0, finalOpiScore - 10);
      finalUrgency = "URGENT";
    } else if (days_until_deadline >= 21 && days_until_deadline <= 30) {
      finalOpiScore = Math.max(0, finalOpiScore - 5);
      finalUrgency = "APPROACHING";
    }
  }

  // ── Save full analysis to Supabase ───────────────────────────────────────
  try {
    const updateData = {
      vertical: analysis.vertical,
      opi_score: finalOpiScore,
      urgency: finalUrgency,
      strategic_importance: analysis.strategic_importance,
      hgi_relevance: analysis.hgi_relevance,
      hgi_fit: analysis.hgi_fit,
      why_hgi_wins: analysis.why_hgi_wins,
      key_requirements: analysis.key_requirements,
      scope_of_work: analysis.scope_of_work,
      capture_action: analysis.capture_action,
      incumbent: analysis.incumbent || "",
      recompete: analysis.recompete || false,
      description: analysis.description || description.slice(0, 500),
      status: finalStatus,
      analyzed_at: now,
      last_updated: now,
    };
    
    if (days_until_deadline !== null) {
      updateData.days_until_deadline = days_until_deadline;
    }
    
    await dbPatch("opportunities", recordId, updateData);

    // ── AUTO-RESEARCH: Fire and forget research brief for high-scoring opportunities ──
    if (finalOpiScore >= 75) {
      fetch("https://hgi-capture-system.vercel.app/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: 'Research this opportunity and provide a 3-sentence decision brief: ' + title + ' | Agency: ' + agency + ' | Vertical: ' + analysis.vertical
          }]
        })
      }).catch(error => {
        console.warn("Auto-research failed:", error.message);
      });
    }

    if (finalOpiScore >= 60) {
      fetch('https://hgi-capture-system.vercel.app/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Score winnability for HGI on this opportunity. Return Pwin 0-100, top 3 win themes, top 3 risks, and GO/NO-BID recommendation: ' + title + ' | Agency: ' + agency + ' | OPI: ' + finalOpiScore + ' | Vertical: ' + analysis.vertical + ' | Why HGI wins: ' + (analysis.why_hgi_wins || []).join('; ') }]
        })
      }).catch(() => {});
    }

    if (finalOpiScore >= 90) {
      fetch('https://hgi-capture-system.vercel.app/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Draft a complete executive summary proposal section for HGI for this opportunity: ' + title + ' | Agency: ' + agency + ' | Scope: ' + (analysis.scope_of_work || []).join('; ') + ' | Why HGI wins: ' + (analysis.why_hgi_wins || []).join('; ') }]
        })
      }).catch(() => {});
    }
    
  } catch (e) {
    console.error("Failed to save analysis:", e.message);
    return res.status(500).json({ error: "Analysis save failed", details: e.message });
  }

  // ── Log to hunt_runs ─────────────────────────────────────────────────────
  try {
    await dbUpsert("hunt_runs", {
      run_at: now,
      source,
      opportunities_found: 1,
      opportunities_new: 1,
      status: "completed",
    });
  } catch (e) {
    console.warn("hunt_runs log failed:", e.message);
  }

  // Broadcast discovery event to intelligence engine
  fetch('https://hgi-capture-system.vercel.app/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: finalOpiScore >= 75 ? 'opportunity.tier1_discovered' : 'opportunity.discovered',
      opportunity_id: recordId,
      opportunity_title: title,
      agency: agency,
      source_module: 'intake',
      data: { opi_score: finalOpiScore, urgency: finalUrgency, vertical: analysis.vertical }
    })
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    id: recordId,
    title,
    opi_score: finalOpiScore,
    hgi_relevance: analysis.hgi_relevance,
    urgency: finalUrgency,
    vertical: analysis.vertical,
    strategic_importance: analysis.strategic_importance,
  });
}