export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  var DOC_ID = "doc-1773802120405-HTHA-WorkingDraft-v4-Final--3-.docx";
  var FILENAME = "HTHA_WorkingDraft_v4_Final.docx";
  var BUCKET = "knowledge-docs";

  var dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  if (req.method === "POST") {
    var secret = req.headers["x-intake-secret"];
    if (secret !== "hgi-intake-2026-secure") return res.status(401).json({ error: "Unauthorized" });
    try {
      var body = req.body || {};
      var text = body.text;
      if (!text) return res.status(400).json({ error: "text required" });
      var docId = body.doc_id || DOC_ID;
      var fname = body.filename || FILENAME;
      var chunkSize = 4000;
      var chunks = [];
      for (var i = 0; i < text.length; i += chunkSize) {
        chunks.push({ document_id: docId, chunk_index: chunks.length, filename: fname, chunk_text: text.slice(i, i + chunkSize) });
      }
      var r2 = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", { method: "POST", headers: dbHeaders, body: JSON.stringify(chunks) });
      if (!r2.ok) return res.status(500).json({ error: "Chunk insert: " + await r2.text() });
      await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(docId), { method: "PATCH", headers: dbHeaders, body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "chunked" }) });
      return res.status(200).json({ success: true, chunks: chunks.length, chars: text.length });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // GET = auto-run: find file in storage, extract via Claude, chunk, store
  try {
    // Step 1: Get the storage path from the document record
    var docResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(DOC_ID) + "&select=storage_path,filename,status,chunk_count", {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    var docs = await docResp.json();
    if (!docs || !docs.length) return res.status(404).json({ error: "Doc record not found", id: DOC_ID });
    var doc = docs[0];
    
    if (doc.chunk_count > 0) return res.status(200).json({ message: "Already chunked", chunks: doc.chunk_count, status: doc.status });

    var storagePath = doc.storage_path;
    if (!storagePath) return res.status(400).json({ error: "No storage_path on record. Storage path is null.", doc: doc });

    // Step 2: List bucket to verify file exists
    var listResp = await fetch(SUPABASE_URL + "/storage/v1/object/list/" + BUCKET, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: storagePath.split("/")[0], limit: 10 })
    });
    var listing = await listResp.json();

    // Step 3: Download file from Supabase Storage using authenticated URL
    var downloadUrl = SUPABASE_URL + "/storage/v1/object/authenticated/" + BUCKET + "/" + storagePath;
    var fileResp = await fetch(downloadUrl, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    
    if (!fileResp.ok) {
      // Try alternate URL format
      var altUrl = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + storagePath;
      fileResp = await fetch(altUrl, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
      });
      if (!fileResp.ok) {
        return res.status(500).json({ error: "Storage download failed", status: fileResp.status, tried: [downloadUrl, altUrl], storagePath: storagePath, listing: listing });
      }
    }

    var fileBuffer = await fileResp.arrayBuffer();
    var base64 = Buffer.from(fileBuffer).toString("base64");

    // Step 4: Extract text via Claude
    var claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: "Extract ALL text from this document. Return ONLY the text content, no commentary.",
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: base64 } },
          { type: "text", text: "Extract all text from this document." }
        ]}]
      })
    });
    if (!claudeResp.ok) return res.status(500).json({ error: "Claude failed: " + await claudeResp.text() });
    var claudeData = await claudeResp.json();
    var extracted = claudeData.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
    if (!extracted || extracted.length < 100) return res.status(500).json({ error: "Extraction too short", len: extracted.length });

    // Step 5: Chunk and insert
    var chunkSize = 4000;
    var chunks = [];
    for (var j = 0; j < extracted.length; j += chunkSize) {
      chunks.push({ document_id: DOC_ID, chunk_index: chunks.length, filename: FILENAME, chunk_text: extracted.slice(j, j + chunkSize) });
    }
    var insertResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", { method: "POST", headers: dbHeaders, body: JSON.stringify(chunks) });
    if (!insertResp.ok) return res.status(500).json({ error: "Chunk insert: " + await insertResp.text() });

    // Step 6: Update document
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(DOC_ID), {
      method: "PATCH", headers: dbHeaders,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: extracted.length, status: "chunked", raw_text: extracted.slice(0, 5000) })
    });

    return res.status(200).json({ success: true, message: "HTHA proposal extracted and chunked", chunks: chunks.length, chars: extracted.length, preview: extracted.slice(0, 300) });
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}