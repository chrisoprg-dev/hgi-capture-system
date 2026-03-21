export const config = { maxDuration: 30 };
var AK = process.env.ANTHROPIC_API_KEY;
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var out = {};
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 20, messages: [{ role: 'user', content: 'Say OK' }] })
    });
    out.status = r.status;
    out.headers = Object.fromEntries([...r.headers.entries()].filter(function(h) { return h[0].includes('rate') || h[0].includes('retry') || h[0].includes('limit') || h[0].includes('credit') || h[0].includes('x-'); }));
    out.body = await r.text();
  } catch(e) { out.error = e.message; }
  try { await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ id: 'apicheck-' + Date.now(), source: 'api_check', status: (out.status||'err') + ' | ' + (out.body||'').slice(0,500), run_at: new Date().toISOString(), opportunities_found: 0 }) }); } catch(e) {}
  return res.status(200).json(out);
}