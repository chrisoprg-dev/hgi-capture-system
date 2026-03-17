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
      const r = await fetch(SB + '/rest/v1/hunt_runs?source=eq.apify_batch&order=run_at.desc&limit=10&select=run_at,opportunities_found,scanned,submitted,net_new,status', { headers: H });
      const data = await r.json();
      const latest = (data && data.length > 0) ? data[0] : {};
      // Compute lifetime totals
      const lifetime_scanned = data.reduce((sum, r) => sum + (r.scanned || r.opportunities_found || 0), 0);
      const lifetime_net_new = data.reduce((sum, r) => sum + (r.net_new || r.opportunities_new || 0), 0);
      return res.status(200).json({
        // Legacy field for backward compat
        batch: latest.scanned || latest.opportunities_found || 0,
        // New clean fields
        last_run_at: latest.run_at || null,
        last_scanned: latest.scanned || latest.opportunities_found || 0,
        last_submitted: latest.submitted || 0,
        last_net_new: latest.net_new || 0,
        lifetime_scanned,
        lifetime_net_new,
        recent_runs: data.slice(0, 5)
      });
    } catch(e) {
      return res.status(200).json({ batch: 0, error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { batch, scanned, submitted, net_new, secret } = req.body || {};
    if (secret !== 'hgi-intake-2026-secure') return res.status(401).json({ error: 'Unauthorized' });
    // Accept new fields or fall back to legacy `batch` field
    const finalScanned = scanned != null ? scanned : (batch || 0);
    const finalSubmitted = submitted != null ? submitted : (batch || 0);
    const finalNetNew = net_new != null ? net_new : 0;
    try {
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          source: 'apify_batch',
          // Legacy field kept for backward compat
          opportunities_found: finalScanned,
          opportunities_new: finalNetNew,
          // New clean fields
          scanned: finalScanned,
          submitted: finalSubmitted,
          net_new: finalNetNew,
          status: 'completed',
          run_at: new Date().toISOString()
        })
      });
      return res.status(200).json({ success: true, scanned: finalScanned, submitted: finalSubmitted, net_new: finalNetNew });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}