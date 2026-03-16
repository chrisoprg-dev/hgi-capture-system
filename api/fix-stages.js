export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fixes = [
    { id: 'manualtest-manual-htha-2026-03-04-001', stage: 'pursuing' },
    { id: 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu', stage: 'pursuing' }
  ];

  const results = [];
  for (const fix of fixes) {
    try {
      const r = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(fix.id), {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({ stage: fix.stage, last_updated: new Date().toISOString() })
      });
      results.push({ id: fix.id.slice(0, 30), status: r.ok ? 'updated to ' + fix.stage : 'failed ' + r.status });
    } catch(e) {
      results.push({ id: fix.id.slice(0, 30), error: e.message });
    }
  }

  return res.status(200).json({ success: true, fixes: results, ran_at: new Date().toISOString() });
}