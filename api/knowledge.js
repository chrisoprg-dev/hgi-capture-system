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

  // GET - Query knowledge_documents
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

  // POST - Upload file
  if (req.method === "POST") {
    const { filename, file_type, content_base64 } = req.body;

    if (!filename || !file_type || !content_base64) {
      return res.status(400).json({ error: "filename, file_type, and content_base64 are required" });
    }

    try {
      // Generate document ID and storage path
      const docId = `doc-${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
      const storagePath = `${docId}/${filename}`;

      // Upload to Supabase Storage
      const fileBuffer = Buffer.from(content_base64, 'base64');
      const mimeType = file_type === 'pdf' ? 'application/pdf' :
                      file_type === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                      file_type === 'txt' ? 'text/plain' : 'application/octet-stream';

      const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/knowledge-docs/${storagePath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: fileBuffer
      });

      if (!storageResponse.ok) {
        throw new Error(`Storage upload failed: ${await storageResponse.text()}`);
      }

      // Create knowledge_documents record
      const documentRecord = {
        id: docId,
        filename,
        file_type,
        mime_type: mimeType,
        storage_path: storagePath,
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
        document_class: 'other',
        vertical: 'general',
        chunk_count: 0,
        char_count: 0
      };

      const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify(documentRecord)
      });

      if (!dbResponse.ok) {
        throw new Error(`Database insert failed: ${await dbResponse.text()}`);
      }

      return res.status(200).json({
        success: true,
        document_id: docId,
        storage_path: storagePath
      });

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE - Delete document by id
  if (req.method === "DELETE") {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id query parameter is required" });
    }

    try {
      // Get document to find storage path
      const getResponse = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?id=eq.${encodeURIComponent(id)}&select=storage_path`, {
        headers: dbHeaders
      });

      if (getResponse.ok) {
        const docs = await getResponse.json();
        if (docs.length > 0 && docs[0].storage_path) {
          // Delete from storage
          await fetch(`${SUPABASE_URL}/storage/v1/object/knowledge-docs/${encodeURIComponent(docs[0].storage_path)}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });
        }
      }

      // Delete chunks
      await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?document_id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: dbHeaders
      });

      // Delete document record
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