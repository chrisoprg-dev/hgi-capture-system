export const config = { maxDuration: 15 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const r = await fetch(SB + '/rest/v1/hunt_runs?source=eq.apify_batch&order=run_at.desc&limit=1&select=opportunities_found', { headers: H });
      const data = await r.json();
      const batch = (data && data.length > 0) ? (data[0].opportunities_found || 0) : 0;
      return res.status(200).json({ batch });
    } catch(e) {
      return res.status(200).json({ batch: 0 });
    }
  }

  if (req.method === 'POST') {
    const { batch, secret } = req.body || {};
    if (secret !== 'hgi-intake-2026-secure') return res.status(401).json({ error: 'Unauthorized' });
    try {
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ source: 'apify_batch', opportunities_found: batch, status: 'completed', run_at: new Date().toISOString() })
      });
      return res.status(200).json({ success: true, batch });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}