// api/extract-pdf.js — Fetch a PDF by URL and extract text via Claude
// Used by LaPAC scraper before sending to intake.
export const config = { maxDuration: 60 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    // Fetch the PDF
    const pdfRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HGI-Capture/1.0)' },
      redirect: 'follow'
    });
    if (!pdfRes.ok) return res.status(502).json({ error: 'PDF fetch failed: ' + pdfRes.status, url });

    const pdfBuffer = await pdfRes.arrayBuffer();
    const base64 = Buffer.from(pdfBuffer).toString('base64');

    // Send to Claude for extraction
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 }
            },
            {
              type: 'text',
              text: 'Extract all text from this RFP/solicitation document. Include: title, issuing agency, deadline/due date, scope of work, requirements, evaluation criteria, and any other key procurement details. Return as clean plain text, preserving section structure.'
            }
          ]
        }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(502).json({ error: 'Claude API error: ' + claudeRes.status, detail: err });
    }

    const claudeData = await claudeRes.json();
    const extractedText = claudeData.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return res.json({
      success: true,
      url,
      extractedText,
      charCount: extractedText.length,
      pdfSizeBytes: pdfBuffer.byteLength
    });

  } catch (e) {
    console.error('[extract-pdf] Error:', e.message);
    return res.status(500).json({ error: e.message, url });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  var BUCKET = "knowledge-docs";

  var dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  var docId = (req.query && req.query.id) || "doc-1773803700859-HTHA-WorkingDraft-v4-Final.pdf";

  try {
    // Step 1: Look up document
    var lookupResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(docId) + "&select=id,storage_path,filename,status,chunk_count", {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    var docs = await lookupResp.json();
    if (!docs || !docs.length) return res.status(404).json({ error: "Document not found", id: docId });
    var doc = docs[0];
    if (doc.chunk_count > 0) return res.status(200).json({ message: "Already extracted", id: docId, chunks: doc.chunk_count });
    if (!doc.storage_path) return res.status(400).json({ error: "No storage_path", doc: doc });

    // Step 2: Download from Supabase Storage
    var url1 = SUPABASE_URL + "/storage/v1/object/authenticated/" + BUCKET + "/" + doc.storage_path;
    var fileResp = await fetch(url1, { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
    if (!fileResp.ok) {
      var url2 = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + doc.storage_path;
      fileResp = await fetch(url2, { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
      if (!fileResp.ok) return res.status(500).json({ error: "Download failed", status: fileResp.status, path: doc.storage_path });
    }

    var buf = await fileResp.arrayBuffer();
    var b64 = Buffer.from(buf).toString("base64");

    // Step 3: Claude extracts text
    var cResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-3-5-20241022",
        max_tokens: 8000,
        system: "Extract ALL text from this PDF. Return ONLY the text. No commentary.",
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Extract all text." }
        ]}]
      })
    });
    if (!cResp.ok) return res.status(500).json({ error: "Claude failed: " + await cResp.text() });
    var cData = await cResp.json();
    var text = cData.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
    if (!text || text.length < 50) return res.status(500).json({ error: "Too short", len: text.length });

    // Step 4: Chunk
    var chunks = [];
    for (var i = 0; i < text.length; i += 4000) {
      chunks.push({ document_id: docId, chunk_index: chunks.length, filename: doc.filename, chunk_text: text.slice(i, i + 4000) });
    }

    // Step 5: Insert chunks
    var ir = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", { method: "POST", headers: dbHeaders, body: JSON.stringify(chunks) });
    if (!ir.ok) return res.status(500).json({ error: "Chunk insert: " + await ir.text() });

    // Step 6: Update doc
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(docId), {
      method: "PATCH", headers: dbHeaders,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "chunked" })
    });

    return res.status(200).json({ success: true, id: docId, chunks: chunks.length, chars: text.length, preview: text.slice(0, 300) });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}