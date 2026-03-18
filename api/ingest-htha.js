export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var DOC_ID = "doc-1773802120405-HTHA-WorkingDraft-v4-Final--3-.docx";

  var dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation"
  };

  if (req.method === "GET") {
    try {
      // Get the document record to check for raw_text
      var docResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(DOC_ID) + "&select=raw_text,chunk_count,status", {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
      });
      var docs = await docResp.json();
      if (!docs || !docs.length) return res.status(404).json({ error: "Document record not found", id: DOC_ID });
      
      var doc = docs[0];
      if (doc.chunk_count > 0) return res.status(200).json({ message: "Already chunked", chunks: doc.chunk_count, status: doc.status });
      
      if (!doc.raw_text || doc.raw_text.trim().length === 0) {
        return res.status(400).json({ 
          error: "No raw_text found on document record. Please upload the document text first by making a POST request with the 'text' field containing the document content." 
        });
      }
      
      // Chunk the raw_text
      var text = doc.raw_text;
      var chunkSize = 4000;
      var chunks = [];
      for (var i = 0; i < text.length; i += chunkSize) {
        chunks.push({ 
          document_id: DOC_ID, 
          chunk_index: chunks.length, 
          filename: "HTHA_WorkingDraft_v4_Final.docx", 
          chunk_text: text.slice(i, i + chunkSize) 
        });
      }
      
      // Insert chunks
      var insertResp = await fetch(SUPABASE_URL + "/rest/v1/knowledge_chunks", { 
        method: "POST", 
        headers: dbHeaders, 
        body: JSON.stringify(chunks) 
      });
      if (!insertResp.ok) return res.status(500).json({ error: "Chunk insert failed: " + await insertResp.text() });
      
      // Update document status
      await fetch(SUPABASE_URL + "/rest/v1/knowledge_documents?id=eq." + encodeURIComponent(DOC_ID), {
        method: "PATCH", 
        headers: dbHeaders, 
        body: JSON.stringify({ chunk_count: chunks.length, char_count: text.length, status: "chunked" })
      });
      
      return res.status(200).json({ success: true, chunks: chunks.length, chars: text.length });
      
    } catch(e) { 
      return res.status(500).json({ error: e.message }); 
    }
  }

  return res.status(200).json({ message: "GET to chunk document from stored raw_text", doc_id: DOC_ID });
}