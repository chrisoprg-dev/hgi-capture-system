export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };
  var DOC_ID = "doc-1773802120405-HTHA-WorkingDraft-v4-Final--3-.docx";
  var FILENAME = "HTHA_WorkingDraft_v4_Final.docx";

  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send('<!DOCTYPE html><html><head><title>HTHA Ingest</title></head><body style="background:#0A0A0A;color:#E8E0D0;font-family:monospace;padding:40px;max-width:700px;margin:0 auto"><h2 style="color:#C9A84C">HTHA Proposal Ingest</h2><p style="color:#888;font-size:12px">Paste the full extracted proposal text below and click Ingest.</p><textarea id="t" rows="12" style="width:100%;background:#1C1910;color:#E8E0D0;border:1px solid #2C2618;padding:12px;font-family:monospace;font-size:11px" placeholder="Paste proposal text here..."></textarea><br><br><button onclick="go()" id="btn" style="padding:14px 28px;background:#C9A84C;color:#000;border:none;cursor:pointer;font-size:14px;font-family:monospace;font-weight:bold">Ingest into KB</button><div id="s" style="margin-top:16px;padding:12px;font-size:12px"></div><script>async function go(){var t=document.getElementById("t").value;if(!t||t.length<100){document.getElementById("s").innerHTML="<span style=color:#C0392B>Paste the proposal text first</span>";return;}document.getElementById("btn").disabled=true;document.getElementById("s").innerHTML="<span style=color:#C9A84C>Uploading "+t.length.toLocaleString()+" chars...</span>";try{var r=await fetch("/api/ingest-htha",{method:"POST",headers:{"Content-Type":"application/json","x-intake-secret":"hgi-intake-2026-secure"},body:JSON.stringify({doc_id:"' + DOC_ID + '",filename:"' + FILENAME + '",text:t})});var d=await r.json();if(d.success){document.getElementById("s").innerHTML="<span style=color:#27AE60>Done! "+d.chunks+" chunks ("+d.chars.toLocaleString()+" chars) inserted into KB.</span>";}else{document.getElementById("s").innerHTML="<span style=color:#C0392B>Error: "+(d.error||JSON.stringify(d))+"</span>";document.getElementById("btn").disabled=false;}}catch(e){document.getElementById("s").innerHTML="<span style=color:#C0392B>Error: "+e.message+"</span>";document.getElementById("btn").disabled=false;}}</script></body></html>');
  }

  if (req.method === "POST") {
    var secret = req.headers["x-intake-secret"];
    if (secret !== "hgi-intake-2026-secure") return res.status(401).json({ error: "Unauthorized" });

    try {
      var body = req.body || {};
      var docId = body.doc_id || DOC_ID;
      var text = body.text;
      var fname = body.filename || FILENAME;
      if (!text) return res.status(400).json({ error: "text required" });

      var chunkSize = 4000;
      var chunks = [];
      for (var i = 0; i < text.length; i += chunkSize) {
        chunks.push({ document_id: docId, chunk_index: chunks.length, filename: fname, chunk_text: text.slice(i, i + chunkSize) });
      }

      var r = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", {
        method: "POST", headers: dbHeaders, body: JSON.stringify(chunks)
      });
      if (!r.ok) { var err = await r.text(); return res.status(500).json({ error: "Chunk insert failed: " + err }); }

      await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(docId), {
        method: "PATCH", headers: dbHeaders, body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "chunked" })
      });

      return res.status(200).json({ success: true, chunks: chunks.length, chars: text.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}