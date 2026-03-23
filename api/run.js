export const config = { maxDuration: 300 };
// Internal endpoint runner — allows MCP fetch_source_page (GET only) to trigger POST endpoints
// Usage: /api/run?target=proposal-loop or /api/run?target=sonnet-work
// Only whitelisted targets allowed for safety
const WHITELIST = ['proposal-loop','sonnet-work','organism-work','organism-think','quality-gate','chat-context','generate-doc','rebuild-apify','cost-monitor','red-team'];
const BASE = 'https://hgi-capture-system.vercel.app/api/';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var target = (req.query && req.query.target) || '';
  if (!target || WHITELIST.indexOf(target) === -1) {
    return res.status(400).json({ error: 'Invalid target. Allowed: ' + WHITELIST.join(', ') });
  }
  var oppId = (req.query && req.query.opp) || '';
  try {
    var url = BASE + target;
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if ((target === 'quality-gate' || target === 'generate-doc') && oppId) {
      opts.body = JSON.stringify({ opportunity_id: oppId });
      if (target === 'generate-doc') url = url + '?opp=' + encodeURIComponent(oppId);
    } else if (target === 'rebuild-apify' && oppId) {
      url = url + '?actor=' + encodeURIComponent(oppId);
    } else if ((target === 'red-team' || target === 'proposal-loop') && oppId === 'force') {
      url = url + '?force=true';
    } else if (target === 'organism-work' || target === 'organism-think') {
      opts.body = JSON.stringify({ trigger: 'mcp_manual' });
    } else {
      opts.body = JSON.stringify({});
    }
    var r = await fetch(url, opts);
    var data = await r.json();
    return res.status(200).json({ target: target, status: r.status, result: data });
  } catch(e) {
    return res.status(200).json({ target: target, error: e.message });
  }
}