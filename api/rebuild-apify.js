export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var APIFY_TOKEN = process.env.APIFY_API_TOKEN;
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_API_TOKEN not set' });
  var actors = { 'central-bidding': 'Qfb4C0KiRbnsuv6jo', 'lapac': 'hVmvojDyPeJ799Suf' };
  var target = (req.query && req.query.actor) || (req.query && req.query.opp) || '';
  if (!target || !actors[target]) return res.status(400).json({ error: 'actor param required. Options: central-bidding, lapac' });
  var actorId = actors[target];
  try {
    var buildUrl = 'https://api.apify.com/v2/acts/' + actorId + '/builds?token=' + APIFY_TOKEN;
    var r = await fetch(buildUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '0.0', useCache: false }) });
    var data = await r.json();
    if (data && data.data) return res.status(200).json({ success: true, actor: target, actorId: actorId, buildId: data.data.id || 'unknown', status: data.data.status || 'unknown', startedAt: data.data.startedAt || null });
    return res.status(200).json({ success: false, actor: target, response: data });
  } catch(e) { return res.status(500).json({ error: e.message, actor: target }); }
}