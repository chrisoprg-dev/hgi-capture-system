export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin.includes('claude.ai')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { ids } = req.body || {};
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids array required' });
  }

  try {
    let deletedCount = 0;
    
    for (const id of ids) {
      const deleteUrl = `${process.env.SUPABASE_URL}/rest/v1/knowledge_documents?id=eq.${id}`;
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        deletedCount++;
      }
    }
    
    return res.status(200).json({ deleted: deletedCount });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}