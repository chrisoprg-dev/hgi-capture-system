export const config = { maxDuration: 15 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

// Separate Supabase key-value table for the batch counter
// We use hunt_runs with source='batch_counter' and a notes field to store the number

async function getBatchCounter() {
  const r = await fetch(SB + '/rest/v1/hunt_runs?source=eq.batch_counter&order=run_at.desc&limit=1&select=notes', { headers: H });
  const data = await r.json();
  if (data && data.length > 0 && data[0].notes) {
    const n = parseInt(data[0].notes);
    if (!isNaN(n)) return n;
  }
  return 0;
}

async function setBatchCounter(batch) {
  await fetch(SB + '/rest/v1/hunt_runs', {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ source: 'batch_counter', status: 'counter', notes: String(batch), run_at: new Date().toISOString() })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      // Return the current batch number for the scraper
      const batch = await getBatchCounter();
      // Also return run stats for the dashboard
      const statsR = await fetch(SB + '/rest/v1/hunt_runs?source=eq.apify_batch&order=run_at.desc&limit=10&select=run_at,opportunities_found,scanned,submitted,net_new,status', { headers: H });
      const statsData = await statsR.json();
      const latest = (statsData && statsData.length > 0) ? statsData[0] : {};
      const lifetime_scanned = statsData.reduce((sum, r) => sum + (r.scanned || r.opportunities_found || 0), 0);
      const lifetime_net_new = statsData.reduce((sum, r) => sum + (r.net_new || r.opportunities_new || 0), 0);
      return res.status(200).json({
        batch,
        last_run_at: latest.run_at || null,
        last_scanned: latest.scanned || latest.opportunities_found || 0,
        last_submitted: latest.submitted || 0,
        last_net_new: latest.net_new || 0,
        lifetime_scanned,
        lifetime_net_new,
        recent_runs: statsData.slice(0, 5)
      });
    } catch(e) {
      return res.status(200).json({ batch: 0, error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { batch, scanned, submitted, net_new, secret } = req.body || {};
    if (secret !== 'hgi-intake-2026-secure') return res.status(401).json({ error: 'Unauthorized' });
    try {
      // If batch number provided, save it as the counter
      if (batch != null) {
        await setBatchCounter(batch);
      }
      // Always log the run, even if scanned is 0 (all duplicates is valid)
      const finalScanned = (scanned != null) ? scanned : 0;
      const finalSubmitted = (submitted != null) ? submitted : 0;
      const finalNetNew = (net_new != null) ? net_new : 0;
      try {
        await fetch(SB + '/rest/v1/hunt_runs', {
          method: 'POST',
          headers: { ...H, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            source: 'apify_batch',
            opportunities_found: finalScanned,
            opportunities_new: finalNetNew,
            status: 'completed',
            run_at: new Date().toISOString()
          })
        });
      } catch(logErr) {
        console.warn('Failed to log run stats:', logErr.message);
      }
      return res.status(200).json({ success: true, batch: batch != null ? batch : 'unchanged' });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}