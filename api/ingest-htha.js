export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const secret = req.headers["x-intake-secret"];
  if (secret !== "hgi-intake-2026-secure") return res.status(401).json({ error: "Unauthorized" });

  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  try {
    const { doc_id, text, chunk_size } = req.body;
    if (!doc_id || !text) return res.status(400).json({ error: "doc_id and text required" });

    const size = chunk_size || 4000;
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push({
        document_id: doc_id,
        chunk_index: chunks.length,
        filename: "HTHA_WorkingDraft_v4_Final.docx",
        chunk_text: text.slice(i, i + size)
      });
    }

    const r = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify(chunks)
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: "Chunk insert failed: " + err });
    }

    // Update the document record
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + doc_id, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "chunked" })
    });

    return res.status(200).json({ success: true, chunks_inserted: chunks.length, char_count: text.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}