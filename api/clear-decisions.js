export const config = { maxDuration: 30 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(SB + '/rest/v1/organism_memory?memory_type=eq.decision_point', { method: 'DELETE', headers: H });
    const r2 = await fetch(SB + '/rest/v1/organism_memory?memory_type=eq.decision_point&select=id', { headers: H });
    const remaining = await r2.json();
    return res.status(200).json({ cleared: true, delete_status: r.status, remaining: remaining.length });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}