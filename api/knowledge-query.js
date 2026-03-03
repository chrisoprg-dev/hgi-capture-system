// api/knowledge-query.js — Dynamic Knowledge Retrieval for Prompt Injection
// Called by intake.js and proposal engine before Claude analysis
// Returns matched chunks + doctrine + winning DNA for a given vertical
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

  const { vertical, doc_classes, max_chunks = 6, max_tokens = 3000 } = req.method === "POST"
    ? (req.body || {})
    : (req.query || {});

  if (!vertical) return res.status(400).json({ error: "vertical required" });

  const classes = doc_classes || ["winning_proposal", "capabilities_statement", "corporate_profile", "past_performance", "unsolicited_proposal"];
  const classFilter = classes.map(c => `document_class.eq.${c}`).join(",");

  try {
    // Get documents matching vertical (exact match first, then general)
    let docs = await dbGet("knowledge_documents",
      `?vertical=eq.${vertical}&status=eq.processed&order=uploaded_at.desc&limit=10&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna`
    );

    // Also get general docs if not enough vertical-specific
    if (docs.length < 3) {
      const generalDocs = await dbGet("knowledge_documents",
        `?vertical=eq.general&status=eq.processed&order=uploaded_at.desc&limit=5&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna`
      );
      docs = [...docs, ...generalDocs];
    }

    if (docs.length === 0) {
      // No knowledge base docs yet — return core HGI doctrine only
      return res.status(200).json({
        found: false,
        prompt_injection: buildCoreDoctrineOnly(),
        doc_count: 0,
        chunk_count: 0,
      });
    }

    // Get chunks for matched docs
    const docIds = docs.slice(0, 5).map(d => d.id);
    const chunkFilter = docIds.map(id => `document_id.eq.${encodeURIComponent(id)}`).join(",");

    let chunks = [];
    try {
      chunks = await dbGet("knowledge_chunks",
        `?or=(${chunkFilter})&order=chunk_index.asc&limit=${max_chunks * 2}&select=chunk_text,document_id,chunk_index,filename`
      );
      // Interleave chunks from different docs for diversity
      chunks = chunks.slice(0, max_chunks);
    } catch (e) {
      console.warn("Chunk retrieval failed:", e.message);
    }

    // Assemble prompt injection
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
    // Fail gracefully — return core doctrine so analysis still works
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
Website: hgi-global.com

CORE BUSINESS LINES:
1. Disaster Recovery / Program Management — CDBG-DR, FEMA PA, HMGP, BRIC, housing recovery
2. TPA / Claims Management — Workers Comp, Auto, GL, P&C, Insurance Guaranty Associations
3. Appeals & Dispute Administration — Property tax appeals, utility billing disputes
4. Construction Management — School repair, capital programs, earned value management
5. Workforce Development — Job readiness, talent pipelining, program management
6. Health & Human Services — Public health program admin, case management
7. Federal Programs — Trust administration, claims, pension guaranty

KEY PAST PERFORMANCE:
- Road Home Program: $12B federal funds administered, zero misappropriation, post-Katrina/Rita
- Restore Louisiana: Post-flood housing recovery, statewide application processing and grant disbursement
- BP GCCF (Deepwater Horizon): 1,000,000+ claims administered for Presidential appointee Kenneth Feinberg
- TPCIGA (Texas): 28 years workers comp / auto / property TPA for insurance guaranty association
- LIGA (Louisiana): Insurance guaranty association claims administration
- PBGC (Federal): 5+ years, 50 staff, trust and claims for 34 million beneficiaries
- City of New Orleans Workers Comp: $283K/month, active since 2023
- City of Alexandria: 24 years workers comp / auto / GL TPA
- City of Shreveport: 24 years workers comp / auto / GL TPA
- RTA New Orleans: 20 years workers comp TPA
- Orleans Parish School Board: 22 years multi-line TPA
- SWBNO Billing Appeals: $200K/month, utility billing dispute administration
- City of New Orleans Property Tax: 15 years ad valorem tax appeal administration
- Terrebonne Parish School Board: Construction management, school repair/reconstruction
- Louisiana COVID Unemployment: 15,250+ claims processed and adjudicated
- Louisiana Contact Tracing: Statewide public health program implementation
- AIG Mediation: 20,000+ cases, property damage and personal injury

GEOGRAPHY: Louisiana (all parishes and municipal), Texas, Florida, Mississippi, Alabama, Georgia, Federal
NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190
CONTRACT SIZE: All sizes pursued; under $500K if recurring or strategically valuable

COMPETITIVE ADVANTAGES:
- 95 years continuous operation — oldest firm of its kind in the US
- $12B fiduciary track record with zero misappropriation
- Scale range from $6,700/month to $12 billion programs
- Proven crisis deployment speed — stood up major programs within days
- Long-term client retention — average 15+ year client relationships
- Minority-owned certifications — competitive on set-aside contracts
- Both public and private sector capability

OPI SCORING CALIBRATION:
90-100: Identical past performance exists (municipal workers comp TPA, guaranty association TPA, CDBG-DR housing recovery, mass claims)
75-89: Direct capability match, adjacent client type (county TPA, new city billing disputes, new property tax program)
60-74: Strong adjacent match, new past performance territory (health claims admin, federal disaster grants, workforce programs)
45-59: Capability exists, limited direct past performance (new state TPA, non-Gulf disaster recovery)
Below 45: Speculative — adjacent capability only, no direct past performance

HOW HGI WINS WORK:
- Relationship-driven — long-term client trust, not cold RFP responses
- Crisis-triggered — major disaster declarations, insurance insolvencies, public health emergencies
- Recompete-heavy — most revenue is incumbent defense and expansion
- Replicable models — proven programs (property tax appeals, billing disputes) expanded to new municipalities
- Fiduciary credibility — $12B track record is the primary differentiator in competitive evaluations
`;
}

function buildPromptInjection(docs, chunks, vertical) {
  let injection = buildCoreDoctrineOnly();

  // Add vertical-specific past performance from doctrine
  const ppEntries = [];
  const winThemes = [];
  const staffingPatterns = [];

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
  }

  if (ppEntries.length > 0) {
    injection += `\n\n=== RELEVANT PAST PERFORMANCE (${vertical.toUpperCase()}) ===\n`;
    ppEntries.slice(0, 5).forEach(pp => {
      injection += `\n• ${pp.program || pp.client}: ${pp.scope} | Scale: ${pp.scale || "N/A"} | Outcome: ${pp.outcome || "N/A"}`;
    });
  }

  if (winThemes.length > 0) {
    injection += `\n\n=== WIN THEMES FOR THIS VERTICAL ===\n`;
    [...new Set(winThemes)].slice(0, 5).forEach(t => {
      injection += `\n• ${t}`;
    });
  }

  if (staffingPatterns.length > 0) {
    injection += `\n\n=== STAFFING PATTERNS ===\n`;
    staffingPatterns.slice(0, 4).forEach(sp => {
      injection += `\n• ${sp.role}: ${sp.qualifications || ""} | ${sp.responsibilities || ""}`;
    });
  }

  // Add relevant text chunks
  if (chunks.length > 0) {
    injection += `\n\n=== RELEVANT DOCUMENT EXCERPTS ===\n`;
    chunks.forEach(chunk => {
      injection += `\n[From: ${chunk.filename}]\n${chunk.chunk_text}\n`;
    });
  }

  return injection;
}