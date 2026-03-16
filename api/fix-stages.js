export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).json({ info: 'POST to run stage fixes' });

  const fixes = [
    {
      id: 'manualtest-manual-htha-2026-03-04-001',
      updates: { stage: 'pursuing', last_updated: new Date().toISOString() }
    },
    {
      id: 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu',
      updates: { stage: 'pursuing', last_updated: new Date().toISOString() }
    }
  ];

  const results = [];
  for (const fix of fixes) {
    try {
      const r = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(fix.id), {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify(fix.updates)
      });
      results.push({ id: fix.id, status: r.ok ? 'updated' : 'failed', code: r.status });
    } catch(e) {
      results.push({ id: fix.id, status: 'error', message: e.message });
    }
  }

  return res.status(200).json({ success: true, fixes: results, ran_at: new Date().toISOString() });
}