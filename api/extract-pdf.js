export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  var BUCKET = "knowledge-docs";

  // GET = one-click extract for HTHA document
  if (req.method === "GET") {
    var hDocId = "doc-1773803700859-HTHA-WorkingDraft-v4-Final.pdf";
    var hStoragePath = "";
    // Look up the storage path from the DB
    try {
      var lookupResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(hDocId) + "&select=storage_path,filename,status,chunk_count", {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
      });
      var lookupDocs = await lookupResp.json();
      if (!lookupDocs || !lookupDocs.length) return res.status(404).json({ error: "HTHA doc not found in DB", id: hDocId });
      if (lookupDocs[0].chunk_count > 0) return res.status(200).json({ message: "Already extracted", chunks: lookupDocs[0].chunk_count, status: lookupDocs[0].status });
      hStoragePath = lookupDocs[0].storage_path;
      if (!hStoragePath) return res.status(400).json({ error: "No storage_path on record", doc: lookupDocs[0] });

      // Redirect to self as POST
      var postBody = JSON.stringify({ doc_id: hDocId, storage_path: hStoragePath, filename: lookupDocs[0].filename || "HTHA_WorkingDraft_v4_Final.pdf" });
      var selfUrl = (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "") + "/api/extract-pdf";
      var postResp = await fetch(selfUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-intake-secret": "hgi-intake-2026-secure" },
        body: postBody
      });
      var postData = await postResp.json();
      return res.status(postResp.status).json(postData);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var secret = req.headers["x-intake-secret"];
  if (secret !== "hgi-intake-2026-secure") return res.status(401).json({ error: "Unauthorized" });

  var dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  try {
    var body = req.body || {};
    var docId = body.doc_id;
    var storagePath = body.storage_path;
    var filename = body.filename || "document.pdf";

    if (!docId || !storagePath) return res.status(400).json({ error: "doc_id and storage_path required" });

    // Step 1: Download PDF from Supabase Storage
    var downloadUrl = SUPABASE_URL + "/storage/v1/object/authenticated/" + BUCKET + "/" + storagePath;
    var fileResp = await fetch(downloadUrl, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });

    if (!fileResp.ok) {
      // Try alternate URL format
      downloadUrl = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + storagePath;
      fileResp = await fetch(downloadUrl, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
      });
      if (!fileResp.ok) return res.status(500).json({ error: "Storage download failed: " + fileResp.status, url: downloadUrl });
    }

    var fileBuffer = await fileResp.arrayBuffer();
    var base64 = Buffer.from(fileBuffer).toString("base64");

    // Step 2: Send to Claude for text extraction
    var claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: "Extract ALL text from this PDF. Return ONLY the text content preserving structure. No commentary.",
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Extract all text from this PDF document." }
        ]}]
      })
    });

    if (!claudeResp.ok) return res.status(500).json({ error: "Claude extraction failed: " + await claudeResp.text() });

    var claudeData = await claudeResp.json();
    var extractedText = claudeData.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("");

    if (!extractedText || extractedText.length < 50) return res.status(500).json({ error: "Extraction too short", length: extractedText ? extractedText.length : 0 });

    // Step 3: Chunk the text
    var chunkSize = 4000;
    var chunks = [];
    for (var i = 0; i < extractedText.length; i += chunkSize) {
      chunks.push({ document_id: docId, chunk_index: chunks.length, filename: filename, chunk_text: extractedText.slice(i, i + chunkSize) });
    }

    // Step 4: Insert chunks
    var chunkResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", {
      method: "POST", headers: dbHeaders, body: JSON.stringify(chunks)
    });
    if (!chunkResp.ok) return res.status(500).json({ error: "Chunk insert failed: " + await chunkResp.text() });

    // Step 5: Update document record
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(docId), {
      method: "PATCH", headers: dbHeaders,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: extractedText.length, status: "chunked", raw_text: extractedText.slice(0, 5000) })
    });

    return res.status(200).json({ success: true, doc_id: docId, chunks: chunks.length, chars: extractedText.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}