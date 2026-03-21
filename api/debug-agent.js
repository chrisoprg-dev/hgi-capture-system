export const config = { maxDuration: 120 };
var AK = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = { started: new Date().toISOString() };

  // Test 1: Basic Claude call (no web)
  try {
    var r1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 100, messages: [{ role: 'user', content: 'Say hello in exactly 10 words.' }] })
    });
    var d1 = await r1.json();
    results.basic_call = { status: r1.status, response: d1 };
  } catch(e) { results.basic_call = { error: e.message }; }

  // Test 2: Web search call
  try {
    var r2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: 'What is the current population of Baton Rouge Louisiana?' }] })
    });
    var d2 = await r2.json();
    results.web_search = { status: r2.status, content_types: (d2.content||[]).map(function(b){return b.type;}), text: (d2.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('').slice(0,500) };
  } catch(e) { results.web_search = { error: e.message }; }

  results.api_key_present = !!AK;
  results.api_key_prefix = AK ? AK.slice(0,10) + '...' : 'MISSING';
  results.completed = new Date().toISOString();
  return res.status(200).json(results);
}