export const config = { maxDuration: 30 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var token = process.env.APIFY_API_TOKEN;
  if (!token) return res.json({ error: 'no_token', ts: Date.now() });
  try {
    var r = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/builds?token=' + token + '&version=0.0&useCache=false', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    var d = await r.json();
    return res.json({ ok: r.ok, status: r.status, buildId: (d.data||{}).id, buildStatus: (d.data||{}).status, ts: Date.now() });
  } catch(e) { return res.json({ error: e.message, ts: Date.now() }); }
}