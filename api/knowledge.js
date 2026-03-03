// api/knowledge.js — HGI Knowledge Base Engine
// Upload → Extract → Chunk → Classify → Persist
// Constraints: chunked storage, structured JSON doctrine, no single full_text field
export const config = { maxDuration: 120 };

const CHUNK_SIZE = 1500; // chars per chunk — fits cleanly into Claude context
const CHUNK_OVERLAP = 150; // overlap between chunks for continuity

const VERTICALS = ["disaster", "tpa", "appeals", "workforce", "health", "infrastructure", "federal", "construction", "general"];

const DOC_CLASSES = [
  "winning_proposal", "rfp", "amendment", "contract", "scoring_sheet",
  "capabilities_statement", "corporate_profile", "resume", "rate_sheet",
  "client_correspondence", "unsolicited_proposal", "past_performance", "other"
];

function safeId(s) {
  return (s || "").toString().replace(/[^a-zA-Z0-9\-_]/g, "-").slice(0, 80);
}

// Split text into overlapping chunks
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push({
      index: chunks.length,
      text: text.slice(i, end),
      char_start: i,
      char_end: end,
    });
    if (end === text.length) break;
    i += chunkSize - overlap;
  }
  return chunks;
}

// Extract text from base64 content based on file type
function extractTextFromContent(content, fileType) {
  // For text-based files, decode directly
  if (fileType === "txt" || fileType === "md") {
    try {
      return Buffer.from(content, "base64").toString("utf-8");
    } catch (e) {
      return content;
    }
  }
  // For HTML
  if (fileType === "html") {
    try {
      const html = Buffer.from(content, "base64").toString("utf-8");
      return html.replace(/<[^>]+>/g, " ").replace(/\s{3,}/g, " ").trim();
    } catch (e) {
      return "";
    }
  }
  // PDF and DOCX require Claude to extract — return raw for Claude processing
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const INTAKE_SECRET = process.env.INTAKE_SECRET;

  if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  // Auth
  const secret = req.headers["x-intake-secret"] || req.body?.intake_secret;
  if (INTAKE_SECRET && secret !== INTAKE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Accept": "application/json",
    "Prefer": "return=minimal",
  };

  const dbGet = async (table, params = "") => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      headers: { ...dbHeaders, "Prefer": "return=representation" }
    });
    if (!r.ok) throw new Error(`DB GET ${table}: ${await r.text()}`);
    return r.json();
  };

  const dbInsert = async (table, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...dbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`DB INSERT ${table}: ${await r.text()}`);
  };

  const dbDelete = async (table, params) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      method: "DELETE",
      headers: dbHeaders,
    });
    if (!r.ok) throw new Error(`DB DELETE ${table}: ${await r.text()}`);
  };

  const askClaude = async (prompt, system, maxTokens = 2000) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = await r.json();
    return d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
  };

  // ── GET — list documents ─────────────────────────────────────────────────
  if (req.method === "GET") {
    const { vertical, doc_class, limit = "50" } = req.query || {};
    let params = `?order=uploaded_at.desc&limit=${limit}&select=id,filename,file_type,document_class,vertical,client,contract_name,summary,chunk_count,uploaded_at,status`;
    if (vertical) params += `&vertical=eq.${vertical}`;
    if (doc_class) params += `&document_class=eq.${doc_class}`;

    try {
      const docs = await dbGet("knowledge_documents", params);
      return res.status(200).json({ documents: docs, total: docs.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE — remove document and its chunks ──────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      await dbDelete("knowledge_chunks", `?document_id=eq.${encodeURIComponent(id)}`);
      await dbDelete("knowledge_documents", `?id=eq.${encodeURIComponent(id)}`);
      return res.status(200).json({ success: true, deleted: id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST — upload and process document ───────────────────────────────────
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    filename,
    file_type, // pdf, docx, txt, html, md
    content_base64, // base64 encoded file content
    content_text, // plain text if already extracted (optional shortcut)
    vertical: hintVertical,
    document_class: hintDocClass,
    client: hintClient,
    contract_name: hintContractName,
  } = req.body || {};

  if (!filename || (!content_base64 && !content_text)) {
    return res.status(400).json({ error: "filename and content_base64 or content_text required" });
  }

  const ext = (file_type || filename.split(".").pop() || "txt").toLowerCase();
  const docId = `doc-${Date.now()}-${safeId(filename)}`;
  const now = new Date().toISOString();

  // ── Step 1: Extract or receive text ─────────────────────────────────────
  let rawText = "";

  if (content_text) {
    rawText = content_text;
  } else {
    const directExtract = extractTextFromContent(content_base64, ext);
    if (directExtract !== null) {
      rawText = directExtract;
    } else {
      // PDF/DOCX — use Claude vision to extract text
      const mediaType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
      try {
        const extractResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: content_base64,
                  }
                },
                {
                  type: "text",
                  text: "Extract all text content from this document. Return the full text only, preserving section headers and structure. No commentary."
                }
              ]
            }]
          }),
        });
        const extractData = await extractResp.json();
        rawText = extractData.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      } catch (e) {
        console.warn("PDF extraction failed:", e.message);
        rawText = `[Extraction failed for ${filename}]`;
      }
    }
  }

  rawText = rawText.slice(0, 150000); // cap at 150k chars

  // ── Step 2: Classify document ────────────────────────────────────────────
  const classifyPrompt = `You are classifying a document for HGI Global (Hammerman & Gainer), a government contracting and claims administration firm.

Document filename: ${filename}
First 2000 characters of content:
${rawText.slice(0, 2000)}

Return ONLY valid JSON:
{
  "document_class": "${DOC_CLASSES.join("|")}",
  "vertical": "${VERTICALS.join("|")}",
  "client": "client name or empty string",
  "contract_name": "contract or program name or empty string",
  "summary": "3-5 sentence plain English summary of what this document is and its key content"
}`;

  let classification = {
    document_class: hintDocClass || "other",
    vertical: hintVertical || "general",
    client: hintClient || "",
    contract_name: hintContractName || "",
    summary: "",
  };

  try {
    const classRaw = await askClaude(classifyPrompt, "Return ONLY valid JSON. No markdown.", 800);
    const classClean = classRaw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(classClean.slice(classClean.indexOf("{"), classClean.lastIndexOf("}") + 1));
    classification = { ...classification, ...parsed };
  } catch (e) {
    console.warn("Classification failed:", e.message);
  }

  // ── Step 3: Chunk the text ───────────────────────────────────────────────
  const chunks = chunkText(rawText);

  // ── Step 4: Extract doctrine (structured JSON) ───────────────────────────
  const doctrinePrompt = `You are extracting structured institutional knowledge from an HGI document for use in AI-powered proposal and opportunity analysis.

Document: ${filename}
Type: ${classification.document_class}
Vertical: ${classification.vertical}
Client: ${classification.client}

Full text sample (first 6000 chars):
${rawText.slice(0, 6000)}

Extract ALL available structured information. Return ONLY valid JSON:
{
  "past_performance": [
    {
      "client": "string",
      "program": "string", 
      "scope": "string",
      "scale": "string",
      "period": "string",
      "outcome": "string",
      "relevance": "string"
    }
  ],
  "service_lines": ["specific service 1", "specific service 2"],
  "key_personnel_roles": ["role title 1", "role title 2"],
  "evaluation_factor_patterns": {
    "technical_approach": "how HGI typically responds to technical approach sections",
    "management_approach": "how HGI structures management responses",
    "past_performance": "how HGI presents past performance",
    "price_cost": "HGI pricing approach pattern"
  },
  "compliance_matrix_items": ["requirement 1", "requirement 2"],
  "risk_mitigation_themes": ["theme 1", "theme 2"],
  "win_themes": ["theme 1", "theme 2", "theme 3"],
  "pricing_model": "T&M|fixed|cost-plus|per-claim|hybrid|unknown",
  "narrative_summary": "2-3 sentence summary of key doctrine extracted"
}`;

  let doctrine = {
    past_performance: [],
    service_lines: [],
    key_personnel_roles: [],
    evaluation_factor_patterns: {},
    compliance_matrix_items: [],
    risk_mitigation_themes: [],
    win_themes: [],
    pricing_model: "unknown",
    narrative_summary: classification.summary,
  };

  try {
    const docRaw = await askClaude(doctrinePrompt, "Return ONLY valid JSON. No markdown.", 2000);
    const docClean = docRaw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(docClean.slice(docClean.indexOf("{"), docClean.lastIndexOf("}") + 1));
    doctrine = { ...doctrine, ...parsed };
  } catch (e) {
    console.warn("Doctrine extraction failed:", e.message);
  }

  // ── Step 5: Extract winning DNA (if proposal or capabilities) ────────────
  let winningDna = null;
  if (["winning_proposal", "capabilities_statement", "unsolicited_proposal"].includes(classification.document_class)) {
    const dnaPrompt = `Extract winning DNA patterns from this HGI proposal/capabilities document.

Document: ${filename}
Vertical: ${classification.vertical}
Text sample: ${rawText.slice(0, 5000)}

Return ONLY valid JSON:
{
  "win_themes": [
    {"theme": "theme title", "pattern": "how this theme is expressed", "frequency": "high|medium|low"}
  ],
  "technical_approach_patterns": [
    {"section": "section name", "pattern": "structural pattern used"}
  ],
  "staffing_patterns": [
    {"role": "role title", "qualifications": "key quals", "responsibilities": "key responsibilities"}
  ],
  "pricing_narrative_tone": "description of pricing narrative style",
  "capture_strategy_themes": ["theme 1", "theme 2"],
  "differentiators": ["differentiator 1", "differentiator 2"],
  "red_flags": ["weakness or gap identified in this proposal"]
}`;

    try {
      const dnaRaw = await askClaude(dnaPrompt, "Return ONLY valid JSON. No markdown.", 2000);
      const dnaClean = dnaRaw.replace(/```json|```/g, "").trim();
      winningDna = JSON.parse(dnaClean.slice(dnaClean.indexOf("{"), dnaClean.lastIndexOf("}") + 1));
    } catch (e) {
      console.warn("DNA extraction failed:", e.message);
    }
  }

  // ── Step 6: Store document record ───────────────────────────────────────
  try {
    await dbInsert("knowledge_documents", {
      id: docId,
      filename,
      file_type: ext,
      document_class: classification.document_class,
      vertical: classification.vertical,
      client: classification.client,
      contract_name: classification.contract_name,
      summary: classification.summary,
      chunk_count: chunks.length,
      char_count: rawText.length,
      doctrine: doctrine,
      winning_dna: winningDna,
      uploaded_at: now,
      processed_at: now,
      status: "processed",
    });
  } catch (e) {
    console.error("Failed to save document record:", e.message);
    return res.status(500).json({ error: "Database save failed", details: e.message });
  }

  // ── Step 7: Store chunks ─────────────────────────────────────────────────
  const chunkRecords = chunks.map(chunk => ({
    id: `${docId}-chunk-${chunk.index}`,
    document_id: docId,
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    char_start: chunk.char_start,
    char_end: chunk.char_end,
    vertical: classification.vertical,
    document_class: classification.document_class,
    filename,
  }));

  // Insert chunks in batches of 20
  for (let i = 0; i < chunkRecords.length; i += 20) {
    try {
      await dbInsert("knowledge_chunks", chunkRecords.slice(i, i + 20));
    } catch (e) {
      console.warn(`Chunk batch ${i} failed:`, e.message);
    }
  }

  return res.status(200).json({
    success: true,
    id: docId,
    filename,
    document_class: classification.document_class,
    vertical: classification.vertical,
    client: classification.client,
    chunks_stored: chunks.length,
    doctrine_extracted: Object.keys(doctrine).length > 0,
    winning_dna_extracted: winningDna !== null,
    summary: classification.summary,
  });
}