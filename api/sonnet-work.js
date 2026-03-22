export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
async function storeMemory(agent, oppId, tags, obs, memType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: obs, memory_type: memType || 'analysis', created_at: new Date().toISOString() }) }); } catch(e) {}
}
async function webSearch(query) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Intelligence analyst. Specific verified findings with sources. Concise.', messages: [{ role: 'user', content: query }] }) });
    if (!r.ok) return '';
    var d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}
async function sonnet(system, prompt, maxT) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxT || 1500, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERR_' + r.status;
    var d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}
function buildCtx(opp, mem) {
  var p = ['=== OPPORTUNITY ===', 'Title: ' + opp.title, 'Agency: ' + opp.agency, 'OPI: ' + opp.opi_score, 'Stage: ' + (opp.stage||''), 'Due: ' + (opp.due_date||'TBD')];
  if ((opp.capture_action||'').length > 20) p.push('\n--- WINNABILITY ---\n' + (opp.capture_action||'').slice(0,1500));
  if ((opp.scope_analysis||'').length > 100) p.push('\n--- SCOPE ---\n' + (opp.scope_analysis||'').slice(0,5000));
  if ((opp.financial_analysis||'').length > 100) p.push('\n--- FINANCIAL ---\n' + (opp.financial_analysis||'').slice(0,2500));
  if ((opp.research_brief||'').length > 100) p.push('\n--- RESEARCH ---\n' + (opp.research_brief||'').slice(0,3000));
  if ((opp.staffing_plan||'').length > 100) p.push('\n--- PROPOSAL DRAFT ---\n' + (opp.staffing_plan||'').slice(0,15000));
  if (mem && mem.length > 50) p.push('\n=== MEMORY ===\n' + mem.slice(0,4000));
  return p.join('\n');
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { started: new Date().toISOString(), agents: [], errors: [] };
  try {
    var oppsR = await fetch(SB + '/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.65&stage=in.(proposal,pursuing)&select=id,title,agency,vertical,opi_score,due_date,stage,capture_action,scope_analysis,financial_analysis,research_brief,staffing_plan&order=opi_score.desc&limit=1', { headers: H });
    var opps = await oppsR.json();
    var memsR = await fetch(SB + '/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=40', { headers: H });
    var mems = await memsR.json();
    results.opps = opps.length;
    results.mems = (mems||[]).length;
    var idx = 0;
    while (idx < opps.length) {
      var opp = opps[idx];
      idx = idx + 1;
      if ((opp.staffing_plan||'').length < 200) continue;
      var oppMem = (mems||[]).filter(function(m) { return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||''); }).map(function(m) { return (m.observation||'').slice(0,600); }).join('\n\n');
      var ctx = buildCtx(opp, oppMem);
      results.ctx_chars = ctx.length;
      // AGENT 1: Intelligence
      var web1 = await webSearch('Louisiana government contracts awarded ' + opp.agency + ' disaster recovery professional services 2024 2025 competitor');
      var r1 = await sonnet('HGI competitive intelligence analyst. HGI has NEVER had a direct federal contract. Cite specific firms, amounts, dates.', ctx + (web1.length > 30 ? '\nWEB:\n' + web1.slice(0,2000) : '') + '\n\nExtract: (1) Named competitors (2) Comparable awards with amounts (3) Incumbent if any (4) Procurement patterns (5) Red flags not in proposal', 1000);
      if (r1.length > 80) { await storeMemory('intelligence_engine', opp.id, opp.agency+',competitive_intel', 'INTEL — '+opp.agency+':\n'+r1, 'competitive_intel'); results.agents.push({agent:'intelligence_engine',opp:opp.title,chars:r1.length}); }
      // AGENT 2: Research
      var web2 = await webSearch(opp.agency + ' ' + (opp.vertical||'disaster recovery') + ' best practices winning proposal strategies evaluation criteria 2025 2026');
      var r2 = await sonnet('Strategic capture advisor. Reference exact proposal sections, eval criteria points, competitor names.', ctx + (web2.length > 30 ? '\nWEB:\n' + web2.slice(0,1500) : '') + '\n\nAnalyze: (1) Win strategy by eval criterion with point values (2) Domain terminology check (3) Agency-specific intel (4) ALL actions ranked by point impact', 2000);
      if (r2.length > 100) { await storeMemory('research_analysis', opp.id, opp.agency+',strategy', 'RESEARCH — '+opp.title+':\n'+r2, 'analysis'); results.agents.push({agent:'research_analysis',opp:opp.title,chars:r2.length}); }
      // AGENT 3: Winnability
      var web3 = await webSearch(opp.agency + ' contract award protest incumbent Louisiana 2024 2025 2026');
      var r3 = await sonnet('Senior BD director making bid/no-bid with real money on the line.', ctx + (web3.length > 30 ? '\nWEB:\n' + web3.slice(0,1200) : '') + '\n\nBID DECISION: (1) Would this win vs CDR Maguire, Tetra Tech, IEM? (2) Score per eval criterion vs competitors (3) Weaknesses costing most points (4) FINAL: PWIN X% | GO/NO-BID | all actions ranked by impact', 1500);
      if (r3.length > 80) { await storeMemory('winnability_agent', opp.id, opp.agency+',winnability', 'WINNABILITY — '+opp.title+':\n'+r3, 'winnability'); results.agents.push({agent:'winnability_agent',opp:opp.title,chars:r3.length}); }
      // AGENT 4: Quality Gate
      var r4 = await sonnet('Senior proposal compliance reviewer. Score like an evaluator — ruthlessly, specifically, with exact points at risk.', ctx + '\n\nCOMPLIANCE AUDIT: (1) Score each eval criterion 1-10 (2) Every unaddressed RFP requirement (3) Personnel — named or TBD? (4) 3 references with contacts? (5) Exhibits complete? (6) VERDICT: score/100 | GO/NO-GO | all deficiencies ranked', 2000);
      if (r4.length > 80) { await storeMemory('quality_gate', opp.id, opp.agency+',quality_gate', 'QUALITY GATE — '+opp.title+':\n'+r4, 'analysis'); results.agents.push({agent:'quality_gate',opp:opp.title,chars:r4.length}); }
      // AGENT 5: Proposal (2-step)
      var web5 = await webSearch(opp.agency + ' ' + (opp.vertical||'disaster recovery') + ' methodology industry standards 2025 2026');
      var s1 = await sonnet('Senior capture manager and proposal writer. Identify specific edits that move evaluation points.', ctx + (web5.length > 30 ? '\nWEB:\n' + web5.slice(0,2000) : '') + '\n\nIMPROVEMENT ANALYSIS: (1) Score each section 1-10 (2) For sections below 8: write improved paragraph (3) Domain terminology upgrades (4) Competitive differentiation gaps (5) Single highest-point improvement', 2500);
      if (s1 && s1.length > 100) {
        var s2 = await sonnet('Prioritize by evaluation point impact only.', 'IMPROVEMENTS:\n' + s1.slice(0,3000) + '\n\nRank every improvement by point impact. For each: criterion, points, effort, confidence. ALL actions with text changes ready to paste.', 1500);
        var combined = 'PROPOSAL IMPROVEMENT — '+opp.title+':\n\n=== ANALYSIS ===\n'+s1.slice(0,4000)+'\n\n=== PRIORITIZED ===\n'+(s2||'skipped').slice(0,3000);
        await storeMemory('proposal_agent', opp.id, opp.agency+',proposal_improvement', combined, 'pattern');
        results.agents.push({agent:'proposal_agent',opp:opp.title,chars:combined.length,steps:2});
      }
    }
  } catch(e) { results.errors.push(e.message); }
  try { await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'hr-sonnet-'+Date.now(), source:'sonnet_work', status: results.agents.length+' agents | '+results.errors.length+' errors', run_at: new Date().toISOString(), opportunities_found: 0}) }); } catch(e) {}
  results.completed = new Date().toISOString();
  return res.status(200).json(results);
}