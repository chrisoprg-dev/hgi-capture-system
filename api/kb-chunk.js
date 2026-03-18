export const config = { maxDuration: 30 };

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
  var dbH = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Prefer": "return=representation" };

  try {
    var b = req.body || {};
    if (!b.doc_id || !b.text) return res.status(400).json({ error: "need doc_id and text" });
    var chunks = [];
    for (var i = 0; i < b.text.length; i += 4000) {
      chunks.push({ document_id: b.doc_id, chunk_index: chunks.length, filename: b.filename || "doc", chunk_text: b.text.slice(i, i + 4000) });
    }
    var r = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", { method: "POST", headers: dbH, body: JSON.stringify(chunks) });
    if (!r.ok) return res.status(500).json({ error: await r.text() });
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(b.doc_id), {
      method: "PATCH", headers: dbH, body: JSON.stringify({ chunk_count: chunks.length, char_count: b.text.length, status: "chunked" })
    });
    return res.status(200).json({ ok: true, chunks: chunks.length, chars: b.text.length });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}