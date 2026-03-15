export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SB = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;

  const r = await fetch(SB + '/rest/v1/opportunities?id=eq.manualtest-manual-htha-2026-03-04-001', {
    method: 'PATCH',
    headers: {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      due_date: '2026-03-19',
      state: 'LA',
      urgency: 'IMMEDIATE',
      last_updated: new Date().toISOString()
    })
  });

  const data = await r.json();
  return res.status(200).json({ status: r.status, ok: r.ok, data });
}