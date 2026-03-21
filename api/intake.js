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
    rfp_text: incomingRfpText = "",
  } = req.body || {};

  // Only return 400 for completely empty or unparseable requests
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(200).json({
      status: 'skipped',
      reason: 'validation'
    });
  }

  if (!source || !source_id || !url) {
    return res.status(200).json({
      status: 'skipped',
      reason: 'validation'
    });
  }

  // Derive title if missing or empty
  const title = (rawTitle && rawTitle.trim()) ? rawTitle : deriveTitleFromUrl(url);
  // Default agency if not provided
  const finalAgency = (agency && agency.trim()) ? agency : 'Louisiana Agency (via Central Bidding)';

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
    const existing = await dbGet("opportunities", `?id=eq.${encodeURIComponent(recordId)}&select=id,opi_score,hgi_relevance,rfp_text,status`);
    if (existing.length > 0) {
      const rec = existing[0];
      const hasRealContent = rec.rfp_text && rec.rfp_text.trim().length > 200;
      const isPendingRfp = rec.status === 'pending_rfp';
      const isUnscored = rec.opi_score === null || rec.opi_score === undefined;
      const isFailedAnalysis = rec.status === 'analysis_failed';
      // Re-process if: pending_rfp, never scored, or analysis failed
      if (hasRealContent && !isPendingRfp && !isUnscored && !isFailedAnalysis) {
        return res.status(200).json({
          skipped: true,
          reason: "duplicate",
          id: recordId,
          opi_score: rec.opi_score,
          hgi_relevance: rec.hgi_relevance,
        });
      }
      // Otherwise fall through — re-fetch and re-analyze this record
      console.log(`Re-fetching record ${recordId} — status: ${rec.status}, content length: ${(rec.rfp_text||'').trim().length}`);
    }
  } catch (e) {
    console.warn("Dedup check failed:", e.message);
  }

  // ── FUZZY DEDUP: Check for same agency + similar title ────────────────────
  try {
    const normalizeTitle = (t) => (t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const normalizeAgency = (a) => (a || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const incomingTitle = normalizeTitle(title);
    const incomingAgency = normalizeAgency(agency);
    
    if (incomingAgency && incomingAgency.length > 3) {
      const agencyWords = incomingAgency.split(' ').filter(w => w.length > 2).slice(0, 3).join('%');
      const agencySearch = await dbGet('opportunities', '?agency=ilike.*' + encodeURIComponent(agencyWords) + '*&status=eq.active&select=id,title,agency,opi_score');
      
      for (const existing of agencySearch) {
        const existingTitle = normalizeTitle(existing.title);
        // Check if titles share significant words
        const incomingWords = new Set(incomingTitle.split(' ').filter(w => w.length > 3));
        const existingWords = new Set(existingTitle.split(' ').filter(w => w.length > 3));
        let matches = 0;
        for (const w of incomingWords) {
          if (existingWords.has(w)) matches++;
        }
        const matchRatio = incomingWords.size > 0 ? matches / incomingWords.size : 0;
        
        if (matchRatio >= 0.5) {
          console.log('Fuzzy dedup matched: "' + title + '" ~ "' + existing.title + '" (ratio: ' + matchRatio + ')');
          return res.status(200).json({
            skipped: true,
            reason: 'fuzzy_duplicate',
            matched_id: existing.id,
            matched_title: existing.title,
            match_ratio: matchRatio,
            id: recordId,
            opi_score: existing.opi_score
          });
        }
      }
    }
  } catch(e) {
    console.warn('Fuzzy dedup check failed:', e.message);
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
      rfp_text: (incomingRfpText || (stripScripts(raw_html) + " " + description)).slice(0, 10000),
      status: initialStatus,
      discovered_at: now,
      last_updated: now,
      rfp_document_url: url || '',
      oral_presentation_date: (() => { const m = (incomingRfpText + ' ' + description).match(/oral.{0,20}presentation.{0,60}?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i); return m ? m[1] : null; })(),
      award_notification_date: (() => { const m = (incomingRfpText + ' ' + description).match(/(?:award|notification|contract award|selection).{0,60}?(\w+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i); return m ? m[1] : null; })(),
    };



    await dbUpsert("opportunities", rawRecord);
  } catch (e) {
    console.error("Failed to save raw record:", e.message);
    return res.status(500).json({ error: "Database save failed", details: e.message });
  }

  // ── Claude analysis ──────────────────────────────────────────────────────
  const fullText = (incomingRfpText || (description + " " + stripScripts(raw_html))).slice(0, 6000);

  // ── CONTENT GATE: No inference without real content ──────────────────────
  // If there's no meaningful content to analyze, save as pending_rfp and stop.
  // The scraper will re-fetch this record when more content is available.
  if (fullText.trim().length < 100) {
    try {
      await dbPatch("opportunities", recordId, {
        status: "pending_rfp",
        description: "RFP content not yet available — listing may be embargoed or require authentication. Will re-fetch automatically.",
        urgency: "WATCH",
        last_updated: now,
      });
    } catch(e) {
      console.warn("Failed to save pending_rfp status:", e.message);
    }
    return res.status(200).json({
      success: true,
      id: recordId,
      status: "pending_rfp",
      reason: "Insufficient content to analyze — saved for re-fetch when RFP becomes available",
    });
  }

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

  // ORGANISM MEMORY: Inject accumulated intelligence into initial scoring
  var memoryInjection = '';
  try {
    var memR = await fetch('https://hgi-capture-system.vercel.app/api/memory-retrieve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency: agency || '', vertical: verticalHint, step: 'intake_scoring', context: (title || '') + ' | ' + (agency || '') + ' | ' + (description || '').slice(0, 300) })
    });
    if (memR.ok) { var memData = await memR.json(); memoryInjection = memData.injection || ''; }
  } catch(e) {}

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
${memoryInjection ? '\nORGANISM INTELLIGENCE:\n' + memoryInjection.slice(0, 3000) + '\n' : ''}
SCORING INSTRUCTIONS:
- OPI score 0-100 based on actual match between opportunity requirements and HGI capabilities
- Score 85-100 only if HGI has direct past performance in this exact work
- Score 70-84 if HGI capabilities directly match but no identical past performance
- Score 50-69 if adjacent capability match
- Score below 50 if weak or speculative match
- CRITICAL: Distinguish between sub-types within each vertical. For TPA/insurance — workers comp TPA and property casualty TPA are HGI core (score high). Insurance brokerage, health insurance TPA, and student accident insurance are NOT HGI work (score below 30). For disaster — FEMA PA administration and CDBG-DR program management are core (score high). Physical construction and debris removal are NOT HGI work (score below 20). For infrastructure — program and construction management are HGI-adjacent. Actual construction is NOT HGI (score below 15).
- When the title or description is ambiguous about the specific type of work, assign MEDIUM relevance and note the ambiguity in hgi_fit
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
        max_tokens: 2500,
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
  if (analysis.hgi_relevance === "LOW" && analysis.opi_score < 40) {
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
    

    
    await dbPatch("opportunities", recordId, updateData);

    // ── ORCHESTRATION: Full intelligence workflow for any opportunity that passes initial screen ──
    // The initial OPI is a preliminary screen only. The orchestrator runs scope analysis,
    // financial analysis, research, and re-scoring to produce the REAL OPI score.
    // Threshold: anything above 40 gets the full treatment. Below 40 was already filtered.
    if (finalOpiScore >= 40 && finalStatus === 'active') {
      fetch('https://hgi-capture-system.vercel.app/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: recordId, trigger: 'intake_auto' })
      }).catch(e => console.warn('Orchestrator trigger failed:', e.message));
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