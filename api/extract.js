// api/extract.js — HGI Knowledge Base Extraction Pipeline
// Reads raw chunks from knowledge_chunks, extracts structured institutional data,
// writes doctrine + winning_dna back to knowledge_documents
// Run once (or re-run anytime) to populate the data layer from uploaded proposals

export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const dbHeaders = () => ({
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Accept": "application/json",
  "Prefer": "return=representation",
});

const dbGet = async (table, params = "") => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: dbHeaders() });
  if (!r.ok) throw new Error(`DB GET ${table}: ${await r.text()}`);
  return r.json();
};

const dbPatch = async (table, id, body) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: dbHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`DB PATCH ${table} id=${id}: ${await r.text()}`);
  return r.json();
};

const claudeExtract = async (docText, filename, documentClass) => {
  const prompt = `You are extracting structured institutional knowledge from an HGI (Hammerman & Gainer LLC) proposal or corporate document.

Document: "${filename}"
Document Type: "${documentClass}"

Extract ALL of the following from the document text. Return ONLY valid JSON, no markdown, no explanation.

{
  "client": "client/agency name",
  "contract_name": "contract or program name",
  "vertical": "one of: disaster_recovery | tpa_claims | property_tax | workforce | health | construction | federal | general",
  "summary": "2-3 sentence plain English summary of what this contract/document covers",
  "doctrine": {
    "past_performance": [
      {
        "program": "program name",
        "client": "client name",
        "scope": "what HGI did",
        "scale": "contract value or volume (claims, applications, etc)",
        "period": "dates if mentioned",
        "outcome": "measurable result if mentioned",
        "geography": "state or region"
      }
    ],
    "win_themes": ["theme 1", "theme 2"],
    "methodology": ["key methodology point 1", "key methodology point 2"],
    "differentiators": ["differentiator 1", "differentiator 2"]
  },
  "winning_dna": {
    "staff": [
      {
        "name": "full name",
        "title": "role title",
        "credentials": "certifications, degrees",
        "experience": "relevant experience summary",
        "years": "years of experience if stated",
        "historical": true,
        "availability_note": "Historical reference only — confirm current availability before including in proposal"
      }
    ],
    "rates": [
      {
        "role": "labor category name",
        "rate": "hourly or monthly rate",
        "rate_type": "hourly | monthly | annual",
        "historical": true,
        "rate_note": "Historical reference only — confirm current rates before use"
      }
    ],
    "references": [
      {
        "name": "reference contact name",
        "title": "their title",
        "organization": "their organization",
        "email": "email if present",
        "phone": "phone if present"
      }
    ],
    "staffing_patterns": [
      {
        "role": "role name",
        "qualifications": "required qualifications",
        "responsibilities": "key responsibilities"
      }
    ]
  },
  "current_rates": [
    { "role": "Principal", "rate": "$180", "rate_type": "hourly" },
    { "role": "Program Director", "rate": "$165", "rate_type": "hourly" },
    { "role": "Senior Project Manager", "rate": "$155", "rate_type": "hourly" },
    { "role": "Project Manager", "rate": "$145", "rate_type": "hourly" },
    { "role": "Senior Grant Manager", "rate": "$140", "rate_type": "hourly" },
    { "role": "Grant Manager", "rate": "$125", "rate_type": "hourly" },
    { "role": "Financial Analyst", "rate": "$115", "rate_type": "hourly" },
    { "role": "Environmental Specialist", "rate": "$110", "rate_type": "hourly" },
    { "role": "Administrative Support", "rate": "$65", "rate_type": "hourly" }
  ]
}

If a field has no data in the document, use null or empty array [].
Extract every staff member, every rate, every reference contact, every past performance you can find.
Flag all extracted staff and rates as historical since they may not reflect current availability or pricing.

DOCUMENT TEXT:
${docText.slice(0, 12000)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  const text = data.content[0].text.trim();
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(clean);
};

const checkAndReprocessDocuments = async () => {
  const targetDocs = [
    "doc-1772824650781-HGI-Response-to-SJBSB----RFP-Disaster-Management-Service-1-17-25--1--docx",
    "doc-1772824767279-BP-Capabilities-Statement-Draft---S--Moore-06_02_10-docx"
  ];
  
  for (const docId of targetDocs) {
    try {
      const docs = await dbGet("knowledge_documents", `?id=eq.${docId}&select=id,chunk_count`);
      if (docs.length > 0 && docs[0].chunk_count === 0) {
        console.log(`Triggering reprocess for ${docId}`);
        const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_id: docId, reprocess: true })
        });
      }
    } catch (e) {
      console.error(`Failed to check/reprocess ${docId}:`, e.message);
    }
  }
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  await checkAndReprocessDocuments();

  const { doc_id, reprocess = false } = req.method === "POST"
    ? (req.body || {})
    : (req.query || {});

  const summary = { total: 0, processed: 0, skipped: 0, errors: [] };

  try {
    let docs;
    if (doc_id) {
      docs = await dbGet("knowledge_documents", `?id=eq.${doc_id}&select=id,filename,document_class,vertical,status,chunk_count`);
    } else if (reprocess) {
      docs = await dbGet("knowledge_documents", `?select=id,filename,document_class,vertical,status,chunk_count&order=uploaded_at.asc`);
    } else {
      docs = await dbGet("knowledge_documents", `?doctrine=is.null&select=id,filename,document_class,vertical,status,chunk_count&order=uploaded_at.asc`);
    }

    summary.total = docs.length;

    if (docs.length === 0) {
      return res.status(200).json({
        message: "All documents already extracted. Pass reprocess=true to re-extract all.",
        summary,
      });
    }

    for (const doc of docs) {
      try {
        const chunks = await dbGet("knowledge_chunks",
          `?document_id=eq.${doc.id}&order=chunk_index.asc&select=chunk_text`
        );

        if (chunks.length === 0) {
          summary.skipped++;
          summary.errors.push(`${doc.filename}: no chunks found`);
          continue;
        }

        const fullText = chunks.map(c => c.chunk_text).join("\n\n");
        const extracted = await claudeExtract(fullText, doc.filename, doc.document_class);

        await dbPatch("knowledge_documents", doc.id, {
          client: extracted.client || null,
          contract_name: extracted.contract_name || null,
          vertical: extracted.vertical || doc.vertical || "general",
          summary: extracted.summary || null,
          doctrine: extracted.doctrine || null,
          winning_dna: extracted.winning_dna || null,
          status: "extracted",
          processed_at: new Date().toISOString(),
        });

        summary.processed++;
        console.log(`Extracted: ${doc.filename}`);
        await new Promise(r => setTimeout(r, 500));

      } catch (e) {
        summary.errors.push(`${doc.filename}: ${e.message}`);
        console.error(`Extraction failed for ${doc.filename}:`, e.message);
        try {
          await dbPatch("knowledge_documents", doc.id, { status: "extraction_error" });
        } catch (_) {}
      }
    }

    return res.status(200).json({
      success: true,
      message: `Extracted ${summary.processed} of ${summary.total} documents`,
      summary,
    });

  } catch (e) {
    console.error("Extract pipeline error:", e);
    return res.status(500).json({ error: e.message, summary });
  }
}