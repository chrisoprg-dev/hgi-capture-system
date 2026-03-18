export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const INTAKE_SECRET = "hgi-intake-2026-secure";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  const secret = req.headers["x-intake-secret"];
  if (secret !== INTAKE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  };

  if (req.method === "GET") {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=*&order=uploaded_at.desc`, {
        headers: dbHeaders
      });
      
      if (!response.ok) {
        throw new Error(`Database query failed: ${await response.text()}`);
      }
      
      const documents = await response.json();
      return res.status(200).json({ 
        documents, 
        count: documents.length 
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      
      // Build the document record with only valid columns
      const docRecord = {
        id: body.id || ('doc-' + Date.now() + '-' + (body.filename || 'unknown').replace(/[^a-zA-Z0-9.-]/g, '-').slice(0, 60)),
        filename: body.filename || 'unknown',
        file_type: body.file_type || null,
        document_class: body.document_class || 'other',
        vertical: body.vertical || 'general',
        status: body.status || 'uploaded',
        storage_path: body.storage_path || null,
        mime_type: body.mime_type || null,
        content_base64: body.content_base64 || null,
        raw_text: body.raw_text || null,
        chunk_count: body.chunk_count || 0,
        char_count: body.char_count || 0,
        uploaded_at: new Date().toISOString()
      };

      const response = await fetch(SUPABASE_URL + '/rest/v1/knowledge_documents', {
        method: 'POST',
        headers: {
          ...dbHeaders,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(docRecord)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error('Database insert failed: ' + errText);
      }

      const result = await response.json();
      
      // If chunks were provided, insert them too
      if (body.chunks && Array.isArray(body.chunks) && body.chunks.length > 0) {
        const chunkRecords = body.chunks.map(function(c, i) {
          return {
            document_id: docRecord.id,
            chunk_index: c.chunk_index !== undefined ? c.chunk_index : i,
            filename: docRecord.filename,
            chunk_text: c.chunk_text || c.text || ''
          };
        });
        
        const chunkResp = await fetch(SUPABASE_URL + '/rest/v1/knowledge_chunks', {
          method: 'POST',
          headers: {
            ...dbHeaders,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(chunkRecords)
        });
        
        if (!chunkResp.ok) {
          const chunkErr = await chunkResp.text();
          console.error('Chunk insert failed:', chunkErr);
        } else {
          // Update chunk count on the document
          await fetch(SUPABASE_URL + '/rest/v1/knowledge_documents?id=eq.' + docRecord.id, {
            method: 'PATCH',
            headers: dbHeaders,
            body: JSON.stringify({ chunk_count: chunkRecords.length, status: 'chunked' })
          });
        }
      }

      // Trigger background extraction for PDFs
      if (docRecord.file_type === 'pdf' && docRecord.storage_path) {
        // Fire and forget — don't block the response
        fetch((process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '') + '/api/extract-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-intake-secret': 'hgi-intake-2026-secure' },
          body: JSON.stringify({ doc_id: docRecord.id, storage_path: docRecord.storage_path, filename: docRecord.filename })
        }).catch(function(e) { console.error('Background extraction trigger failed:', e.message); });
      }

      return res.status(200).json({ success: true, id: docRecord.id, data: result });

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id query parameter is required" });
    }

    try {
      const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: dbHeaders
      });

      if (!deleteResponse.ok) {
        throw new Error(`Delete failed: ${await deleteResponse.text()}`);
      }

      return res.status(200).json({ success: true });

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}