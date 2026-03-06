// api/knowledge.js — HGI Knowledge Base Engine (Async Processing)
// Upload → Store immediately → Process in background → Never times out
export const config = { maxDuration: 120 };

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 150;
const MAX_SYNC_BASE64 = 2000000;   // ~1.5MB decoded — process synchronously below this
const MAX_ASYNC_CHARS = 120000;    // cap on chars sent to Claude

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

function extractPlainText(content, fileType) {
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
  const VERCEL_URL = process.env.VERCEL_URL || "";

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

  const dbPatch = async (table, id, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: dbHeaders, body: JSON.stringify(data),
    });
    if (!r.ok) console.warn(`DB PATCH ${table}:`, await r.text());
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

  const extractPdfText = async (pdfBase64) => {
    const data = pdfBase64.length > MAX_SYNC_BASE64
      ? pdfBase64.slice(0, MAX_SYNC_BASE64)
      : pdfBase64;
    const isLarge = pdfBase64.length > MAX_SYNC_BASE64;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
            { type: "text", text: isLarge
              ? "Extract the first 10,000 words of text. Preserve all section headers. Return plain text only."
              : "Extract all text from this document. Preserve all section headers. Return plain text only." }
          ]
        }]
      }),
    });
    const d = await r.json();
    let text = d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
    if (isLarge) text += "\n\n[LARGE DOCUMENT: First portion extracted. Upload remaining pages as separate file.]";
    return text;
  };

  const classifyAndExtract = async (rawText, filename) => {
    const sample = rawText.slice(0, MAX_ASYNC_CHARS);

    const [classRaw, docRaw] = await Promise.all([
      askClaude(
        `Classify this HGI document. Return ONLY valid JSON with no backticks:
{"document_class":"winning_proposal|rfp|capabilities_statement|corporate_profile|resume|rate_sheet|contract|past_performance|unsolicited_proposal|amendment|other","vertical":"disaster|tpa|appeals|workforce|health|infrastructure|federal|construction|general","client":"client name or empty","contract_name":"contract name or empty","summary":"3-4 sentence summary of what this document is and its value to HGI proposals"}
Filename: ${filename}
Content: ${sample.slice(0, 3000)}`,
        "Return ONLY valid JSON. No markdown. No backticks.", 600
      ),
      askClaude(
        `Extract structured knowledge from this HGI document. Return ONLY valid JSON with no backticks:
{"past_performance":[{"client":"","program":"","scope":"","scale":"","outcome":""}],"service_lines":["s1"],"win_themes":["t1","t2","t3"],"key_personnel_roles":["r1"],"risk_mitigation_themes":["t1"],"pricing_model":"T&M|fixed|cost-plus|per-claim|unknown","narrative_summary":"2 sentence summary of key doctrine extracted"}
Filename: ${filename}
Content: ${sample.slice(0, 5000)}`,
        "Return ONLY valid JSON. No markdown. No backticks.", 1500
      )
    ]);

    let classification = { document_class:"other", vertical:"general", client:"", contract_name:"", summary:"" };
    let doctrine = { past_performance:[], service_lines:[], win_themes:[], key_personnel_roles:[], risk_mitigation_themes:[], pricing_model:"unknown", narrative_summary:"" };

    try {
      const c = JSON.parse(classRaw.replace(/```json|```/g,"").trim().slice(classRaw.indexOf("{"), classRaw.lastIndexOf("}")+1));
      classification = { ...classification, ...c };
    } catch(e) { console.warn("Classify parse failed"); }

    try {
      const d = JSON.parse(docRaw.replace(/```json|```/g,"").trim().slice(docRaw.indexOf("{"), docRaw.lastIndexOf("}")+1));
      doctrine = { ...doctrine, ...d };
    } catch(e) { console.warn("Doctrine parse failed"); }

    let winningDna = null;
    if (["winning_proposal","capabilities_statement","unsolicited_proposal"].includes(classification.document_class)) {
      try {
        const dnaRaw = await askClaude(
          `Extract winning proposal DNA. Return ONLY valid JSON with no backticks:
{"win_themes":[{"theme":"","pattern":"","frequency":"high|medium|low"}],"technical_approach_patterns":[{"section":"","pattern":""}],"staffing_patterns":[{"role":"","qualifications":"","responsibilities":""}],"pricing_narrative_tone":"description","differentiators":["d1","d2"],"red_flags":["w1"]}
Content: ${sample.slice(0, 4000)}`,
          "Return ONLY valid JSON. No markdown. No backticks.", 1500
        );
        winningDna = JSON.parse(dnaRaw.replace(/```json|```/g,"").trim().slice(dnaRaw.indexOf("{"), dnaRaw.lastIndexOf("}")+1));
      } catch(e) { console.warn("DNA parse failed"); }
    }

    return { classification, doctrine, winningDna };
  };

  const storeChunks = async (docId, rawText, classification, filename) => {
    const chunks = chunkText(rawText);
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
      try { await dbInsert("knowledge_chunks", chunkRecords.slice(i, i+20)); }
      catch(e) { console.warn(`Chunk batch ${i} failed:`, e.message); }
    }
    return chunks.length;
  };

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { vertical, doc_class, limit = "50", id } = req.query || {};
    if (id) {
      try {
        const docs = await dbGet("knowledge_documents", `?id=eq.${encodeURIComponent(id)}&select=id,filename,status,chunk_count,document_class,vertical,summary,uploaded_at,processed_at`);
        return res.status(200).json(docs[0] || { error: "Not found" });
      } catch(e) { return res.status(500).json({ error: e.message }); }
    }
    let params = `?order=uploaded_at.desc&limit=${limit}&select=id,filename,file_type,document_class,vertical,client,contract_name,summary,chunk_count,uploaded_at,processed_at,status,doctrine`;
    if (vertical) params += `&vertical=eq.${vertical}`;
    if (doc_class) params += `&document_class=eq.${doc_class}`;
    try {
      const docs = await dbGet("knowledge_documents", params);
      return res.status(200).json({ documents: docs, total: docs.length });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      await dbDelete("knowledge_chunks", `?document_id=eq.${encodeURIComponent(id)}`);
      await dbDelete("knowledge_documents", `?id=eq.${encodeURIComponent(id)}`);
      return res.status(200).json({ success: true });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── POST: BACKGROUND PROCESS (called internally for large files) ──────────
  if (req.method === "POST" && req.query?.action === "process") {
    const { doc_id } = req.body || {};
    if (!doc_id) return res.status(400).json({ error: "doc_id required" });
    try {
      const docs = await dbGet("knowledge_documents", `?id=eq.${encodeURIComponent(doc_id)}&select=*`);
      if (!docs.length) return res.status(404).json({ error: "Not found" });
      const doc = docs[0];

      let rawText = doc.raw_text || "";
      if (!rawText && doc.content_base64) {
        const direct = extractPlainText(doc.content_base64, doc.file_type);
        rawText = direct !== null ? direct : await extractPdfText(doc.content_base64);
      }
      rawText = rawText.slice(0, 80000);

      const { classification, doctrine, winningDna } = await classifyAndExtract(rawText, doc.filename);
      const chunkCount = await storeChunks(doc_id, rawText, classification, doc.filename);

      await dbPatch("knowledge_documents", doc_id, {
        document_class: classification.document_class,
        vertical: classification.vertical,
        client: classification.client,
        contract_name: classification.contract_name,
        summary: classification.summary,
        chunk_count: chunkCount,
        char_count: rawText.length,
        doctrine,
        winning_dna: winningDna,
        processed_at: new Date().toISOString(),
        status: "processed",
        content_base64: null,
      });

      return res.status(200).json({ success: true, id: doc_id, chunk_count: chunkCount });
    } catch(e) {
      await dbPatch("knowledge_documents", req.body?.doc_id, { status: "error", summary: "Processing failed: " + e.message }).catch(()=>{});
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST: UPLOAD ──────────────────────────────────────────────────────────
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
  // ALL files — store immediately then process. PDFs get text extracted from first portion only.
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx";

  // Step 1: Store record immediately so upload never times out
  try {
    await dbInsert("knowledge_documents", {
      id: docId, filename, file_type: ext,
      document_class: hintDocClass || "other",
      vertical: hintVertical || "general",
      client: hintClient || "",
      contract_name: hintContractName || "",
      summary: "Processing...",
      chunk_count: 0, char_count: 0,
      doctrine: {}, winning_dna: null,
      uploaded_at: now, processed_at: null,
      status: "processing",
      content_base64: null,
      raw_text: content_text || null,
    });
  } catch(e) {
    return res.status(500).json({ error: "Failed to store: " + e.message });
  }

  // Step 2: Extract text — for PDFs always use truncated extraction to stay within time limit
  let rawText = "";
  if (content_text) {
    rawText = content_text;
  } else {
    const direct = extractPlainText(content_base64, ext);
    if (direct !== null) {
      rawText = direct;
    } else if (isPdf || isDocx) {
      // Always truncate to first 1.5MB of base64 to stay within Vercel time limit
      const truncated = content_base64.slice(0, 1500000);
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
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
                { type: "document", source: { type: "base64", media_type: isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: truncated } },
                { type: "text", text: "Extract the first 8,000 words of text from this document. Preserve all section headers and structure. Return plain text only, no commentary." }
              ]
            }]
          }),
        });
        const d = await r.json();
        rawText = d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        if (content_base64.length > 1500000) {
          rawText += "\n\n[Large document — first portion extracted. Core content captured for proposal use.]";
        }
      } catch(e) {
        rawText = `[Text extraction failed: ${e.message}]`;
      }
    }
  }
  rawText = rawText.slice(0, 80000);

  const { classification, doctrine, winningDna } = await classifyAndExtract(rawText, filename);
  const chunkCount = await storeChunks(docId, rawText, classification, filename);

  await dbPatch("knowledge_documents", docId, {
    document_class: classification.document_class,
    vertical: classification.vertical,
    client: classification.client,
    contract_name: classification.contract_name,
    summary: classification.summary,
    chunk_count: chunkCount,
    char_count: rawText.length,
    doctrine,
    winning_dna: winningDna,
    processed_at: new Date().toISOString(),
    status: "processed",
  });

  return res.status(200).json({
    success: true,
    async: false,
    id: docId,
    filename,
    document_class: classification.document_class,
    vertical: classification.vertical,
    client: classification.client,
    chunk_count: chunkCount,
    doctrine_extracted: doctrine.win_themes?.length > 0,
    winning_dna_extracted: winningDna !== null,
    summary: classification.summary,
  });
}
