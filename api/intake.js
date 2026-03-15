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

function generateTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(seg => seg.length > 0);
    const lastSegment = pathSegments[pathSegments.length - 1] || 'Opportunity';
    // Remove file extensions and convert hyphens/underscores to spaces
    const cleanSegment = lastSegment
      .replace(/\.[a-zA-Z]{2,4}$/, '') // remove file extensions
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Capitalize first letter of each word
    return cleanSegment.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'Government Opportunity';
  } catch (e) {
    return 'Government Opportunity';
  }
}

function calculateDaysUntilDeadline(deadlineStr) {
  if (!deadlineStr || deadlineStr.trim() === "" || deadlineStr === "Unknown") {
    return null;
  }
  
  try {
    const deadline = new Date(deadlineStr);
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (e) {
    return null;
  }
}

function applyDeadlineScoring(baseScore, urgency, captureAction, daysUntilDeadline) {
  if (daysUntilDeadline === null || daysUntilDeadline > 30) {
    return { adjustedScore: baseScore, urgency, captureAction, daysUntilDeadline };
  }
  
  let adjustedScore = baseScore;
  let newUrgency = urgency;
  let newCaptureAction = captureAction;
  
  if (daysUntilDeadline < 0) {
    // Deadline has passed
    return { 
      adjustedScore: 0, 
      urgency: "EXPIRED", 
      captureAction, 
      daysUntilDeadline,
      status: "filtered" 
    };
  } else if (daysUntilDeadline >= 1 && daysUntilDeadline <= 6) {
    adjustedScore = baseScore - 35;
    newUrgency = "IMMEDIATE";
    newCaptureAction = "CRITICAL: Less than 7 days — GO/NO-BID decision required today";
  } else if (daysUntilDeadline >= 7 && daysUntilDeadline <= 13) {
    adjustedScore = baseScore - 20;
    newUrgency = "CRITICAL";
    newCaptureAction = "WARNING: Less than 14 days to deadline — assess proposal readiness immediately";
  } else if (daysUntilDeadline >= 14 && daysUntilDeadline <= 20) {
    adjustedScore = baseScore - 10;
    newUrgency = "URGENT";
  } else if (daysUntilDeadline >= 21 && daysUntilDeadline <= 30) {
    adjustedScore = baseScore - 5;
    newUrgency = "APPROACHING";
  }
  
  // Ensure score doesn't go below 0
  adjustedScore = Math.max(0, adjustedScore);
  
  return { 
    adjustedScore, 
    urgency: newUrgency, 
    captureAction: newCaptureAction, 
    daysUntilDeadline 
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

  // ── Validation with detailed error logging ───────────────────────────────
  let {
    source,
    source_id,
    title,
    agency,
    url,
    source_url,
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

  // Log received fields for debugging
  const receivedFields = {
    source: source || null,
    source_id: source_id || null,
    title: title || null,
    agency: agency || null,
    url: url || null,
    source_url: source_url || null,
    posted_date: posted_date || null,
    response_deadline: response_deadline || null,
    estimated_value: estimated_value || null,
    naics: naics || null,
    set_aside: set_aside || null,
    contract_type: contract_type || null,
    state: state || null,
    description: description || null,
    raw_html: raw_html ? `${raw_html.length} characters` : null,
  };

  // Accept any request with title OR source_url/url
  const hasMinimumData = title || url || source_url;
  if (!hasMinimumData) {
    const validationError = {
      error: "Validation failed",
      reason: "Missing minimum required data - need at least title, url, or source_url",
      received_fields: receivedFields,
      validation_details: {
        title_provided: !!title,
        url_provided: !!url,
        source_url_provided: !!source_url,
        minimum_requirement: "At least one of: title, url, or source_url"
      }
    };
    
    console.error("Intake validation failed:", JSON.stringify(validationError, null, 2));
    
    // Even if no minimum data, still process with defaults
    title = "Government Opportunity";
    url = source_url || "https://example.gov/opportunity";
    
    console.log("Applied fallback values - continuing with processing");
  }

  // Use source_url as fallback for url
  if (!url && source_url) {
    url = source_url;
  }

  // Generate defaults for missing required fields
  if (!title || title.trim() === "" || title === "$99.99" || title.toLowerCase().includes("$99.99")) {
    if (url || source_url) {
      title = generateTitleFromUrl(url || source_url);
    } else {
      title = "Government Opportunity";
    }
  }

  if (!agency || agency.trim() === "") {
    agency = "Louisiana Government";
  }

  if (!state || state.trim() === "") {
    state = "LA";
  }

  if (!source || source.trim() === "") {
    source = "Central Bidding";
  }

  if (!source_id || source_id.trim() === "") {
    // Generate source_id from URL or timestamp
    if (url) {
      try {
        const urlObj = new URL(url);
        source_id = urlObj.pathname.split('/').pop() || Date.now().toString();
      } catch (e) {
        source_id = Date.now().toString();
      }
    } else {
      source_id = Date.now().toString();
    }
  }

  // Log final processed values
  console.log("Processed intake data:", {
    id: `${source.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}-${safeId(source_id)}`,
    title,
    agency,
    state,
    source,
    url,
    source_id,
    has_description: !!description,
    has_raw_html: !!raw_html
  });

  // ── Generate deterministic ID ────────────────────────────────────────────
  const sourcePrefix = source.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const recordId = `${sourcePrefix}-${safeId(source_id)}`;

  // ── Calculate days until deadline ────────────────────────────────────────
  const daysUntilDeadline = calculateDaysUntilDeadline(response_deadline);

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

  // ── Save raw record to Supabase immediately ──────────────────────────────
  try {
    await dbUpsert("opportunities", {
      id: recordId,
      title: title.slice(0, 500),
      agency: agency.slice(0, 300),
      state: state.slice(0, 10),
      source,
      source_url: (url || "").slice(0, 1000),
      solicitation_number: source_id.slice(0, 100),
      naics: naics.slice(0, 10),
      set_aside: set_aside.slice(0, 100),
      contract_type: contract_type.slice(0, 100),
      due_date: response_deadline.slice(0, 50),
      posted_date: posted_date.slice(0, 50),
      estimated_value: estimated_value.slice(0, 100),
      description: description.slice(0, 2000),
      rfp_text: (stripScripts(raw_html) + " " + description).slice(0, 10000),
      days_until_deadline: daysUntilDeadline,
      status: "pending",
      discovered_at: now,
      last_updated: now,
    });
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
    return "disaster"; // Default vertical for Louisiana Government
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
State: ${state}
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

  // ── Apply deadline proximity scoring ─────────────────────────────────────
  const deadlineScoring = applyDeadlineScoring(
    analysis.opi_score, 
    analysis.urgency, 
    analysis.capture_action, 
    daysUntilDeadline
  );

  // Update analysis with deadline-adjusted values
  analysis.opi_score = deadlineScoring.adjustedScore;
  analysis.urgency = deadlineScoring.urgency;
  analysis.capture_action = deadlineScoring.captureAction;

  // ── Filter expired opportunities or low relevance ────────────────────────
  if (deadlineScoring.status === "filtered") {
    await dbPatch("opportunities", recordId, {
      status: "filtered",
      hgi_relevance: analysis.hgi_relevance,
      opi_score: 0,
      urgency: "EXPIRED",
      vertical: analysis.vertical,
      days_until_deadline: daysUntilDeadline,
      analyzed_at: now,
      last_updated: now,
    });
    return res.status(200).json({
      success: true,
      id: recordId,
      filtered: true,
      reason: "Deadline has passed",
      opi_score: 0,
    });
  }

  if (analysis.hgi_relevance === "LOW" && analysis.opi_score < 25) {
    await dbPatch("opportunities", recordId, {
      status: "filtered",
      hgi_relevance: "LOW",
      opi_score: analysis.opi_score,
      urgency: analysis.urgency,
      vertical: analysis.vertical,
      days_until_deadline: daysUntilDeadline,
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

  // ── Save full analysis to Supabase ───────────────────────────────────────
  try {
    await dbPatch("opportunities", recordId, {
      vertical: analysis.vertical,
      opi_score: analysis.opi_score,
      urgency: analysis.urgency,
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
      days_until_deadline: daysUntilDeadline,
      status: "active",
      analyzed_at: now,
      last_updated: now,
    });
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

  return res.status(200).json({
    success: true,
    id: recordId,
    title,
    opi_score: analysis.opi_score,
    hgi_relevance: analysis.hgi_relevance,
    urgency: analysis.urgency,
    vertical: analysis.vertical,
    strategic_importance: analysis.strategic_importance,
    days_until_deadline: daysUntilDeadline,
  });
}