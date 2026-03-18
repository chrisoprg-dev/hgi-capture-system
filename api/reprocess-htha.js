export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  var BUCKET = "knowledge-docs";
  var DOC_ID = "doc-1773803700859-HTHA-WorkingDraft-v4-Final.pdf";

  var dbH = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Prefer": "return=representation" };

  try {
    // 1. Get doc record
    var dr = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(DOC_ID) + "&select=*", { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
    var docs = await dr.json();
    if (!docs || !docs.length) return res.status(404).json({ error: "Not found" });
    var doc = docs[0];
    if (!doc.storage_path) return res.status(400).json({ error: "No storage_path", doc_status: doc.status });

    // 2. Download from storage
    var fr = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + doc.storage_path, {
      headers: { "Authorization": "Bearer " + SUPABASE_KEY }
    });
    if (!fr.ok) return res.status(500).json({ error: "Download failed: " + fr.status, path: doc.storage_path });
    var buf = await fr.arrayBuffer();
    var b64 = Buffer.from(buf).toString("base64");

    // 3. Extract text via Claude Haiku
    var cr = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Extract ALL text from this PDF. Return ONLY the text preserving structure. No commentary." }
        ]}]
      })
    });
    if (!cr.ok) return res.status(500).json({ error: "Claude: " + await cr.text() });
    var cd = await cr.json();
    var text = cd.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
    if (!text || text.length < 100) return res.status(500).json({ error: "Too short: " + (text ? text.length : 0) + " chars" });

    // 4. Delete old chunks if any
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks?document_id=eq." + encodeURIComponent(DOC_ID), {
      method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });

    // 5. Chunk and insert
    var chunks = [];
    for (var i = 0; i < text.length; i += 1500) {
      chunks.push({ document_id: DOC_ID, chunk_index: chunks.length, filename: doc.filename, chunk_text: text.slice(i, i + 1500) });
    }
    // Insert in batches of 20
    for (var j = 0; j < chunks.length; j += 20) {
      var batch = chunks.slice(j, j + 20);
      var ir = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", { method: "POST", headers: dbH, body: JSON.stringify(batch) });
      if (!ir.ok) return res.status(500).json({ error: "Chunk batch " + j + ": " + await ir.text() });
    }

    // 6. Update doc record
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(DOC_ID), {
      method: "PATCH", headers: dbH,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "processed", processed_at: new Date().toISOString(), document_class: "winning_proposal", vertical: "disaster_recovery" })
    });

    return res.status(200).json({ success: true, chunks: chunks.length, chars: text.length, preview: text.slice(0, 500) });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}