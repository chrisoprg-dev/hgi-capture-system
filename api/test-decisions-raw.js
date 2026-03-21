export const config = { maxDuration: 30 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(SB + '/rest/v1/organism_memory?memory_type=eq.decision_point&order=created_at.desc&limit=5', { headers: H });
    const rows = await r.json();
    const preview = rows.map(function(row) {
      return { id: row.id, memory_type: row.memory_type, agent: row.agent, obs_length: (row.observation||'').length, obs_preview: (row.observation||'').slice(0,300) };
    });
    return res.status(200).json({ count: rows.length, status: r.status, preview: preview });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}