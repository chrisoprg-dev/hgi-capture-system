// api/knowledge.js — HGI Knowledge Base Engine
// Upload → Extract → Chunk → Classify → Persist
export const config = { maxDuration: 120 };

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 150;
// Max base64 size to send to Claude for PDF extraction (~4MB decoded = ~5.3MB base64)
const MAX_PDF_BASE64 = 5000000;

function safeId(s) {
  return (s || "").toString().replace(/[^a-zA-Z0-9\-_]/g, "-").slice(0, 80);
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push({ index: chunks.length, text: text.slice(i, end), char_start: i, char_end: end });
    if (end === text.length) break;
    i += chunkSize - overlap;
  }
  return chunks;
}

function extractTextFromContent(content, fileType) {
  if (fileType === "txt" || fileType === "md") {
    try { return Buffer.from(content, "base64").toString("utf-8"); } catch(e) { return content; }
  }
  if (fileType === "html") {
    try {
      const html = Buffer.from(content, "base64").toString("utf-8");
      return html.replace(/<[^>]+>/g, " ").replace(/\s{3,}/g, " ").trim();
    } catch(e) { return ""; }
  }
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
      method: "DELETE", headers: dbHeaders,
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = await r.json();
    return d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
  };

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { vertical, doc_class, limit = "50" } = req.query || {};
    let params = `?order=uploaded_at.desc&limit=${limit}&select=id,filename,file_type,document_class,vertical,client,contract_name,summary,chunk_count,uploaded_at,status`;
    if (vertical) params += `&vertical=eq.${vertical}`;
    if (doc_class) params += `&document_class=eq.${doc_class}`;
    try {
      const docs = await dbGet("knowledge_documents", params);
      return res.status(200).json({ documents: docs, total: docs.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      await dbDelete("knowledge_chunks", `?document_id=eq.${encodeURIComponent(id)}`);
      await dbDelete("knowledge_documents", `?id=eq.${encodeURIComponent(id)}`);
      return res.status(200).json({ success: true, deleted: id });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    filename, file_type, content_base64, content_text,
    vertical: hintVertical, document_class: hintDocClass,
    client: hintClient, contract_name: hintContractName,
  } = req.body || {};

  if (!filename || (!content_base64 && !content_text)) {
    return res.status(400).json({ error: "filename and content required" });
  }

  const ext = (file_type || filename.split(".").pop() || "txt").toLowerCase();
  const docId = `doc-${Date.now()}-${safeId(filename)}`;
  const now = new Date().toISOString();

  // ── Step 1: Extract text ─────────────────────────────────────────────────
  let rawText = "";

  if (content_text) {
    rawText = content_text;
  } else {
    const directExtract = extractTextFromContent(content_base64, ext);
    if (directExtract !== null) {
      rawText = directExtract;
    } else {
      // PDF/DOCX — truncate large files before sending to Claude
      const pdfData = content_base64.length > MAX_PDF_BASE64
        ? content_base64.slice(0, MAX_PDF_BASE64)
        : content_base64;

      const isLarge = content_base64.length > MAX_PDF_BASE64;

      try {
        const extractResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 3000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: pdfData }
                },
                {
                  type: "text",
                  text: isLarge
                    ? "Extract the first 8000 words of text from this document. Preserve section headers. Return text only, no commentary."
                    : "Extract all text from this document. Preserve section headers. Return text only, no commentary."
                }
              ]
            }]
          }),
        });
        const extractData = await extractResp.json();
        rawText = extractData.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        if (isLarge) rawText += "\n\n[Note: Document was truncated — first portion extracted]";
      } catch(e) {
        console.warn("PDF extraction failed:", e.message);
        rawText = `[Extraction failed for ${filename}: ${e.message}]`;
      }
    }
  }

  rawText = rawText.slice(0, 80000); // cap at 80k chars

  // ── Step 2: Classify + extract doctrine IN PARALLEL ──────────────────────
  const classifyPrompt = `Classify this HGI document. Return ONLY valid JSON:
{
  "document_class": "winning_proposal|rfp|capabilities_statement|corporate_profile|resume|rate_sheet|contract|past_performance|unsolicited_proposal|amendment|other",
  "vertical": "disaster|tpa|appeals|workforce|health|infrastructure|federal|construction|general",
  "client": "client name or empty string",
  "contract_name": "contract name or empty string",
  "summary": "3-4 sentence plain English summary of this document"
}

Filename: ${filename}
Content sample: ${rawText.slice(0, 3000)}`;

  const doctrinePrompt = `Extract structured knowledge from this HGI document. Return ONLY valid JSON:
{
  "past_performance": [{"client":"","program":"","scope":"","scale":"","outcome":""}],
  "service_lines": ["service1","service2"],
  "win_themes": ["theme1","theme2"],
  "key_personnel_roles": ["role1","role2"],
  "risk_mitigation_themes": ["theme1"],
  "pricing_model": "T&M|fixed|cost-plus|per-claim|unknown",
  "narrative_summary": "2 sentence summary of key doctrine extracted"
}

Filename: ${filename}
Content: ${rawText.slice(0, 5000)}`;

  // Run classify and doctrine extraction in parallel to save time
  const [classRaw, docRaw] = await Promise.all([
    askClaude(classifyPrompt, "Return ONLY valid JSON. No markdown backticks.", 600),
    askClaude(doctrinePrompt, "Return ONLY valid JSON. No markdown backticks.", 1500),
  ]);

  let classification = {
    document_class: hintDocClass || "other",
    vertical: hintVertical || "general",
    client: hintClient || "",
    contract_name: hintContractName || "",
    summary: "",
  };

  let doctrine = {
    past_performance: [], service_lines: [], win_themes: [],
    key_personnel_roles: [], risk_mitigation_themes: [],
    pricing_model: "unknown", narrative_summary: "",
  };

  try {
    const c = JSON.parse(classRaw.replace(/```json|```/g,"").trim().slice(
      classRaw.indexOf("{"), classRaw.lastIndexOf("}") + 1
    ));
    classification = { ...classification, ...c };
  } catch(e) { console.warn("Classify parse failed"); }

  try {
    const d = JSON.parse(docRaw.replace(/```json|```/g,"").trim().slice(
      docRaw.indexOf("{"), docRaw.lastIndexOf("}") + 1
    ));
    doctrine = { ...doctrine, ...d };
  } catch(e) { console.warn("Doctrine parse failed"); }

  // ── Step 3: Extract winning DNA for proposals ────────────────────────────
  let winningDna = null;
  if (["winning_proposal","capabilities_statement","unsolicited_proposal"].includes(classification.document_class)) {
    const dnaPrompt = `Extract winning proposal DNA from this HGI document. Return ONLY valid JSON:
{
  "win_themes": [{"theme":"","pattern":"","frequency":"high|medium|low"}],
  "technical_approach_patterns": [{"section":"","pattern":""}],
  "staffing_patterns": [{"role":"","qualifications":"","responsibilities":""}],
  "pricing_narrative_tone": "description",
  "differentiators": ["differentiator1"],
  "red_flags": ["weakness1"]
}

Content: ${rawText.slice(0, 4000)}`;

    try {
      const dnaRaw = await askClaude(dnaPrompt, "Return ONLY valid JSON. No markdown backticks.", 1500);
      winningDna = JSON.parse(dnaRaw.replace(/```json|```/g,"").trim().slice(
        dnaRaw.indexOf("{"), dnaRaw.lastIndexOf("}") + 1
      ));
    } catch(e) { console.warn("DNA parse failed"); }
  }

  // ── Step 4: Chunk and store ──────────────────────────────────────────────
  const chunks = chunkText(rawText);

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
      doctrine,
      winning_dna: winningDna,
      uploaded_at: now,
      processed_at: now,
      status: "processed",
    });
  } catch(e) {
    return res.status(500).json({ error: "Database save failed", details: e.message });
  }

  // Store chunks in batches of 20
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

  for (let i = 0; i < chunkRecords.length; i += 20) {
    try {
      await dbInsert("knowledge_chunks", chunkRecords.slice(i, i + 20));
    } catch(e) {
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
    doctrine_extracted: doctrine.win_themes?.length > 0,
    winning_dna_extracted: winningDna !== null,
    summary: classification.summary,
  });
}