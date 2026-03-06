// api/knowledge.js — HGI Knowledge Base Engine v3
// Architecture: Upload to Supabase Storage → Process in pages → Never times out
// Handles: PDF, DOCX, TXT, images (OCR), any size
export const config = { maxDuration: 120 };

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 150;
const STORAGE_BUCKET = "knowledge-docs";
const PAGE_BATCH_SIZE = 10; // pages processed per Claude call

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

  // ── Database helpers ──────────────────────────────────────────────────────
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

  // ── Storage helpers ───────────────────────────────────────────────────────
  const storageUpload = async (path, fileBuffer, mimeType) => {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: fileBuffer,
    });
    if (!r.ok) throw new Error(`Storage upload failed: ${await r.text()}`);
    return `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;
  };

  const storageDownload = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      headers: { "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    if (!r.ok) throw new Error(`Storage download failed: ${await r.text()}`);
    return r.arrayBuffer();
  };

  const storageDelete = async (path) => {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(path)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
  };

  // ── Claude helpers ────────────────────────────────────────────────────────
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

  const extractTextFromFile = async (fileBase64, mimeType, filename) => {
    // Plain text files — decode directly
    if (mimeType === "text/plain" || filename.endsWith(".txt") || filename.endsWith(".md")) {
      return Buffer.from(fileBase64, "base64").toString("utf-8");
    }

    // HTML — strip tags
    if (mimeType === "text/html" || filename.endsWith(".html")) {
      const html = Buffer.from(fileBase64, "base64").toString("utf-8");
      return html.replace(/<[^>]+>/g, " ").replace(/\s{3,}/g, "\n").trim();
    }

    // PDF and DOCX — send to Claude in batches
    const isPdf = mimeType === "application/pdf" || filename.endsWith(".pdf");
    const isDocx = filename.endsWith(".docx") || mimeType.includes("wordprocessingml");
    const isImage = mimeType.startsWith("image/");

    if (isPdf || isDocx || isImage) {
      const claudeMime = isPdf ? "application/pdf"
        : isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : mimeType;

      // Split large files into batches of ~1MB base64 each
      const BATCH_SIZE = 1000000; // 1MB base64 per batch
      const batches = [];
      for (let i = 0; i < fileBase64.length; i += BATCH_SIZE) {
        batches.push(fileBase64.slice(i, i + BATCH_SIZE));
      }

      let fullText = "";
      for (let i = 0; i < batches.length; i++) {
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
              max_tokens: 4000,
              messages: [{
                role: "user",
                content: [
                  {
                    type: "document",
                    source: { type: "base64", media_type: isPdf ? "application/pdf" : claudeMime, data: batches[i] }
                  },
                  {
                    type: "text",
                    text: batches.length > 1
                      ? `Extract all text from this document segment (part ${i+1} of ${batches.length}). Preserve all section headers, numbered lists, and structure. Return plain text only.`
                      : "Extract all text from this document. Preserve all section headers, numbered lists, and structure. Return plain text only."
                  }
                ]
              }]
            }),
          });
          const d = await r.json();
          const batchText = d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
          fullText += (i > 0 ? "\n\n" : "") + batchText;
        } catch(e) {
          console.warn(`Batch ${i+1} extraction failed:`, e.message);
          fullText += `\n\n[Batch ${i+1} extraction failed: ${e.message}]`;
        }
      }
      return fullText;
    }

    return `[Unsupported file type: ${mimeType}]`;
  };

  const classifyAndExtract = async (rawText, filename) => {
    const sample = rawText.slice(0, 6000);

    const [classRaw, docRaw] = await Promise.all([
      askClaude(
        `Classify this HGI document. Return ONLY valid JSON, no backticks:
{"document_class":"winning_proposal|rfp|capabilities_statement|corporate_profile|resume|rate_sheet|contract|past_performance|unsolicited_proposal|certification|amendment|other","vertical":"disaster|tpa|appeals|workforce|health|infrastructure|federal|construction|general","client":"client name or empty","contract_name":"contract name or empty","summary":"3-4 sentence summary of what this document is and its strategic value to HGI proposals"}
Filename: ${filename}
Content: ${sample}`,
        "Return ONLY valid JSON. No markdown. No backticks. No extra text.", 800
      ),
      askClaude(
        `Extract structured knowledge from this HGI document. Return ONLY valid JSON, no backticks:
{"past_performance":[{"client":"","program":"","scope":"","scale":"","outcome":""}],"service_lines":["s1","s2"],"win_themes":["t1","t2","t3"],"key_personnel":["name — role — key credential"],"certifications":["cert1"],"risk_mitigation_themes":["t1"],"pricing_model":"T&M|fixed|cost-plus|per-claim|unknown","key_stats":["stat1","stat2"],"narrative_summary":"2 sentence summary of why this document strengthens HGI proposals"}
Filename: ${filename}
Content: ${rawText.slice(0, 8000)}`,
        "Return ONLY valid JSON. No markdown. No backticks. No extra text.", 2000
      )
    ]);

    let classification = { document_class:"other", vertical:"general", client:"", contract_name:"", summary:"" };
    let doctrine = { past_performance:[], service_lines:[], win_themes:[], key_personnel:[], certifications:[], risk_mitigation_themes:[], pricing_model:"unknown", key_stats:[], narrative_summary:"" };

    try {
      const raw = classRaw.replace(/```json|```/g,"").trim();
      classification = { ...classification, ...JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}")+1)) };
    } catch(e) { console.warn("Classify parse failed:", classRaw.slice(0,200)); }

    try {
      const raw = docRaw.replace(/```json|```/g,"").trim();
      doctrine = { ...doctrine, ...JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}")+1)) };
    } catch(e) { console.warn("Doctrine parse failed:", docRaw.slice(0,200)); }

    // Extract winning DNA for proposals
    let winningDna = null;
    if (["winning_proposal","capabilities_statement","unsolicited_proposal","past_performance"].includes(classification.document_class)) {
      try {
        const dnaRaw = await askClaude(
          `Extract winning proposal DNA from this HGI document. Return ONLY valid JSON, no backticks:
{"win_themes":[{"theme":"","evidence":"","frequency":"high|medium|low"}],"technical_approach_patterns":[{"section":"","approach":""}],"staffing_patterns":[{"role":"","qualifications":"","responsibilities":""}],"past_performance_bullets":["bullet1","bullet2"],"pricing_narrative_tone":"description","differentiators":["d1","d2","d3"],"proposal_language_samples":["verbatim sentence 1","verbatim sentence 2"]}
Content: ${rawText.slice(0, 8000)}`,
          "Return ONLY valid JSON. No markdown. No backticks.", 2000
        );
        const raw = dnaRaw.replace(/```json|```/g,"").trim();
        winningDna = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}")+1));
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

  // ── PROCESS endpoint — called to fully process a stored document ──────────
  const processDocument = async (docId) => {
    const docs = await dbGet("knowledge_documents", `?id=eq.${encodeURIComponent(docId)}&select=*`);
    if (!docs.length) throw new Error("Document not found: " + docId);
    const doc = docs[0];

    // Delete existing chunks for this doc (re-processing)
    try { await dbDelete("knowledge_chunks", `?document_id=eq.${encodeURIComponent(docId)}`); } catch(e) {}

    await dbPatch("knowledge_documents", docId, { status: "processing", summary: "Extracting text..." });

    let rawText = "";

    // Try to get content from storage first
    if (doc.storage_path) {
      try {
        const buffer = await storageDownload(doc.storage_path);
        const base64 = Buffer.from(buffer).toString("base64");
        rawText = await extractTextFromFile(base64, doc.mime_type || "application/pdf", doc.filename);
      } catch(e) {
        console.warn("Storage download failed:", e.message);
      }
    }

    // Fall back to inline content
    if (!rawText && doc.raw_text) rawText = doc.raw_text;
    if (!rawText && doc.content_base64) {
      const direct = extractPlainText(doc.content_base64, doc.file_type);
      if (direct !== null) rawText = direct;
    }

    if (!rawText) throw new Error("No content available to process");

    // Cap at 200k chars — ~150 pages worth
    rawText = rawText.slice(0, 200000);

    await dbPatch("knowledge_documents", docId, { status: "processing", summary: "Classifying and extracting doctrine..." });

    const { classification, doctrine, winningDna } = await classifyAndExtract(rawText, doc.filename);
    const chunkCount = await storeChunks(docId, rawText, classification, doc.filename);

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
      content_base64: null, // clear after processing
    });

    return { chunkCount, classification, doctrine };
  };

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { vertical, doc_class, limit = "50", id } = req.query || {};

    if (id) {
      try {
        const docs = await dbGet("knowledge_documents", `?id=eq.${encodeURIComponent(id)}&select=id,filename,status,chunk_count,document_class,vertical,summary,uploaded_at,processed_at`);
        return res.status(200).json(docs[0] || { error: "Not found" });
      } catch(e) { return res.status(500).json({ error: e.message }); }
    }

    let params = `?order=uploaded_at.desc&limit=${limit}&select=id,filename,file_type,document_class,vertical,client,contract_name,summary,chunk_count,char_count,uploaded_at,processed_at,status,doctrine,storage_path`;
    if (vertical) params += `&vertical=eq.${vertical}`;
    if (doc_class) params += `&document_class=eq.${doc_class}`;
    try {
      const docs = await dbGet("knowledge_documents", params);
      return res.status(200).json({ documents: docs, total: docs.length });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      // Get doc to find storage path
      const docs = await dbGet("knowledge_documents", `?id=eq.${encodeURIComponent(id)}&select=storage_path`);
      if (docs[0]?.storage_path) {
        await storageDelete(docs[0].storage_path).catch(() => {});
      }
      await dbDelete("knowledge_chunks", `?document_id=eq.${encodeURIComponent(id)}`);
      await dbDelete("knowledge_documents", `?id=eq.${encodeURIComponent(id)}`);
      return res.status(200).json({ success: true });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── POST: REPROCESS — reprocess an existing document ─────────────────────
  if (req.method === "POST" && req.query?.action === "reprocess") {
    const { doc_id } = req.body || {};
    if (!doc_id) return res.status(400).json({ error: "doc_id required" });
    try {
      const result = await processDocument(doc_id);
      return res.status(200).json({ success: true, ...result });
    } catch(e) {
      await dbPatch("knowledge_documents", doc_id, { status: "error", summary: "Processing failed: " + e.message }).catch(()=>{});
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST: UPLOAD ──────────────────────────────────────────────────────────
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    filename, file_type, content_base64, content_text,
    vertical: hintVertical, document_class: hintDocClass,
    client: hintClient, contract_name: hintContractName,
    mime_type: hintMime,
  } = req.body || {};

  if (!filename || (!content_base64 && !content_text)) {
    return res.status(400).json({ error: "filename and content required" });
  }

  const ext = (file_type || filename.split(".").pop() || "txt").toLowerCase();
  const mimeType = hintMime || (ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "txt" ? "text/plain" : "application/octet-stream");
  const docId = `doc-${Date.now()}-${safeId(filename)}`;
  const now = new Date().toISOString();
  const storagePath = `${docId}/${filename}`;

  // ── Step 1: Upload raw file to Supabase Storage ───────────────────────────
  let uploadedToStorage = false;
  if (content_base64) {
    try {
      const fileBuffer = Buffer.from(content_base64, "base64");
      await storageUpload(storagePath, fileBuffer, mimeType);
      uploadedToStorage = true;
    } catch(e) {
      console.warn("Storage upload failed, will use inline:", e.message);
    }
  }

  // ── Step 2: Create document record immediately ────────────────────────────
  try {
    await dbInsert("knowledge_documents", {
      id: docId,
      filename,
      file_type: ext,
      mime_type: mimeType,
      document_class: hintDocClass || "other",
      vertical: hintVertical || "general",
      client: hintClient || "",
      contract_name: hintContractName || "",
      summary: "Uploaded — processing now...",
      chunk_count: 0,
      char_count: 0,
      doctrine: {},
      winning_dna: null,
      uploaded_at: now,
      processed_at: null,
      status: "processing",
      storage_path: uploadedToStorage ? storagePath : null,
      content_base64: uploadedToStorage ? null : (content_base64 || null),
      raw_text: content_text || null,
    });
  } catch(e) {
    return res.status(500).json({ error: "Failed to create record: " + e.message });
  }

  // ── Step 3: Process the document ─────────────────────────────────────────
  // For plain text — process synchronously, it's fast
  const isPlainText = ext === "txt" || ext === "md";

  try {
    let rawText = "";

    if (content_text) {
      rawText = content_text;
    } else if (isPlainText) {
      rawText = Buffer.from(content_base64, "base64").toString("utf-8");
    } else {
      // For PDFs and DOCX — process from storage or inline
      rawText = await extractTextFromFile(content_base64, mimeType, filename);
    }

    rawText = rawText.slice(0, 200000);

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
      content_base64: null,
    });

    return res.status(200).json({
      success: true,
      id: docId,
      filename,
      document_class: classification.document_class,
      vertical: classification.vertical,
      client: classification.client,
      chunk_count: chunkCount,
      char_count: rawText.length,
      storage_path: uploadedToStorage ? storagePath : null,
      doctrine_extracted: doctrine.win_themes?.length > 0,
      winning_dna_extracted: winningDna !== null,
      summary: classification.summary,
    });

  } catch(e) {
    // Processing failed but file is stored — mark as error so user can retry
    await dbPatch("knowledge_documents", docId, {
      status: "error",
      summary: `Upload saved to storage. Processing failed: ${e.message}. Use Reprocess to retry.`,
    }).catch(() => {});

    return res.status(202).json({
      success: true,
      partial: true,
      id: docId,
      filename,
      status: "error",
      storage_path: uploadedToStorage ? storagePath : null,
      message: "File saved to storage but text extraction failed. Click Reprocess in the Knowledge Base to retry.",
      error: e.message,
    });
  }
}