export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function logCost(agent, model, inTok, outTok, endpoint) {
  var p;
  if (model.indexOf('opus') !== -1) { p = { in: 0.000005, out: 0.000025 }; }
  else if (model.indexOf('sonnet') !== -1) { p = { in: 0.000003, out: 0.000015 }; }
  else { p = { in: 0.00000025, out: 0.00000125 }; }
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
    if (d.usage) logCost('sonnet_work', 'claude-sonnet-4-6', d.usage.input_tokens||0, d.usage.output_tokens||0, 'sonnet-work');
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}

// Web search using Haiku — cost-efficient, targeted
async function webSearch(query) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Government proposal research analyst. Find specific, current, actionable information for proposal writing. Cite sources. Be concise.', messages: [{ role: 'user', content: query }] }) });
    if (!r.ok) return '';
    var d = await r.json();
    if (d.usage) logCost('web_search', 'claude-haiku-4-5-20251001', d.usage.input_tokens||0, d.usage.output_tokens||0, 'sonnet-work-search');
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}

// KB query — pulls HGI institutional knowledge
async function queryKB(query) {
  try {
    var r = await fetch('https://hgi-capture-system.vercel.app/api/knowledge-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query, limit: 12 }) });
    if (!r.ok) return '';
    var d = await r.json();
    var chunks = d.results || d.chunks || [];
    return chunks.map(function(c) { return (c.content || c.text || '').slice(0, 500); }).join('\n\n');
  } catch(e) { return ''; }
}

// Opus 4.6 with extended thinking — for proposal building only
async function opusProposal(system, prompt) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 8000, thinking: { type: 'enabled', budget_tokens: 5000 }, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERR_' + r.status;
    var d = await r.json();
    if (d.usage) logCost('proposal_agent_opus', 'claude-opus-4-6', d.usage.input_tokens||0, d.usage.output_tokens||0, 'sonnet-work-opus');
    // Filter for text blocks only — thinking blocks are internal reasoning, not output
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}

