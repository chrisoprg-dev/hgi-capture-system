export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SB || !KEY) {
    return res.status(500).json({ error: 'Missing env vars', hasSB: !!SB, hasKEY: !!KEY });
  }

  try {
    const url = SB + '/rest/v1/opportunities?id=eq.manualtest-manual-htha-2026-03-04-001';
    const r = await fetch(url, {
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
        stage: 'proposal',
        urgency: 'IMMEDIATE',
        last_updated: new Date().toISOString()
      })
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = text; }

    return res.status(200).json({
      supabase_status: r.status,
      supabase_ok: r.ok,
      response: data
    });
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}