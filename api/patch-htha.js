export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  const SB = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  const r = await fetch(SB + "/rest/v1/opportunities?id=eq.manualtest-manual-htha-2026-03-04-001", {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({
      due_date: '2026-03-19',
      state: 'LA',
      stage: 'proposal',
      urgency: 'IMMEDIATE',
      last_updated: new Date().toISOString()
    })
  });

  const data = await r.json();
  return res.status(r.status).json({ 
    status: r.status, 
    statusText: r.statusText,
    response: data 
  });
}