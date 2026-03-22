export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
async function mem(agent, oppId, tags, obs, memType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: obs, memory_type: memType || 'analysis', created_at: new Date().toISOString() }) }); } catch(e) {}
}
async function sonnet(system, prompt, maxT) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxT || 1500, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERR_' + r.status;
    var d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}
function buildCtx(opp, oppMem) {
  var p = ['=== OPPORTUNITY ===', 'Title: ' + opp.title, 'Agency: ' + opp.agency, 'OPI: ' + opp.opi_score, 'Stage: ' + (opp.stage||''), 'Due: ' + (opp.due_date||'TBD')];
  if ((opp.capture_action||'').length > 20) p.push('\n--- WINNABILITY ---\n' + (opp.capture_action||'').slice(0,1500));
  if ((opp.scope_analysis||'').length > 100) p.push('\n--- SCOPE ---\n' + (opp.scope_analysis||'').slice(0,5000));
  if ((opp.financial_analysis||'').length > 100) p.push('\n--- FINANCIAL ---\n' + (opp.financial_analysis||'').slice(0,2500));
  if ((opp.research_brief||'').length > 100) p.push('\n--- RESEARCH ---\n' + (opp.research_brief||'').slice(0,3000));
  if ((opp.staffing_plan||'').length > 100) p.push('\n--- PROPOSAL DRAFT ---\n' + (opp.staffing_plan||'').slice(0,15000));
  if (oppMem && oppMem.length > 50) p.push('\n=== MEMORY ===\n' + oppMem.slice(0,4000));
  return p.join('\n');
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { started: new Date().toISOString(), agents: [], errors: [] };
  try {
    var oppsR = await fetch(SB + '/rest/v1/opportunities?status=eq.active&opi_score=gte.65&stage=eq.proposal&select=id,title,agency,vertical,opi_score,due_date,stage,capture_action,scope_analysis,financial_analysis,research_brief,staffing_plan&order=opi_score.desc&limit=1', { headers: H });
    var opps = await oppsR.json();
    if (!opps || !opps.length) { results.note = 'No proposal-stage opp found'; return res.status(200).json(results); }
    var memsR = await fetch(SB + '/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=40', { headers: H });
    var mems = await memsR.json();
    var opp = opps[0];
    results.opp = opp.title;
    results.draft_chars = (opp.staffing_plan||'').length;
    if ((opp.staffing_plan||'').length < 200) { results.note = 'No draft'; return res.status(200).json(results); }
    var oppMem = (mems||[]).filter(function(m) { return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||''); }).map(function(m) { return (m.observation||'').slice(0,600); }).join('\n\n');
    var ctx = buildCtx(opp, oppMem);
    results.ctx_chars = ctx.length;
    var r1 = await sonnet('HGI competitive intelligence analyst. HGI has NEVER had a direct federal contract. Cite specific firms, amounts, dates from the research brief and memory provided.', ctx + '\n\nUsing the research and memory above, extract: (1) Named competitors and threat levels (2) Comparable award amounts (3) Incumbent status (4) Red flags not in proposal', 1000);
    if (r1.length > 80 && !r1.startsWith('API_ERR') && !r1.startsWith('ERR:')) { await mem('intelligence_engine', opp.id, opp.agency+',competitive_intel', 'SONNET INTEL — '+opp.agency+':\n'+r1, 'competitive_intel'); results.agents.push({agent:'intelligence_engine',chars:r1.length}); } else { results.errors.push({agent:'intelligence_engine',response:r1.slice(0,100)}); }
    var r2 = await sonnet('Strategic capture advisor. Reference exact proposal sections, eval criteria points, competitor names.', ctx + '\n\nStrategic analysis using all context above: (1) Win strategy by eval criterion with points (2) Domain terminology check (3) ALL actions ranked by point impact', 1500);
    if (r2.length > 100 && !r2.startsWith('API_ERR') && !r2.startsWith('ERR:')) { await mem('research_analysis', opp.id, opp.agency+',strategy', 'SONNET RESEARCH — '+opp.title+':\n'+r2, 'analysis'); results.agents.push({agent:'research_analysis',chars:r2.length}); } else { results.errors.push({agent:'research_analysis',response:r2.slice(0,100)}); }
    var r3 = await sonnet('Senior BD director making bid/no-bid with real money on the line.', ctx + '\n\nBID DECISION from all context above: (1) Would this win vs CDR Maguire, Tetra Tech, IEM? (2) Score per eval criterion (3) Weaknesses costing most points (4) FINAL: PWIN X% | GO/NO-BID', 1500);
    if (r3.length > 80 && !r3.startsWith('API_ERR') && !r3.startsWith('ERR:')) { await mem('winnability_agent', opp.id, opp.agency+',winnability', 'SONNET WINNABILITY — '+opp.title+':\n'+r3, 'winnability'); results.agents.push({agent:'winnability_agent',chars:r3.length}); } else { results.errors.push({agent:'winnability_agent',response:r3.slice(0,100)}); }
    var r4 = await sonnet('Senior proposal compliance reviewer. Score like an evaluator with exact points at risk.', ctx + '\n\nCOMPLIANCE AUDIT: (1) Score each eval criterion 1-10 (2) Every unaddressed RFP requirement (3) Personnel named or TBD? (4) 3 references with contacts? (5) Exhibits complete? (6) VERDICT: score/100 | GO/NO-GO', 1500);
    if (r4.length > 80 && !r4.startsWith('API_ERR') && !r4.startsWith('ERR:')) { await mem('quality_gate', opp.id, opp.agency+',quality_gate', 'SONNET GATE — '+opp.title+':\n'+r4, 'analysis'); results.agents.push({agent:'quality_gate',chars:r4.length}); } else { results.errors.push({agent:'quality_gate',response:r4.slice(0,100)}); }
    var s1 = await sonnet('Senior capture manager and proposal writer. Identify specific edits that move evaluation points.', ctx + '\n\nIMPROVEMENTS: (1) Score each section 1-10 (2) For below 8: write improved paragraph (3) Competitive differentiation gaps (4) Single highest-point improvement', 2000);
    if (s1 && s1.length > 100 && !s1.startsWith('API_ERR') && !s1.startsWith('ERR:')) {
      var s2 = await sonnet('Prioritize by evaluation point impact only.', 'IMPROVEMENTS:\n' + s1.slice(0,3000) + '\n\nRank by point impact with text changes ready to paste.', 1500);
      var combined = 'SONNET PROPOSAL — '+opp.title+':\n\n'+s1.slice(0,4000)+'\n\n=== PRIORITIZED ===\n'+(s2||'skipped').slice(0,3000);
      await mem('proposal_agent', opp.id, opp.agency+',proposal_improvement', combined, 'pattern');
      results.agents.push({agent:'proposal_agent',chars:combined.length,steps:2});
    } else { results.errors.push({agent:'proposal_agent',response:(s1||'null').slice(0,100)}); }
  } catch(e) { results.errors.push({fatal:e.message}); }
  try { await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'hr-sonnet-'+Date.now(), source:'sonnet_work', status: results.agents.length+' agents | '+results.errors.length+' errors', run_at: new Date().toISOString(), opportunities_found: 0}) }); } catch(e) {}
  results.completed = new Date().toISOString();
  return res.status(200).json(results);
}