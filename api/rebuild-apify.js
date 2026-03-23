export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var token = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || '';
  if (!token) return res.status(500).json({ error: 'No APIFY_API_TOKEN env var' });
  var actorId = req.query.actor || 'hVmvojDyPeJ799Suf';
  var action = req.query.action || 'build';
  try {
    if (action === 'build') {
      var r = await fetch('https://api.apify.com/v2/acts/' + actorId + '/builds?token=' + token + '&version=0.0&useCache=false', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var d = await r.json();
      return res.json({ action: 'build', ok: r.ok, status: r.status, buildId: d.data && d.data.id, buildStatus: d.data && d.data.status, tag: d.data && d.data.buildNumber });
    } else if (action === 'run') {
      var r2 = await fetch('https://api.apify.com/v2/acts/' + actorId + '/runs?token=' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var d2 = await r2.json();
      return res.json({ action: 'run', ok: r2.ok, runId: d2.data && d2.data.id, runStatus: d2.data && d2.data.status });
    } else {
      return res.status(400).json({ error: 'action must be build or run' });
    }
  } catch(e) { return res.status(500).json({ error: e.message }); }
}