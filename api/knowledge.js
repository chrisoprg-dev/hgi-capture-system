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
    if (req.query.test === "1") {
      return res.status(200).json({ status: "ok", message: "knowledge API is reachable" });
    }
    
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

  // POST - Create new document record
  if (req.method === "POST") {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        throw new Error(`Database insert failed: ${await response.text()}`);
      }

      const result = await response.json();
      return res.status(200).json({ success: true, data: result });

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