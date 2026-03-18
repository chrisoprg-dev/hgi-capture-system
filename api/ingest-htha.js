export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  const DOC_ID = "doc-1773802120405-HTHA-WorkingDraft-v4-Final--3-.docx";

  try {
    // Step 1: Find the storage path
    const docResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + DOC_ID + "&select=storage_path,filename,status", {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    const docs = await docResp.json();
    if (!docs.length) return res.status(404).json({ error: "Document not found in DB" });
    
    const doc = docs[0];
    if (!doc.storage_path) return res.status(400).json({ error: "No storage_path — file not in Supabase Storage", doc });

    // Step 2: Download the file from Supabase Storage
    const fileUrl = SUPABASE_URL + "/storage/v1/object/" + doc.storage_path;
    const fileResp = await fetch(fileUrl, {
      headers: { "Authorization": "Bearer " + SUPABASE_KEY }
    });
    if (!fileResp.ok) return res.status(500).json({ error: "Failed to download from storage: " + fileResp.status });
    
    const fileBuffer = await fileResp.arrayBuffer();
    const base64 = Buffer.from(fileBuffer).toString("base64");

    // Step 3: Send to Claude for text extraction
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: "You are a document extraction assistant. Extract ALL text content from this document. Return ONLY the extracted text, preserving structure and formatting. Do not add commentary.",
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: base64 } },
            { type: "text", text: "Extract all text from this document. Return the complete text content only." }
          ]
        }]
      })
    });

    if (!claudeResp.ok) {
      const err = await claudeResp.text();
      return res.status(500).json({ error: "Claude extraction failed: " + err });
    }

    const claudeData = await claudeResp.json();
    const extractedText = claudeData.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("");

    if (!extractedText || extractedText.length < 100) {
      return res.status(500).json({ error: "Extraction returned too little text", length: extractedText.length });
    }

    // Step 4: Chunk the text
    var chunkSize = 4000;
    var chunks = [];
    for (var i = 0; i < extractedText.length; i += chunkSize) {
      chunks.push({
        document_id: DOC_ID,
        chunk_index: chunks.length,
        filename: doc.filename,
        chunk_text: extractedText.slice(i, i + chunkSize)
      });
    }

    // Step 5: Insert chunks
    var chunkResp2 = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify(chunks)
    });

    if (!chunkResp2.ok) {
      var chunkErr = await chunkResp2.text();
      return res.status(500).json({ error: "Chunk insert failed: " + chunkErr });
    }

    // Step 6: Update document record
    await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + DOC_ID, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({ chunk_count: chunks.length, char_count: extractedText.length, status: "chunked" })
    });

    return res.status(200).json({
      success: true,
      message: "HTHA proposal extracted and chunked",
      chunks_inserted: chunks.length,
      char_count: extractedText.length,
      preview: extractedText.slice(0, 500)
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}