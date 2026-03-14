export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { ids } = req.body || {};
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids array required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

  let deleted = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/knowledge_documents?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers });
      if (r.ok) deleted++;
      else errors.push(id + ': ' + r.status);
    } catch(e) { errors.push(id + ': ' + e.message); }
  }
  return res.status(200).json({ deleted, errors, total: ids.length });
}