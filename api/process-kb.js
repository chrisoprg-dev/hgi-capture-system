export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  var BUCKET = "knowledge-docs";

  var dbH = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };

  // Find one document that needs processing
  var findResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?chunk_count=lt.2&storage_path=not.is.null&order=uploaded_at.desc&limit=1&select=id,filename,storage_path,mime_type,file_type,status", {
    headers: dbH
  });
  var docs = await findResp.json();

  if (!docs || !docs.length) {
    return res.status(200).json({ message: "No documents pending processing" });
  }

  var doc = docs[0];

  // Mark as processing
  await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(doc.id), {
    method: "PATCH", headers: dbH, body: JSON.stringify({ status: "processing", summary: "Extracting text..." })
  });

  try {
    if (!doc.storage_path) throw new Error("No storage_path");

    // Download from storage
    var fileResp = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + doc.storage_path, {
      headers: { "Authorization": "Bearer " + SUPABASE_KEY }
    });
    if (!fileResp.ok) throw new Error("Storage download failed: " + fileResp.status);

    var buf = await fileResp.arrayBuffer();
    var b64 = Buffer.from(buf).toString("base64");
    var isPdf = (doc.mime_type || "").includes("pdf") || (doc.filename || "").endsWith(".pdf");
    var isTxt = (doc.file_type === "txt" || doc.file_type === "md");

    var rawText = "";

    if (isTxt) {
      rawText = Buffer.from(b64, "base64").toString("utf-8");
    } else if (isPdf) {
      // Send to Claude Haiku for extraction
      var cResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8000,
          messages: [{ role: "user", content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
            { type: "text", text: "Extract ALL text from this PDF. Preserve structure. Return plain text only, no commentary." }
          ]}]
        })
      });
      if (!cResp.ok) throw new Error("Claude failed: " + await cResp.text());
      var cData = await cResp.json();
      rawText = cData.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
    } else {
      throw new Error("Unsupported file type: " + (doc.mime_type || doc.file_type));
    }

    if (!rawText || rawText.length < 50) throw new Error("Extraction too short: " + (rawText ? rawText.length : 0));

    rawText = rawText.slice(0, 200000);

    // Classify via Haiku
    var classResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: "Return ONLY valid JSON. No markdown. No backticks.",
        messages: [{ role: "user", content: "Classify this HGI document. Return JSON: {\"document_class\":\"winning_proposal|rfp|capabilities_statement|corporate_profile|contract|past_performance|other\",\"vertical\":\"disaster|tpa|appeals|workforce|construction|federal|general\",\"client\":\"\",\"summary\":\"3 sentence summary\"}\nFilename: " + doc.filename + "\nContent: " + rawText.slice(0, 4000) }]
      })
    });
    var classData = await classResp.json();
    var classText = classData.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
    var classification = { document_class: "other", vertical: "general", client: "", summary: "" };
    try {
      var clean = classText.replace(/```json|```/g, "").trim();
      classification = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
    } catch(e) {}

    // Delete old chunks
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks?document_id=eq." + encodeURIComponent(doc.id), {
      method: "DELETE", headers: dbH
    });

    // Chunk and insert
    var chunks = [];
    for (var i = 0; i < rawText.length; i += 1500) {
      var end = Math.min(i + 1500, rawText.length);
      chunks.push({
        id: doc.id + "-chunk-" + chunks.length,
        document_id: doc.id,
        chunk_index: chunks.length,
        chunk_text: rawText.slice(i, end),
        char_start: i,
        char_end: end,
        vertical: classification.vertical || "general",
        document_class: classification.document_class || "other",
        filename: doc.filename
      });
    }

    // Insert in batches of 20
    for (var j = 0; j < chunks.length; j += 20) {
      var batch = chunks.slice(j, j + 20);
      await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", {
        method: "POST",
        headers: { ...dbH, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(batch)
      });
    }

    // Update document record
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(doc.id), {
      method: "PATCH", headers: dbH,
      body: JSON.stringify({
        document_class: classification.document_class || "other",
        vertical: classification.vertical || "general",
        client: classification.client || "",
        summary: classification.summary || "",
        chunk_count: chunks.length,
        char_count: rawText.length,
        processed_at: new Date().toISOString(),
        status: "processed"
      })
    });

    return res.status(200).json({ success: true, id: doc.id, filename: doc.filename, chunks: chunks.length, chars: rawText.length, classification: classification });

  } catch(e) {
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(doc.id), {
      method: "PATCH", headers: dbH,
      body: JSON.stringify({ status: "error", summary: "Processing failed: " + e.message })
    });
    return res.status(500).json({ error: e.message, id: doc.id, filename: doc.filename });
  }
}