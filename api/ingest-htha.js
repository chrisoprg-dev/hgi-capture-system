export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var secret = req.headers["x-intake-secret"];
  if (secret !== "hgi-intake-2026-secure") return res.status(401).json({ error: "Unauthorized" });

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  try {
    var body = req.body || {};
    var docId = body.doc_id;
    var text = body.text;
    if (!docId || !text) return res.status(400).json({ error: "doc_id and text required" });

    var chunkSize = 4000;
    var chunks = [];
    for (var i = 0; i < text.length; i += chunkSize) {
      chunks.push({
        document_id: docId,
        chunk_index: chunks.length,
        filename: body.filename || "uploaded.docx",
        chunk_text: text.slice(i, i + chunkSize)
      });
    }

    var r = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify(chunks)
    });

    if (!r.ok) {
      var err = await r.text();
      return res.status(500).json({ error: "Chunk insert failed: " + err });
    }

    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(docId), {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "chunked" })
    });

    return res.status(200).json({ success: true, chunks: chunks.length, chars: text.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}