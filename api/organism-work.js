export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
async function sbGet(path) { try { const r = await fetch(SB + path, { headers: H }); if (!r.ok) return []; return await r.json(); } catch(e) { return []; } }
async function storeMemory(agent, oppId, tags, observation, memType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: observation, memory_type: memType || 'analysis', created_at: new Date().toISOString() }) }); } catch(e) {}
}
async function webSearch(query) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Intelligence analyst. Return specific verified findings with sources. Be concise.', messages: [{ role: 'user', content: query }] }) });
    if (!r.ok) return '';
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}
async function think(system, prompt, maxT) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxT || 800, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return '';
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return ''; }
}
async function safe(fn) { try { return await fn(); } catch(e) { return null; } }

// ═══ AGENT FUNCTIONS — each returns result object or null ═══

async function agentIntelligence(opp, mem) {
  var web = await webSearch('Louisiana government contracts awarded ' + opp.agency + ' ' + (opp.vertical||'disaster recovery') + ' professional services 2023 2024 2025 who won award amount');
  if (!web || web.length < 100) return null;
  var a = await think('HGI competitive intelligence analyst. NEVER direct federal — all work through state/local. Cite dollar amounts, names, dates.', 'OPP: ' + opp.title + ' | ' + opp.agency + '\nWEB:\n' + web.slice(0,2500) + '\nMEMORY:\n' + mem.slice(0,1000) + '\nExtract: (1) Named competitors and strengths (2) Recent award amounts (3) Incumbent (4) Agency procurement patterns (5) Red flags. Flag contradictions with prior assumptions.', 1000);
  if (!a || a.length < 100) return null;
  await storeMemory('intelligence_engine', opp.id, opp.agency+','+(opp.vertical||'')+',competitive_intel', 'INTEL ENGINE — '+opp.agency+':\n'+a, 'competitive_intel');
  try { await fetch(SB+'/rest/v1/competitive_intelligence', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'ci-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), competitor_name:'market_research', agency:opp.agency||'', vertical:opp.vertical||'', strategic_notes:a.slice(0,2000), opportunity_id:opp.id, source_agent:'intelligence_engine', created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
  return { agent:'intelligence_engine', opp:opp.title, chars:a.length };
}

async function agentCrm(opp, mem) {
  var web = await webSearch('procurement director purchasing manager ' + opp.agency + ' Louisiana professional services contracts contact email phone 2024 2025');
  if (!web || web.length < 100) return null;
  var a = await think('HGI relationship intelligence agent. Find verified decision-maker contacts. Relationship strength cold/unknown unless evidence otherwise.', 'AGENCY: ' + opp.agency + ' | ' + (opp.state||'LA') + '\nWEB:\n' + web.slice(0,2000) + '\nMEMORY:\n' + mem.slice(0,600) + '\nExtract: named contacts, titles, emails, phones. Best outreach approach. Any HGI history or mutual connections.', 700);
  if (!a || a.length < 80) return null;
  await storeMemory('crm_agent', opp.id, opp.agency+',contacts,relationship', 'CRM — '+opp.agency+':\n'+a, 'relationship');
  try { await fetch(SB+'/rest/v1/relationship_graph', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'rg-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), organization:opp.agency||'', notes:a.slice(0,1500), relationship_strength:'cold', source_agent:'crm_agent', opportunity_id:opp.id, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
  return { agent:'crm_agent', opp:opp.title, chars:a.length };
}

async function agentFinancial(opp, mem) {
  var web = await webSearch('Louisiana ' + (opp.vertical||'disaster recovery') + ' consulting MSA contract award 2022 2023 2024 FEMA PA program management hourly rates parish municipality');
  if (!web || web.length < 100) return null;
  var a = await think('HGI financial analyst. Only cite verified dollar amounts with sources.', 'OPP: ' + opp.title + ' | ' + opp.agency + ' | Est: ' + (opp.estimated_value||'unknown') + '\nWEB AWARD DATA:\n' + web.slice(0,2000) + '\nMEMORY:\n' + mem.slice(0,600) + '\nExtract real award amounts — name agency, amount, period, scope. What does this imply for our estimate? High or low?', 700);
  if (!a || a.length < 80) return null;
  await storeMemory('financial_agent', opp.id, opp.agency+','+(opp.vertical||'')+',pricing_benchmark', 'FINANCIAL — '+opp.title+':\n'+a, 'pricing_benchmark');
  return { agent:'financial_agent', opp:opp.title, chars:a.length };
}

async function agentResearch(opp, mem) {
  var a = await think('HGI strategic research agent. Every recommendation ties to specific evidence. No generic advice.', 'OPP: ' + opp.title + ' | ' + opp.agency + ' | OPI:' + opp.opi + '\nEVAL: Tech30/Exp25/PP20/Staff15/Price10\nINTEL:\n' + mem.slice(0,2500) + '\nProduce: (1) Updated competitive landscape with named firms and specific threats (2) Win strategy mapped to eval point values (3) Intelligence gaps still needed (4) Red flags (5) Single highest-leverage action this week.', 900);
  if (!a || a.length < 100) return null;
  await storeMemory('research_analysis', opp.id, opp.agency+','+(opp.vertical||'')+',strategy', 'RESEARCH — '+opp.title+':\n'+a, 'analysis');
  return { agent:'research_analysis', opp:opp.title, chars:a.length };
}

async function agentWinnability(opp, mem) {
  var a = await think('HGI bid decision engine. Re-evaluate GO/PWIN honestly as intelligence accumulates.', 'OPP: ' + opp.title + ' | ' + opp.agency + ' | OPI:' + opp.opi + '\nINTEL:\n' + mem.slice(0,2000) + '\nRe-evaluate: (1) Should GO decision change? (2) PWIN movement and why? (3) New risks? (4) What would flip to NO-BID? (5) Recommendation: PWIN X% | GO/CONDITIONAL/NO-BID.', 600);
  if (!a || a.length < 80) return null;
  await storeMemory('winnability_agent', opp.id, opp.agency+',winnability,pwin', 'WINNABILITY — '+opp.title+':\n'+a, 'winnability');
  return { agent:'winnability_agent', opp:opp.title, chars:a.length };
}

async function agentQualityGate(opp, mem) {
  if ((opp.staffing_plan||'').length < 300) return null;
  var a = await think('HGI submission quality gate. Catch every deficiency before an evaluator does.', 'OPP: ' + opp.title + ' | ' + opp.agency + '\nEVAL: Tech30/Exp25/PP20/Staff15/Price10\nSCOPE:\n' + (opp.scope_analysis||'').slice(0,700) + '\nProposal exists. Check: (1) Every RFP requirement addressed? (2) Thin eval criteria sections? (3) All 10 positions with rates? (4) 3 past performance refs with contacts? (5) Exhibits B-J noted? Verdict: GO/NO-GO with deficiency list.', 800);
  if (!a || a.length < 80) return null;
  await storeMemory('quality_gate', opp.id, opp.agency+',quality_gate,compliance', 'QUALITY GATE — '+opp.title+':\n'+a, 'analysis');
  return { agent:'quality_gate', opp:opp.title, chars:a.length };
}

async function agentProposal(opp, mem) {
  if ((opp.staffing_plan||'').length < 300) return null;
  var a = await think('HGI proposal strategy agent. Specific improvements only — cite eval criteria and competitor intelligence.', 'OPP: ' + opp.title + ' | ' + opp.agency + '\nEVAL: Tech30/Exp25/PP20/Staff15/Price10\nINTEL:\n' + mem.slice(0,2000) + '\nProposal exists. Identify: (1) Weakest sections vs eval point values (2) Missing content that scores higher (3) Compliance gaps (4) Competitive positioning vs CDR Maguire/Tetra Tech/IEM (5) Single most impactful edit.', 800);
  if (!a || a.length < 100) return null;
  await storeMemory('proposal_agent', opp.id, opp.agency+','+(opp.vertical||'')+',proposal_improvement', 'PROPOSAL — '+opp.title+':\n'+a, 'pattern');
  return { agent:'proposal_agent', opp:opp.title, chars:a.length };
}

async function agentBrief(opp, mem) {
  if ((opp.stage||'') !== 'proposal' && (opp.stage||'') !== 'pursuing') return null;
  var a = await think('HGI team briefing agent. Keep team picture current. Functional roles only — never personal names.', 'OPP: ' + opp.title + ' | ' + opp.agency + ' | Due:' + (opp.due_date||'TBD') + '\nINTEL:\n' + mem.slice(0,2000) + '\nUpdate: (1) What changed since last brief? (2) Open items unresolved (3) What must happen before next milestone (4) What each functional role does this week (5) Overall win confidence.', 700);
  if (!a || a.length < 80) return null;
  await storeMemory('brief_agent', opp.id, opp.agency+',briefing', 'BRIEF — '+opp.title+':\n'+a, 'analysis');
  return { agent:'brief_agent', opp:opp.title, chars:a.length };
}

async function agentDiscovery(memText) {
  var web = await webSearch('Louisiana government professional services procurement 2026 disaster recovery FEMA CDBG-DR housing new RFP solicitation pre-solicitation vendor conference');
  var a = await think('HGI discovery agent. Find pre-solicitation signals and new sources. HGI works through state/local only.', 'WEB:\n' + (web||'').slice(0,2000) + '\nSOURCES ACTIVE: Central Bidding, LaPAC, FEMA, Grants.gov. MISSING: LA Housing Corp, SAM.gov, parish minutes.\nMEMORY:\n' + memText.slice(0,800) + '\nFind: (1) Pre-solicitation signals (2) New agencies to watch (3) LA/TX/FL/MS market signals (4) Source gaps competitors use that HGI misses.', 800);
  if (!a || a.length < 80) return null;
  await storeMemory('discovery_agent', null, 'discovery,pre_solicitation,market_signals', 'DISCOVERY:\n'+a, 'pattern');
  return { agent:'discovery_agent', chars:a.length };
}

async function agentPipelineScanner(activeOpps, memText) {
  var today = new Date();
  var health = activeOpps.map(function(o) { var d = o.due_date ? Math.ceil((new Date(o.due_date)-today)/86400000) : null; return o.title+'|Stage:'+(o.stage||'?')+'|Days:'+(d!==null?d:'?')+'|OPI:'+o.opi; }).join('\n');
  var a = await think('HGI pipeline health monitor. Flag everything needing immediate action.', 'PIPELINE:\n' + health + '\nMEMORY:\n' + memText.slice(0,1200) + '\nFlag: (1) Within 14 days without complete proposal (2) GO stuck same stage 7+ days (3) OPI inconsistent with intel (4) Deadline conflicts (5) Pipeline health score 1-10.', 600);
  if (!a || a.length < 80) return null;
  await storeMemory('pipeline_scanner', null, 'pipeline_health,deadlines', 'PIPELINE SCANNER:\n'+a, 'analysis');
  return { agent:'pipeline_scanner', chars:a.length };
}

async function agentOpiCalibration(activeOpps, memText) {
  var a = await think('HGI OPI calibration engine. Refine scoring based on accumulated intelligence.', 'OPPS:\n' + activeOpps.map(function(o) { return o.title+'|'+o.agency+'|OPI:'+o.opi+'|'+o.vertical; }).join('\n') + '\nINTEL:\n' + memText.slice(0,1800) + '\nFor each: (1) Does OPI reflect what organism knows? (2) Adjustments needed and by how much? (3) Consistently over/underweighted factors? (4) What would most improve scoring model?', 800);
  if (!a || a.length < 80) return null;
  await storeMemory('scanner_opi', null, 'opi_calibration,scoring', 'OPI CALIBRATION:\n'+a, 'pattern');
  return { agent:'scanner_opi', chars:a.length };
}

async function agentContent(memText) {
  var a = await think('HGI institutional voice agent. Active voice target 75%+. Maintain HGI writing standards.', 'MEMORY:\n' + memText.slice(0,1800) + '\nAnalyze: (1) Active vs passive voice patterns (2) Phrases to block (3) What makes HGI writing distinctive (4) Style improvements for next proposal.', 600);
  if (!a || a.length < 80) return null;
  await storeMemory('content_engine', null, 'voice,style', 'CONTENT ENGINE:\n'+a, 'pattern');
  return { agent:'content_engine', chars:a.length };
}

async function agentBench(activeOpps, memText) {
  var a = await think('HGI recruiting and bench agent. Track staffing gaps before they block bids.', 'OPPS:\n' + activeOpps.map(function(o){ return o.title+'|'+(o.vertical||'')+'|'+(o.stage||''); }).join('\n') + '\nSTAFF: 67 FT + 43 contract. Key: Louis Resweber (PD), Berron (PA SME), April Gloston (HM), Klunk (Financial), Wiltz (Documentation).\nINTEL:\n' + memText.slice(0,1000) + '\nFor each pursuit: (1) Roles needed vs available (2) Best staff fits (3) Teaming/sub needed (4) Recurring gaps (5) Recruiting action before next deadline.', 800);
  if (!a || a.length < 80) return null;
  await storeMemory('recruiting_bench', null, 'staffing,bench,gaps', 'BENCH:\n'+a, 'analysis');
  return { agent:'recruiting_bench', chars:a.length };
}

async function agentKb(memText) {
  var a = await think('HGI knowledge base agent. Identify the most impactful KB gaps.', 'VERTICALS: Disaster Recovery, Workforce/WIOA.\nKB: 21 docs, 350+ chunks. Strong: GOHSEP(149), TPCIGA(94), HTHA(22). Weak: 6 image-PDFs, 2 docx zero chunks.\nMEMORY:\n' + memText.slice(0,1200) + '\nIdentify: (1) KB content referenced most in current work (2) Critical past performance missing (3) Agency intel that should be chunks (4) Technical methodology gaps (5) Single document Lou should send next.', 700);
  if (!a || a.length < 80) return null;
  await storeMemory('knowledge_base_agent', null, 'kb_gaps,kb_health', 'KB AGENT:\n'+a, 'pattern');
  return { agent:'knowledge_base_agent', chars:a.length };
}

async function agentScraper(activeOpps, memText) {
  var a = await think('HGI scraper health monitor. Track source yield and ROI.', 'PIPELINE:\n' + activeOpps.map(function(o){ return (o.title||'').slice(0,50)+'|OPI:'+o.opi; }).join('\n') + '\nMEMORY:\n' + memText.slice(0,800) + '\nAnalyze: (1) Sources producing GO-quality vs noise (2) Central Bidding patterns (3) Highest-ROI new source to add (4) Degradation signs (5) Keyword adjustments.', 600);
  if (!a || a.length < 80) return null;
  await storeMemory('scraper_insights', null, 'scraper_health,source_roi', 'SCRAPER:\n'+a, 'pattern');
  return { agent:'scraper_insights', chars:a.length };
}

async function agentExecBrief(activeOpps, memText) {
  var a = await think('HGI executive briefing agent for Lou Resweber (CEO) and Larry Oney (Chairman). Concise, no noise.', 'PIPELINE:\n' + activeOpps.map(function(o){ return o.title+'|'+o.agency+'|OPI:'+o.opi+'|Due:'+(o.due_date||'TBD')+'|Stage:'+(o.stage||'?'); }).join('\n') + '\nINTEL:\n' + memText.slice(0,1800) + '\nDigest: (1) Pipeline summary and stakes (2) Critical decisions this week (3) Opportunities needing executive relationships (4) Win probability summary (5) What needs Lou/Larry visibility.', 700);
  if (!a || a.length < 80) return null;
  await storeMemory('executive_brief_agent', null, 'executive_brief,digest', 'EXEC BRIEF:\n'+a, 'analysis');
  return { agent:'executive_brief_agent', chars:a.length };
}

async function agentDesign(activeOpps, memText) {
  var a = await think('HGI design and visual agent. Every output should look like a billion-dollar program management firm.', 'PROPOSALS:\n' + activeOpps.filter(function(o){ return (o.staffing_plan||'').length > 300; }).map(function(o){ return o.title+'|'+o.agency; }).join('\n') + '\nMEMORY:\n' + memText.slice(0,1000) + '\nAnalyze: (1) Visual format to impress evaluators (2) Sections needing tables/org charts/matrices (3) Brand standards gold/navy (4) Visual differentiators vs CDR Maguire/Tetra Tech (5) Highest-priority visual improvement.', 600);
  if (!a || a.length < 80) return null;
  await storeMemory('design_visual', null, 'visual,branding,format', 'DESIGN:\n'+a, 'pattern');
  return { agent:'design_visual', chars:a.length };
}

async function agentDashboard(activeOpps, allMemories, memText) {
  var a = await think('HGI dashboard agent. Synthesize system health for Christopher morning briefing.', 'SYSTEM: ' + activeOpps.length + ' active opps | ' + allMemories.length + ' memories\nMEMORY:\n' + memText.slice(0,1500) + '\nSynthesize: (1) Organism health — how well is it working? (2) Which opps need Christopher vs autonomous? (3) Most important thing Christopher should know now? (4) Highest impact improvement this week.', 600);
  if (!a || a.length < 80) return null;
  await storeMemory('dashboard_agent', null, 'dashboard,morning_brief', 'DASHBOARD:\n'+a, 'analysis');
  return { agent:'dashboard_agent', chars:a.length };
}

async function agentOppBrief(opp, mem) {
  var a = await think('HGI opportunity brief agent. Deepest possible single-opportunity view. Surface what matters most first.', 'OPP: ' + opp.title + ' | ' + opp.agency + ' | OPI:' + opp.opi + ' | Due:'+(opp.due_date||'TBD') + '\nALL INTEL:\n' + mem.slice(0,3000) + '\nBrief: (1) Everything known about this agency (2) Complete competitive field with threat assessment (3) HGI strengths/gaps vs eval criteria (4) Financial picture and margin (5) Relationship map (6) Critical path to submission.', 1000);
  if (!a || a.length < 100) return null;
  await storeMemory('opportunity_brief_agent', opp.id, opp.agency+',opportunity_brief', 'OPP BRIEF — '+opp.title+':\n'+a, 'analysis');
  return { agent:'opportunity_brief_agent', opp:opp.title, chars:a.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const trigger = (req.body || {}).trigger || (req.method === 'GET' ? 'manual' : 'cron');
  const results = { trigger, started_at: new Date().toISOString(), work_completed: [], errors: [] };

  const [activeOpps, allMemories] = await Promise.all([
    sbGet('/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.65&select=id,title,agency,vertical,state,opi_score,due_date,stage,scope_analysis,financial_analysis,research_brief,staffing_plan,estimated_value&order=opi_score.desc&limit=5'),
    sbGet('/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=60')
  ]);
  results.opps_loaded = activeOpps.length;
  results.memories_loaded = allMemories.length;
  const memText = allMemories.slice(0, 40).map(function(m) { return '[' + (m.agent||'') + '|' + (m.memory_type||'') + '|' + (m.created_at||'').slice(0,10) + ']:\n' + (m.observation||'').slice(0,300); }).join('\n\n---\n\n');
  function oppMem(opp) {
    return allMemories.filter(function(m) { return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||''); }).map(function(m) { return (m.observation||'').slice(0,250); }).join('\n\n') + '\n\n' + memText.slice(0,1200);
  }

  // ═══ ALL PER-OPPORTUNITY AGENTS FIRE IN PARALLEL ═══
  // Build one big array of promises — every agent for every opportunity at once
  var perOppPromises = [];
  for (var i = 0; i < activeOpps.length; i++) {
    (function(opp) {
      var mem = oppMem(opp);
      perOppPromises.push(safe(function(){ return agentIntelligence(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentCrm(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentFinancial(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentResearch(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentWinnability(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentQualityGate(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentProposal(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentBrief(opp, mem); }));
      perOppPromises.push(safe(function(){ return agentOppBrief(opp, mem); }));
    })(activeOpps[i]);
  }

  // ═══ ALL SYSTEM-WIDE AGENTS FIRE IN PARALLEL ═══
  var systemPromises = [
    safe(function(){ return agentDiscovery(memText); }),
    safe(function(){ return agentPipelineScanner(activeOpps, memText); }),
    safe(function(){ return agentOpiCalibration(activeOpps, memText); }),
    safe(function(){ return agentContent(memText); }),
    safe(function(){ return agentBench(activeOpps, memText); }),
    safe(function(){ return agentKb(memText); }),
    safe(function(){ return agentScraper(activeOpps, memText); }),
    safe(function(){ return agentExecBrief(activeOpps, memText); }),
    safe(function(){ return agentDesign(activeOpps, memText); }),
    safe(function(){ return agentDashboard(activeOpps, allMemories, memText); })
  ];

  // Run both batches in parallel, collect results
  var allResults = await Promise.all(perOppPromises.concat(systemPromises));
  for (var j = 0; j < allResults.length; j++) {
    if (allResults[j]) results.work_completed.push(allResults[j]);
  }

  // ═══ SELF-AWARENESS RUNS LAST — sees everything ═══
  var selfResult = await safe(async function() {
    var a = await think('HGI self-awareness engine. You see everything every agent did. Identify the single highest-leverage improvement.', 'WORK COMPLETED:\n' + JSON.stringify(results.work_completed.slice(0,15)).slice(0,1500) + '\nERRORS: ' + results.errors.length + '\nMEMORIES: ' + allMemories.length + '\nAnalyze: (1) Patterns across opportunities and agents (2) Highest-value intelligence produced today (3) Data gaps costing HGI most (4) Single improvement with highest win rate impact (5) Contradictions or anomalies in data.', 1000);
    if (!a || a.length < 100) return null;
    await storeMemory('self_awareness', null, 'system_health,self_assessment,patterns', 'SELF-AWARENESS:\n'+a, 'pattern');
    return { agent:'self_awareness', chars:a.length };
  });
  if (selfResult) results.work_completed.push(selfResult);

  try {
    await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({ id:'hr-work-'+Date.now(), source:'organism_work', status: results.work_completed.length+' items | '+activeOpps.length+' opps | '+allMemories.length+' memories | '+results.errors.length+' errors', run_at: new Date().toISOString(), opportunities_found: 0 }) });
  } catch(e) {}

  results.completed_at = new Date().toISOString();
  results.total_work_items = results.work_completed.length;
  return res.status(200).json(results);
}