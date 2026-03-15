export default async function handler(req, res) {
  const SB = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json' };

  const r = await fetch(SB + "/rest/v1/opportunities?id=eq.manualtest-manual-htha-2026-03-04-001", {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({
      due_date: '2026-03-19',
      last_updated: new Date().toISOString()
    })
  });

  return res.status(200).json({ ok: r.ok, status: r.status });
}