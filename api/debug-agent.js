export const config = { maxDuration: 60 };
var AK = process.env.ANTHROPIC_API_KEY;
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = { started: new Date().toISOString(), api_key_present: !!AK };
  try {
    var r1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 50, messages: [{ role: 'user', content: 'Reply with exactly: HELLO_WORKING' }] })
    });
    results.basic_status = r1.status;
    var d1 = await r1.json();
    results.basic_response = JSON.stringify(d1).slice(0,500);
  } catch(e) { results.basic_error = e.message; }
  try {
    var r2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: 'What day is it today?' }] })
    });
    results.web_status = r2.status;
    var d2 = await r2.json();
    results.web_response = JSON.stringify(d2).slice(0,500);
  } catch(e) { results.web_error = e.message; }
  results.completed = new Date().toISOString();
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: H, body: JSON.stringify({ id: 'debug-' + Date.now(), source: 'debug_agent', status: JSON.stringify(results).slice(0,2000), run_at: new Date().toISOString(), opportunities_found: 0 }) });
  } catch(e) {}
  return res.status(200).json(results);
}