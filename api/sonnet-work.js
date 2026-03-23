export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function logCost(agent, model, inTok, outTok, endpoint) {
  var p = model.indexOf('sonnet') !== -1 ? { in: 0.000003, out: 0.000015 } : { in: 0.00000025, out: 0.00000125 };
  var cost = inTok * p.in + outTok * p.out;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), source: 'api_cost', status: JSON.stringify({ agent: agent, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: endpoint || 'sonnet-work' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}
async function mem(agent, oppId, tags, obs, mType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: obs, memory_type: mType || 'analysis', created_at: new Date().toISOString() }) }); return true; } catch(e) { return false; }
}
async function sonnet(system, prompt, maxT) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxT || 1500, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERR_' + r.status;
    var d = await r.json();
    if (d.usage) logCost('sonnet_work', 'claude-sonnet-4-20250514', d.usage.input_tokens||0, d.usage.output_tokens||0, 'sonnet-work');
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), agents: [], errors: [] };
  try {
    var opps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&select=id,title,agency,opi_score,scope_analysis,financial_analysis,research_brief,staffing_plan,capture_action&order=opi_score.desc&limit=2', { headers: H })).json();
    if (!opps || !opps.length) return res.status(200).json({ note: 'No active proposal/pursuing opps' });
    // Process highest-priority opp that has a draft
    var opp = null;
    for (var oi = 0; oi < opps.length; oi++) { if ((opps[oi].staffing_plan||'').length >= 200) { opp = opps[oi]; break; } }
    if (!opp) return res.status(200).json({ note: 'No opp with draft', opps: opps.map(function(o){return o.title;}) });
    R.opp = opp.title;
    R.draft = (opp.staffing_plan||'').length;
    var ctx = '=== ' + opp.title + ' | ' + opp.agency + ' | OPI ' + opp.opi_score + ' ===\n' + (opp.scope_analysis||'').slice(0,4000) + '\n---\n' + (opp.staffing_plan||'').slice(0,12000) + '\n---\n' + (opp.capture_action||'').slice(0,1000) + '\n---\n' + (opp.financial_analysis||'').slice(0,1500);
    R.ctx = ctx.length;
    var g = await sonnet('Senior proposal compliance reviewer. Score like a real evaluator — specific sections, specific points at risk, specific gaps. Your first line MUST be: VERDICT: [score]/100 | [GO or NO-GO]', ctx + '\n\nSCORE EACH CRITERION 1-10. List ALL gaps. First line MUST be: VERDICT: XX/100 | GO or NO-GO', 1500);
    var gateVerdict = 'unknown';
    if (g.length > 80 && !g.startsWith('API_ERR') && !g.startsWith('ERR:')) {
      await mem('quality_gate', opp.id, opp.agency+',quality_gate', 'SONNET GATE:\n'+g, 'analysis');
      R.agents.push({a:'quality_gate',c:g.length});
      if (g.toUpperCase().indexOf('NO-GO') !== -1) gateVerdict = 'NO-GO';
      else if (g.toUpperCase().indexOf('| GO') !== -1) gateVerdict = 'GO';
    } else { R.errors.push({a:'gate',r:g.slice(0,200)}); }
    R.gate_verdict = gateVerdict;
    var w = await sonnet('Senior BD director. Bid/no-bid with real money on the line. Quality gate verdict: ' + gateVerdict + '. Factor this into your assessment.', ctx + '\n\nQUALITY GATE SAYS: ' + gateVerdict + '\n\nWould this beat CDR Maguire and Tetra Tech? Score per criterion. PWIN X% | GO/NO-BID. All actions ranked by impact.', 1500);
    if (w.length > 80 && !w.startsWith('API_ERR') && !w.startsWith('ERR:')) { await mem('winnability_agent', opp.id, opp.agency+',winnability', 'SONNET WIN (gate='+gateVerdict+'):\n'+w, 'winnability'); R.agents.push({a:'winnability',c:w.length}); } else { R.errors.push({a:'win',r:w.slice(0,200)}); }
    if (gateVerdict === 'NO-GO') {
      R.agents.push({a:'proposal',c:0,skipped:'gate_NO-GO'});
      await mem('proposal_agent', opp.id, opp.agency+',proposal', 'PROPOSAL BLOCKED BY GATE (NO-GO). Fix deficiencies before investing in proposal improvements. Gate output:\n'+g.slice(0,2000), 'analysis');
    } else {
      var p = await sonnet('Senior proposal writer. Write actual improved text, not descriptions. Quality gate findings: ' + g.slice(0,500), ctx + '\n\nGATE FINDINGS (address these first):\n' + g.slice(0,1000) + '\n\nScore each section 1-10. For below 8: write the improved paragraph. Single highest-point improvement first.', 2000);
      if (p.length > 100 && !p.startsWith('API_ERR') && !p.startsWith('ERR:')) { await mem('proposal_agent', opp.id, opp.agency+',proposal', 'SONNET PROPOSAL (gate='+gateVerdict+'):\n'+p, 'pattern'); R.agents.push({a:'proposal',c:p.length}); } else { R.errors.push({a:'prop',r:(p||'').slice(0,200)}); }
    }
  } catch(e) { R.errors.push({fatal:e.message}); }
  try { await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'hr-sonnet-'+Date.now(), source:'sonnet_work', status: R.agents.length+'/3 agents | '+R.errors.length+' errors', run_at: new Date().toISOString(), opportunities_found: 0}) }); } catch(e) {}
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}