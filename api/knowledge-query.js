// Bridge test successful
// api/knowledge-query.js — Dynamic Knowledge Retrieval for Prompt Injection
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Accept": "application/json",
    "Prefer": "return=representation",
  };

  const dbGet = async (table, params = "") => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: dbHeaders });
    if (!r.ok) throw new Error(`DB GET ${table}: ${await r.text()}`);
    return r.json();
  };

  const { vertical, max_chunks = 6 } = req.method === "POST"
    ? (req.body || {})
    : (req.query || {});

  if (!vertical) return res.status(400).json({ error: "vertical required" });

  try {
    // Get extracted docs matching vertical
    let docs = await dbGet("knowledge_documents",
      `?vertical=eq.${vertical}&status=eq.extracted&order=uploaded_at.desc&limit=10&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna`
    );

    // Fall back to general docs if not enough vertical-specific
    if (docs.length < 3) {
      const generalDocs = await dbGet("knowledge_documents",
        `?status=eq.extracted&order=uploaded_at.desc&limit=10&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna`
      );
      // Merge, deduplicate by id
      const seen = new Set(docs.map(d => d.id));
      for (const d of generalDocs) {
        if (!seen.has(d.id)) { docs.push(d); seen.add(d.id); }
      }
    }

    if (docs.length === 0) {
      return res.status(200).json({
        found: false,
        prompt_injection: buildCoreDoctrineOnly(),
        doc_count: 0,
        chunk_count: 0,
      });
    }

    // Get chunks for matched docs
    const docIds = docs.slice(0, 5).map(d => d.id);
    const chunkFilter = docIds.map(id => `document_id.eq.${id}`).join(",");

    let chunks = [];
    try {
      chunks = await dbGet("knowledge_chunks",
        `?or=(${chunkFilter})&order=chunk_index.asc&limit=${max_chunks * 2}&select=chunk_text,document_id,chunk_index,filename`
      );
      chunks = chunks.slice(0, max_chunks);
    } catch (e) {
      console.warn("Chunk retrieval failed:", e.message);
    }

    const injection = buildPromptInjection(docs, chunks, vertical);

    return res.status(200).json({
      found: true,
      prompt_injection: injection,
      doc_count: docs.length,
      chunk_count: chunks.length,
      docs_used: docs.map(d => ({ id: d.id, filename: d.filename, class: d.document_class })),
    });

  } catch (e) {
    console.error("Knowledge query error:", e.message);
    return res.status(200).json({
      found: false,
      prompt_injection: buildCoreDoctrineOnly(),
      error: e.message,
    });
  }
}

function buildCoreDoctrineOnly() {
  return `
=== HGI INSTITUTIONAL KNOWLEDGE ===

COMPANY: HGI Global, Inc. / Hammerman & Gainer LLC
Founded: 1929 | 95+ years | Kenner, Louisiana
Leadership: Larry D. Oney (Chairman), Christopher J. Oney (President), Louis J. Resweber (CEO), Candy L. Dottolo (CAO), Vanessa R. James (SVP Claims), S. Adaan Uzzaman (Chief Strategy Officer)
Certifications: Women/Minority-Owned

CORE BUSINESS LINES:
1. Disaster Recovery — CDBG-DR, FEMA PA, HMGP, BRIC, housing recovery
2. TPA / Claims — Workers Comp, Auto, GL, P&C, Insurance Guaranty Associations
3. Appeals & Dispute Administration — Property tax appeals, utility billing disputes
4. Construction Management — School repair, capital programs
5. Workforce Development — Job readiness, talent pipelining
6. Health & Human Services — Public health program admin, case management
7. Federal Programs — Trust administration, claims, pension guaranty

KEY PAST PERFORMANCE:
- Road Home Program: $12B federal funds, post-Katrina/Rita, zero misappropriation
- BP GCCF: 1,000,000+ claims for Presidential appointee Kenneth Feinberg
- TPCIGA: 28 years workers comp TPA, Texas
- PBGC: 5+ years, 50 staff, 34 million beneficiaries
- City of New Orleans Workers Comp: $283K/month active
- SWBNO Billing Appeals: $200K/month
- Orleans Parish School Board: 22 years multi-line TPA
- Terrebonne Parish School Board: Construction management

CURRENT AUTHORIZED RATE CARD (confirmed 2026):
- Principal: $180/hr
- Program Director: $165/hr
- Subject Matter Expert: $155/hr
- Senior Grant Manager: $150/hr
- Grant Manager: $120/hr
- Senior Project Manager: $150/hr
- Project Manager: $140/hr
- Grant Writer: $105/hr
- Architect Engineer: $135/hr
- Cost Estimator: $125/hr
- Appeals Specialist: $145/hr
- Senior Damage Assessor: $115/hr
- Damage Assessor: $95/hr
- Administrative Support Specialist: $65/hr

GEOGRAPHY: Louisiana, Texas, Florida, Mississippi, Alabama, Georgia, Federal
NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190
`;
}

function buildPromptInjection(docs, chunks, vertical) {
  let injection = buildCoreDoctrineOnly();

  const ppEntries = [];
  const winThemes = [];
  const staffingPatterns = [];
  const references = [];

  for (const doc of docs) {
    if (doc.doctrine?.past_performance?.length) {
      ppEntries.push(...doc.doctrine.past_performance);
    }
    if (doc.doctrine?.win_themes?.length) {
      winThemes.push(...doc.doctrine.win_themes);
    }
    if (doc.winning_dna?.staffing_patterns?.length) {
      staffingPatterns.push(...doc.winning_dna.staffing_patterns);
    }
    if (doc.winning_dna?.references?.length) {
      references.push(...doc.winning_dna.references);
    }
  }

  if (ppEntries.length > 0) {
    injection += `\n\n=== RELEVANT PAST PERFORMANCE (${vertical.toUpperCase()}) ===\n`;
    ppEntries.slice(0, 8).forEach(pp => {
      injection += `\n• ${pp.program || pp.client}: ${pp.scope}`;
      if (pp.scale) injection += ` | Scale: ${pp.scale}`;
      if (pp.outcome) injection += ` | Outcome: ${pp.outcome}`;
      if (pp.geography) injection += ` | ${pp.geography}`;
    });
  }

  if (winThemes.length > 0) {
    injection += `\n\n=== WIN THEMES FOR THIS VERTICAL ===\n`;
    [...new Set(winThemes)].slice(0, 6).forEach(t => {
      injection += `\n• ${t}`;
    });
  }

  if (staffingPatterns.length > 0) {
    injection += `\n\n=== STAFFING PATTERNS ===\n`;
    staffingPatterns.slice(0, 5).forEach(sp => {
      injection += `\n• ${sp.role}: ${sp.qualifications || ""} | ${sp.responsibilities || ""}`;
    });
  }

  if (references.length > 0) {
    injection += `\n\n=== REFERENCE CONTACTS (verify current before use) ===\n`;
    references.slice(0, 6).forEach(r => {
      injection += `\n• ${r.name}, ${r.title} — ${r.organization}`;
      if (r.email) injection += ` | ${r.email}`;
      if (r.phone) injection += ` | ${r.phone}`;
    });
  }

  injection += `\n\nNOTE: Staff names extracted from historical proposals are for reference only. Confirm current availability before including in any proposal. Current rate card above supersedes any rates found in historical documents.`;

  if (chunks.length > 0) {
    injection += `\n\n=== RELEVANT DOCUMENT EXCERPTS ===\n`;
    chunks.forEach(chunk => {
      injection += `\n[From: ${chunk.filename}]\n${chunk.chunk_text}\n`;
    });
  }

  return injection;
}