async function runOpp(opp, R) {
  var oppR = { opp: opp.title, draft: (opp.staffing_plan||'').length, agents: [], errors: [] };
  // CHECKPOINT: log start immediately so we know the function ran
  await mem('sonnet_work', opp.id, 'checkpoint,start', 'SONNET-WORK STARTED: '+opp.title+' | OPI '+opp.opi_score+' | draft='+((opp.staffing_plan||'').length)+'chars | '+new Date().toISOString(), 'system_alert');
  try {
    // Load organism memory for this opp
    var mems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&memory_type=neq.decision_point&order=created_at.desc&limit=20&select=agent,observation,memory_type', { headers: H })).json();
    var memCtx = (mems||[]).map(function(m) { return '[' + m.agent + ']: ' + (m.observation||'').slice(0, 350); }).join('\n\n');
    // Gate-specific memory — full detail on competitive intel, research, winnability, red team
    var GATE_TYPES = ['competitive_intel','analysis','winnability','pattern'];
    var gateMemCtx = (mems||[]).filter(function(m) { return GATE_TYPES.indexOf(m.memory_type||'') !== -1; }).map(function(m) { return '[' + m.agent + ' | ' + (m.memory_type||'') + ']:\n' + (m.observation||'').slice(0, 600); }).join('\n\n---\n\n');

    var ctx = '=== ' + opp.title + ' | ' + opp.agency + ' | OPI ' + opp.opi_score + ' ===\n' +
      (opp.scope_analysis||'').slice(0,4000) + '\n---\n' +
      (opp.staffing_plan||'').slice(0,22000) + '\n---\n' +
      (opp.capture_action||'').slice(0,1000) + '\n---\n' +
      (opp.financial_analysis||'').slice(0,1500);
    oppR.ctx = ctx.length;

    // === RESEARCH PHASE: Live web search before agents fire ===
    var agency = opp.agency || '';
    var st = opp.state || 'Louisiana';
    var ttl = (opp.title || '').slice(0, 60);
    var r1 = await webSearch(agency + ' ' + st + ' contract award incumbent consultant ' + (opp.vertical||'') + ' 2024 2025 2026');
    var r2 = await webSearch(ttl + ' ' + agency + ' Central Bidding questions addendum amendment bidders 2026');
    var r3 = await webSearch(agency + ' ' + st + ' comparable contract value pricing hourly rate professional services');
    var liveResearch = '';
    if (r1 && r1.length > 30) liveResearch += 'LIVE INTEL — INCUMBENT/COMPETITORS:\n' + r1.slice(0,1500) + '\n\n';
    if (r2 && r2.length > 30) liveResearch += 'LIVE INTEL — PORTAL ACTIVITY:\n' + r2.slice(0,1200) + '\n\n';
    if (r3 && r3.length > 30) liveResearch += 'LIVE INTEL — PRICING BENCHMARKS:\n' + r3.slice(0,1200) + '\n\n';
    oppR.live_searches = (r1?1:0) + (r2?1:0) + (r3?1:0);
    if (liveResearch.length > 50) {
      await mem('research_phase', opp.id, agency+',verified_live,research', 'LIVE RESEARCH (sonnet-work):\n' + liveResearch.slice(0,3000), 'competitive_intel');
    }

    // === AGENT 1: QUALITY GATE (Sonnet 4.6) — MEMORY-AWARE + LIVE RESEARCH ===
    var gateResearch = (opp.research_brief||'').slice(0, 1500);
    var gateSystem = 'Senior proposal compliance reviewer with full competitive context. You have three inputs: (1) the RFP scope and eval criteria, (2) the current proposal draft, (3) competitive intelligence and research findings from prior agent analysis. Use ALL three. Score each criterion as a real evaluator would — by stated point weights — but informed by what you know about the competitive field and the specific gaps the research agents found. Do not audit in a vacuum. Your first line MUST be: VERDICT: [score]/100 | [GO or NO-GO]';
    var gatePrompt = ctx +
      (liveResearch.length > 50 ? '\n\n=== LIVE WEB RESEARCH (VERIFIED) ===\n' + liveResearch : '') +
      (gateResearch.length > 50 ? '\n\n=== COMPETITIVE RESEARCH & STRATEGIC INTEL ===\n' + gateResearch : '') +
      (gateMemCtx.length > 50 ? '\n\n=== ORGANISM MEMORY — COMPETITIVE INTEL, ANALYSIS, RED TEAM FINDINGS ===\n' + gateMemCtx : '') +
      '\n\nUsing all context above including LIVE WEB RESEARCH — RFP scope, proposal draft, competitive research, and organism memory — score each eval criterion exactly as this evaluator panel will. For each criterion: current draft score 1-10, specific gap identified by research or memory, points at risk, and what exact content would close the gap. First line MUST be: VERDICT: XX/100 | GO or NO-GO';
    var g = await sonnet(gateSystem, gatePrompt, 1500);
    var gateVerdict = 'unknown';
    if (g.length > 80 && !g.startsWith('API_ERR') && !g.startsWith('ERR:')) {
      await mem('quality_gate', opp.id, opp.agency+',quality_gate', 'SONNET GATE:\n'+g, 'analysis');
      oppR.agents.push({a:'quality_gate',c:g.length});
      if (g.toUpperCase().indexOf('NO-GO') !== -1) gateVerdict = 'NO-GO';
      else if (g.toUpperCase().indexOf('| GO') !== -1) gateVerdict = 'GO';
    } else { oppR.errors.push({a:'gate',r:g.slice(0,200)}); await mem('sonnet_work', opp.id, 'checkpoint,gate_error', 'GATE FAILED: '+g.slice(0,300), 'system_alert'); }
    oppR.gate_verdict = gateVerdict;
    await mem('sonnet_work', opp.id, 'checkpoint,gate_done', 'CHECKPOINT gate done: verdict='+gateVerdict+' | len='+g.length+' | '+new Date().toISOString(), 'system_alert');

    // === AGENT 2: WINNABILITY (Sonnet 4.6) — MEMORY-AWARE ===
    var winSystem = 'Senior BD director making a real bid/no-bid decision with full competitive context. You have: (1) the RFP scope and proposal draft, (2) the quality gate verdict and findings, (3) competitive intelligence and research from prior agent analysis — named competitors, pricing benchmarks, agency patterns, red team scores. Use ALL of it. Your PWIN must be based on real competitive findings, not generic assessment. Never say "likely competitors" when memory tells you exactly who they are.';
    var winPrompt = ctx +
      (gateResearch.length > 50 ? '\n\n=== COMPETITIVE RESEARCH & STRATEGIC INTEL ===\n' + gateResearch : '') +
      (gateMemCtx.length > 50 ? '\n\n=== ORGANISM MEMORY — COMPETITIVE INTEL, RED TEAM SCORES, ANALYSIS ===\n' + gateMemCtx : '') +
      '\n\nQUALITY GATE VERDICT: ' + gateVerdict + '\n\nGATE FINDINGS SUMMARY:\n' + g.slice(0,800) +
      '\n\nUsing all competitive context above — named competitors from memory, their strengths vs each eval criterion, gate findings, research brief, red team scores — deliver a rigorous bid decision. Score HGI vs each named competitor per eval criterion. State PWIN X% | GO/NO-BID. List every action that would raise PWIN, ranked by point impact, with the specific proposal section each action targets.';
    var w = await sonnet(winSystem, winPrompt, 1500);
    if (w.length > 80 && !w.startsWith('API_ERR') && !w.startsWith('ERR:')) { await mem('winnability_agent', opp.id, opp.agency+',winnability', 'SONNET WIN (gate='+gateVerdict+'):\n'+w, 'winnability'); oppR.agents.push({a:'winnability',c:w.length}); } else { oppR.errors.push({a:'win',r:w.slice(0,200)}); await mem('sonnet_work', opp.id, 'checkpoint,win_error', 'WINNABILITY FAILED: '+w.slice(0,300), 'system_alert'); }
    await mem('sonnet_work', opp.id, 'checkpoint,win_done', 'CHECKPOINT winnability done: len='+w.length+' | elapsed='+(Date.now()-new Date(R.started).getTime())+'ms | '+new Date().toISOString(), 'system_alert');
    // Opus proposal builder now runs separately in opus-build.js (12:20 CST)
    // It reads gate + winnability from organism_memory, gets full 300s for Opus
  } catch(e) { oppR.errors.push({fatal:e.message}); }
  return oppR;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), opps_processed: [], errors: [] };
  try {
    // Limit to 1 opp per run — each opp takes 2-4 min with Opus+web+KB.
    // Multiple opps timeout at Vercel's 300s limit. Highest OPI gets priority.
    var allOpps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&select=id,title,agency,vertical,opi_score,scope_analysis,financial_analysis,research_brief,staffing_plan,capture_action&order=opi_score.desc&limit=1', { headers: H })).json();
    if (!allOpps || !allOpps.length) return res.status(200).json({ note: 'No active proposal/pursuing opps' });
    var oppsWithDraft = allOpps.filter(function(o) { return (o.staffing_plan||'').length >= 200; });
    if (!oppsWithDraft.length) return res.status(200).json({ note: 'No opps with draft', titles: allOpps.map(function(o){return o.title;}) });
    R.total_opps = oppsWithDraft.length;
    // Sequential loop — each opp gets full gate+winnability+Opus cycle
    for (var oi = 0; oi < oppsWithDraft.length; oi++) {
      var oppResult = await runOpp(oppsWithDraft[oi], R);
      R.opps_processed.push(oppResult);
    }
  } catch(e) { R.errors.push({fatal:e.message}); }
  // Always log run result — success or failure
  try {
    var totalAgents = R.opps_processed.reduce(function(s,o){ return s+(o.agents||[]).length; }, 0);
    var totalErrors = R.opps_processed.reduce(function(s,o){ return s+(o.errors||[]).length; }, 0) + R.errors.length;
    var statusMsg = totalAgents+' agents | '+R.opps_processed.length+' opps | '+totalErrors+' errors';
    await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'hr-sonnet-'+Date.now(), source:'sonnet_work', status: statusMsg, run_at: new Date().toISOString(), opportunities_found: 0}) });
    // If errors occurred, write alert to organism_memory so health monitor and self_awareness see it
    if (totalErrors > 0) {
      var errDetails = R.opps_processed.map(function(o) { return (o.opp||'?') + ': ' + (o.errors||[]).map(function(e){ return JSON.stringify(e).slice(0,200); }).join('; '); }).filter(function(s){ return s.indexOf('[]') === -1; }).join(' | ');
      if (R.errors.length) errDetails += ' | FATAL: ' + R.errors.map(function(e){ return JSON.stringify(e).slice(0,200); }).join('; ');
      await fetch(SB+'/rest/v1/organism_memory', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({ id: 'om-sw-err-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), agent: 'sonnet_work', opportunity_id: null, entity_tags: 'system,error,sonnet_work', observation: 'SONNET-WORK ERROR: '+statusMsg+'. Details: '+errDetails.slice(0,2000), memory_type: 'system_alert', created_at: new Date().toISOString() }) });
    }
  } catch(e) {}
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}