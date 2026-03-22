export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

async function think(system, prompt, maxT) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxT || 1000, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERROR_' + r.status;
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'CATCH_ERROR: ' + e.message; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = { started: new Date().toISOString(), agents: [] };
  try {
    var opps = await (await fetch(SB + '/rest/v1/opportunities?stage=eq.proposal&select=id,title,agency,opi_score,scope_analysis,staffing_plan,capture_action&limit=1', { headers: H })).json();
    if (!opps || !opps.length) return res.status(200).json({ error: 'No proposal-stage opp found' });
    var opp = opps[0];
    results.opp = opp.title;
    results.draft_chars = (opp.staffing_plan||'').length;
    results.scope_chars = (opp.scope_analysis||'').length;
    var ctx = '=== OPPORTUNITY ===\nTitle: ' + opp.title + '\nAgency: ' + opp.agency + '\nOPI: ' + opp.opi_score + '\n\n--- SCOPE ---\n' + (opp.scope_analysis||'').slice(0,5000) + '\n\n--- PROPOSAL DRAFT ---\n' + (opp.staffing_plan||'').slice(0,15000) + '\n\n--- CAPTURE ACTION ---\n' + (opp.capture_action||'').slice(0,1500);
    results.ctx_chars = ctx.length;
    // Run quality_gate only as proof — single Sonnet call
    var gate = await think(
      'Senior proposal compliance reviewer. Score this proposal as an evaluator would. Reference specific sections, rates, exhibits, personnel names.',
      ctx + '\n\nScore each eval criterion 1-10. List ALL deficiencies by name. List ALL strengths. FINAL VERDICT: score out of 100.',
      1500
    );
    results.agents.push({ agent: 'quality_gate', chars: gate.length, preview: gate.slice(0, 500) });
  } catch(e) { results.error = e.message; }
  results.completed = new Date().toISOString();
  return res.status(200).json(results);
}