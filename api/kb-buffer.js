export const config = { maxDuration: 60 };
var textBuffer = "";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  var secret = req.headers["x-intake-secret"];
  if (secret !== "hgi-intake-2026-secure") return res.status(401).json({ error: "Unauthorized" });

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var dbHeaders = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Prefer": "return=representation" };

  if (req.method === "GET") {
    return res.status(200).json({ buffer_length: textBuffer.length, preview: textBuffer.slice(0, 200) });
  }

  if (req.method === "POST") {
    var body = req.body || {};

    if (body.action === "append") {
      textBuffer += (body.text || "");
      return res.status(200).json({ success: true, buffer_length: textBuffer.length });
    }

    if (body.action === "reset") {
      textBuffer = "";
      return res.status(200).json({ success: true, buffer_length: 0 });
    }

    if (body.action === "store") {
      if (textBuffer.length < 100) {
        return res.status(400).json({ error: "Buffer too small to store" });
      }

      try {
        var chunks = [];
        var chunkSize = 2000;
        for (var i = 0; i < textBuffer.length; i += chunkSize) {
          chunks.push(textBuffer.slice(i, i + chunkSize));
        }

        var insertPromises = chunks.map(async (chunk, index) => {
          var response = await fetch(SUPABASE_URL + "/rest/v1/kb", {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              content: chunk,
              source: body.source || "kb-buffer",
              metadata: { chunk_index: index, total_chunks: chunks.length }
            })
          });
          return response.json();
        });

        await Promise.all(insertPromises);
        
        var storedLength = textBuffer.length;
        textBuffer = "";
        
        return res.status(200).json({ 
          success: true, 
          stored_length: storedLength,
          chunks_created: chunks.length
        });
      } catch (error) {
        return res.status(500).json({ error: "Failed to store to KB" });
      }
    }

    return res.status(400).json({ error: "Invalid action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}