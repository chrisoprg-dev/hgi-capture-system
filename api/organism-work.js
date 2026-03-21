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

// Build full context for an opportunity — memory + ALL rich fields
// This is the fix: agents now see the actual scope, research, proposal draft, financials
function buildCtx(opp, mem) {
  var parts = [];
  parts.push('=== OPPORTUNITY RECORD ===');
  parts.push('Title: ' + opp.title);
  parts.push('Agency: ' + opp.agency);
  parts.push('Vertical: ' + (opp.vertical||''));
  parts.push('OPI: ' + opp.opi_score);
  parts.push('Stage: ' + (opp.stage||''));
  parts.push('Due: ' + (opp.due_date||'TBD'));
  parts.push('Est Value: ' + (opp.estimated_value||'unknown'));
  if ((opp.capture_action||'').length > 20) parts.push('\n--- CAPTURE ACTION / WINNABILITY ---\n' + (opp.capture_action||'').slice(0,600));
  if ((opp.scope_analysis||'').length > 100) parts.push('\n--- SCOPE ANALYSIS (RFP REQUIREMENTS) ---\n' + (opp.scope_analysis||'').slice(0,1200));
  if ((opp.financial_analysis||'').length > 100) parts.push('\n--- FINANCIAL ANALYSIS ---\n' + (opp.financial_analysis||'').slice(0,800));
  if ((opp.research_brief||'').length > 100) parts.push('\n--- RESEARCH BRIEF (COMPETITIVE INTEL) ---\n' + (opp.research_brief||'').slice(0,800));
  if ((opp.staffing_plan||'').length > 100) parts.push('\n--- PROPOSAL DRAFT (STAFFING PLAN) ---\n' + (opp.staffing_plan||'').slice(0,1000));
  if (mem && mem.length > 50) parts.push('\n=== ORGANISM MEMORY ===\n' + mem.slice(0,1500));
  return parts.join('\n');
}

// ═══ AGENT FUNCTIONS — all receive full context ═══

async function agentIntelligence(opp, ctx) {
  var web = await webSearch('Louisiana government contracts awarded ' + opp.agency + ' ' + (opp.vertical||'disaster recovery') + ' professional services 2023 2024 2025 who won award amount competitor');
  // Lower threshold — even short web results are useful
  var webCtx = (web && web.length > 30) ? ('\nWEB FINDINGS:\n' + web.slice(0,2000)) : '\n(No new web data — analyze from existing intelligence below)';
  var a = await think(
    'HGI competitive intelligence analyst. HGI has NEVER had a direct federal contract — all work through state/local agencies. Cite specific dollar amounts, firm names, dates. Flag anything that contradicts what the proposal or research already assumes.',
    ctx + webCtx + '\n\nExtract and update: (1) Named competitors likely to bid — specific firms and why they are threats (2) Recent comparable contract award amounts with sources (3) Incumbent contractor if any (4) Agency procurement patterns and decision-maker info (5) Red flags or competitive advantages not yet captured in the proposal draft above.',
    1000
  );
  if (!a || a.length < 80) return null;
  await storeMemory('intelligence_engine', opp.id, opp.agency+','+(opp.vertical||'')+',competitive_intel', 'INTEL ENGINE — '+opp.agency+':\n'+a, 'competitive_intel');
  try { await fetch(SB+'/rest/v1/competitive_intelligence', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'ci-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), competitor_name:'market_research', agency:opp.agency||'', vertical:opp.vertical||'', strategic_notes:a.slice(0,2000), opportunity_id:opp.id, source_agent:'intelligence_engine', created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
  return { agent:'intelligence_engine', opp:opp.title, chars:a.length };
}

async function agentCrm(opp, ctx) {
  var web = await webSearch('procurement director contact ' + opp.agency + ' Louisiana professional services contracts email phone 2024 2025');
  var webCtx = (web && web.length > 30) ? ('\nWEB CONTACT DATA:\n' + web.slice(0,1500)) : '\n(No new web contact data found)';
  var a = await think(
    'HGI relationship intelligence agent. Find and verify decision-maker contacts. Flag relationship strength as cold/unknown unless there is clear evidence otherwise.',
    ctx + webCtx + '\n\nExtract: (1) Named decision-makers — titles, emails, phones (2) Relationship status — do we know anyone here? (3) Best outreach approach given agency culture (4) Any cross-agency connections from our existing relationships (5) Who specifically should call or email this week and what to say.',
    700
  );
  if (!a || a.length < 60) return null;
  await storeMemory('crm_agent', opp.id, opp.agency+',contacts,relationship', 'CRM — '+opp.agency+':\n'+a, 'relationship');
  try { await fetch(SB+'/rest/v1/relationship_graph', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'rg-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), organization:opp.agency||'', notes:a.slice(0,1500), relationship_strength:'cold', source_agent:'crm_agent', opportunity_id:opp.id, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
  return { agent:'crm_agent', opp:opp.title, chars:a.length };
}

async function agentFinancial(opp, ctx) {
  var web = await webSearch('Louisiana ' + (opp.vertical||'disaster recovery') + ' consulting contract award amount 2022 2023 2024 FEMA PA program management MSA parish municipality');
  var webCtx = (web && web.length > 30) ? ('\nWEB AWARD DATA:\n' + web.slice(0,1500)) : '\n(No new web award data)';
  var a = await think(
    'HGI financial analyst. Only cite verified dollar amounts with sources. Directly compare to the financial analysis already in the proposal record.',
    ctx + webCtx + '\n\nAnalyze: (1) Real comparable award amounts — name agency, amount, period, scope (2) Does our current financial estimate match market reality? High, low, or on target? (3) What should the price-to-win be based on this data? (4) Any pricing risks specific to this agency type (5) Recommended adjustment to our estimate if needed.',
    700
  );
  if (!a || a.length < 80) return null;
  await storeMemory('financial_agent', opp.id, opp.agency+','+(opp.vertical||'')+',pricing_benchmark', 'FINANCIAL — '+opp.title+':\n'+a, 'pricing_benchmark');
  return { agent:'financial_agent', opp:opp.title, chars:a.length };
}

async function agentResearch(opp, ctx) {
  var web = await webSearch((opp.agency||'') + ' ' + (opp.vertical||'disaster recovery') + ' evaluation criteria best practices winning proposal strategies government RFP 2024 2025');
  var webCtx = (web && web.length > 30) ? ('\nWEB RESEARCH FINDINGS:\n' + web.slice(0,1500)) : '';
  var a = await think(
    'HGI strategic research and analysis agent. You have the full proposal draft, scope analysis, research brief, and financial model. Every recommendation must reference specific content from the proposal and tie to eval criteria point values.',
    ctx + webCtx + '\n\nProduce: (1) Competitive landscape update — are the competitors named in the research brief still the right ones given the full scope? (2) Win strategy mapped specifically to eval criteria weights (Tech30/Exp25/PP20/Staff15/Price10) — what the proposal does well and where it is weak (3) Intelligence gaps that would change our strategy if filled (4) Red flags the proposal does not address (5) Single highest-leverage action this week to improve our position.',
    1000
  );
  if (!a || a.length < 100) return null;
  await storeMemory('research_analysis', opp.id, opp.agency+','+(opp.vertical||'')+',strategy', 'RESEARCH — '+opp.title+':\n'+a, 'analysis');
  return { agent:'research_analysis', opp:opp.title, chars:a.length };
}

async function agentWinnability(opp, ctx) {
  var web = await webSearch((opp.agency||'') + ' ' + (opp.vertical||'disaster recovery') + ' contract award protest incumbent performance issues Louisiana 2024 2025 2026');
  var webCtx = (web && web.length > 30) ? ('\nWEB WINNABILITY DATA:\n' + web.slice(0,1200)) : '';
  var a = await think(
    'HGI bid decision engine. You have the full proposal draft and competitive intelligence. Re-evaluate GO/PWIN based on what is actually in the record, not assumptions.',
    ctx + webCtx + '\n\nRe-evaluate: (1) Does the GO decision hold given everything in the record? (2) Current PWIN — be specific about what drives it up or down (3) What new risks emerge from reading the actual proposal draft and scope? (4) What would flip this to NO-BID? (5) Final: PWIN X% | GO / CONDITIONAL GO / NO-BID and why.',
    600
  );
  if (!a || a.length < 80) return null;
  await storeMemory('winnability_agent', opp.id, opp.agency+',winnability,pwin', 'WINNABILITY — '+opp.title+':\n'+a, 'winnability');
  return { agent:'winnability_agent', opp:opp.title, chars:a.length };
}

async function agentQualityGate(opp, ctx) {
  if ((opp.staffing_plan||'').length < 100) return null;
  var web = await webSearch((opp.agency||'') + ' RFP submission requirements compliance checklist common proposal deficiencies government procurement ' + (opp.vertical||''));
  var webCtx = (web && web.length > 30) ? ('\nWEB COMPLIANCE DATA:\n' + web.slice(0,1200)) : '';
  var a = await think(
    'HGI submission quality gate. You have the actual proposal draft. Audit it line by line against the RFP requirements in the scope analysis. Be specific — quote what is missing.',
    ctx + webCtx + '\n\nCompliance audit: (1) Every RFP requirement in the scope — is it addressed in the proposal draft? List any gaps by name (2) Eval criteria sections — which are strong vs thin vs missing? Cite specific eval point values at risk (3) All required positions with rates — are all 10 present? (4) Past performance references — 3 required with contact info — present? (5) Required exhibits B-J — addressed? Final verdict: GO / NO-GO with specific deficiency list.',
    900
  );
  if (!a || a.length < 80) return null;
  await storeMemory('quality_gate', opp.id, opp.agency+',quality_gate,compliance', 'QUALITY GATE — '+opp.title+':\n'+a, 'analysis');
  return { agent:'quality_gate', opp:opp.title, chars:a.length };
}

async function agentProposal(opp, ctx) {
  if ((opp.staffing_plan||'').length < 100) return null;
  var a = await think(
    'HGI proposal improvement agent. You have the actual draft. Give specific, surgical edits — reference the exact section and what to change. Not generic advice.',
    ctx + '\n\nImprovement analysis: (1) Weakest sections mapped to eval point values — which sections are thin and how many points are at risk? (2) Specific content to add that would score higher — name the section, the content, the eval criterion it addresses (3) Competitive positioning gaps — does the draft adequately differentiate from CDR Maguire, Tetra Tech, IEM specifically? (4) Any factual errors or inconsistencies with the RFP scope? (5) Single most impactful edit — one paragraph that would most improve our score.',
    900
  );
  if (!a || a.length < 100) return null;
  await storeMemory('proposal_agent', opp.id, opp.agency+','+(opp.vertical||'')+',proposal_improvement', 'PROPOSAL — '+opp.title+':\n'+a, 'pattern');
  return { agent:'proposal_agent', opp:opp.title, chars:a.length };
}

async function agentBrief(opp, ctx) {
  if ((opp.stage||'') !== 'proposal' && (opp.stage||'') !== 'pursuing') return null;
  var a = await think(
    'HGI team briefing agent. You have the full record. Brief is current state — what the team needs to know and do right now. Functional roles only, never personal names.',
    ctx + '\n\nTeam brief: (1) Where we stand — proposal status, key gaps still open (2) What changed since last brief based on new intelligence in memory (3) Open items that must be resolved before submission (4) What each functional role must do this week — specific tasks (5) Overall win confidence and why.',
    700
  );
  if (!a || a.length < 80) return null;
  await storeMemory('brief_agent', opp.id, opp.agency+',briefing', 'BRIEF — '+opp.title+':\n'+a, 'analysis');
  return { agent:'brief_agent', opp:opp.title, chars:a.length };
}

async function agentOppBrief(opp, ctx) {
  var a = await think(
    'HGI opportunity brief agent. You have the complete record including proposal draft. Produce the deepest possible single-opportunity view. Surface what matters most first.',
    ctx + '\n\nComplete brief: (1) Everything the organism knows about this agency — budget, procurement patterns, relationships (2) Full competitive field with specific threat levels — who will beat us and how (3) HGI strengths and weaknesses mapped to each eval criterion with point values (4) Financial picture — are we priced to win? (5) Relationship map — who do we know, who do we not (6) Critical path to submission — every remaining milestone with owner.',
    1200
  );
  if (!a || a.length < 100) return null;
  await storeMemory('opportunity_brief_agent', opp.id, opp.agency+',opportunity_brief', 'OPP BRIEF — '+opp.title+':\n'+a, 'analysis');
  return { agent:'opportunity_brief_agent', opp:opp.title, chars:a.length };
}

async function agentDiscovery(memText) {
  var web = await webSearch('Louisiana government professional services procurement 2026 disaster recovery FEMA CDBG-DR housing new RFP solicitation pre-solicitation vendor conference');
  var a = await think('HGI discovery agent. Find pre-solicitation signals and new opportunity sources. HGI works through state/local only — never direct federal.',
    'WEB SCAN:\n' + (web||'(no results)').slice(0,2000) + '\nACTIVE SOURCES: Central Bidding, LaPAC, FEMA, Grants.gov. MISSING: LA Housing Corp, SAM.gov, parish minutes.\nMEMORY:\n' + memText.slice(0,800) + '\nFind: (1) Pre-solicitation signals — budget discussions, vendor days (2) New agencies HGI should watch (3) Market signals LA/TX/FL/MS (4) Source gaps competitors monitor that HGI misses.',
    800);
  if (!a || a.length < 80) return null;
  await storeMemory('discovery_agent', null, 'discovery,pre_solicitation,market_signals', 'DISCOVERY:\n'+a, 'pattern');
  return { agent:'discovery_agent', chars:a.length };
}

async function agentPipelineScanner(activeOpps, memText) {
  var today = new Date();
  var health = activeOpps.map(function(o) { var d = o.due_date ? Math.ceil((new Date(o.due_date)-today)/86400000) : null; return o.title+'|Stage:'+(o.stage||'?')+'|Days:'+(d!==null?d:'?')+'|OPI:'+o.opi_score+'|Proposal:'+(o.staffing_plan||'').length+'chars'; }).join('\n');
  var a = await think('HGI pipeline health monitor. Flag everything needing immediate action. Be direct and specific.',
    'PIPELINE:\n' + health + '\nMEMORY:\n' + memText.slice(0,1200) + '\nFlag: (1) Within 14 days without complete proposal (2) GO stuck same stage 7+ days (3) OPI inconsistent with what organism knows (4) Deadline conflicts (5) Pipeline health score 1-10 with specific reasoning.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('pipeline_scanner', null, 'pipeline_health,deadlines', 'PIPELINE SCANNER:\n'+a, 'analysis');
  return { agent:'pipeline_scanner', chars:a.length };
}

async function agentOpiCalibration(activeOpps, memText) {
  var oppList = activeOpps.map(function(o) { return o.title+'|'+o.agency+'|OPI:'+o.opi_score+'|'+o.vertical+'|Proposal:'+(o.staffing_plan||'').length+'chars|Research:'+(o.research_brief||'').length+'chars'; }).join('\n');
  var a = await think('HGI OPI calibration engine. Refine scoring accuracy based on accumulated intelligence and actual proposal state.',
    'OPPS:\n' + oppList + '\nINTEL:\n' + memText.slice(0,1800) + '\nFor each: (1) Does OPI reflect full picture including proposal completeness? (2) Specific adjustment recommended and by how much? (3) Factors consistently over/underweighted? (4) What single addition to the scoring model would most improve accuracy?',
    800);
  if (!a || a.length < 80) return null;
  await storeMemory('scanner_opi', null, 'opi_calibration,scoring', 'OPI CALIBRATION:\n'+a, 'pattern');
  return { agent:'scanner_opi', chars:a.length };
}

async function agentContent(memText) {
  var a = await think('HGI institutional voice agent. Active voice target 75%+. Analyze patterns from all organism output and proposal drafts.',
    'MEMORY (includes proposal excerpts):\n' + memText.slice(0,2000) + '\nAnalyze: (1) Active vs passive voice ratio in recent outputs (2) Specific phrases to block (3) What makes HGI writing distinctive and authoritative (4) Most impactful style change for next proposal.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('content_engine', null, 'voice,style', 'CONTENT ENGINE:\n'+a, 'pattern');
  return { agent:'content_engine', chars:a.length };
}

async function agentBench(activeOpps, memText) {
  var oppCtx = activeOpps.map(function(o){ return o.title+'|'+(o.vertical||'')+'|Stage:'+(o.stage||'')+'|Due:'+(o.due_date||'TBD'); }).join('\n');
  var a = await think('HGI recruiting and bench agent. Track staffing gaps before they block bids.',
    'ACTIVE PURSUITS:\n' + oppCtx + '\nHGI STAFF: 67 FT + 43 contract. Named: Louis Resweber (PD), Berron (PA SME), April Gloston (HM), Klunk (Financial), Wiltz (Documentation).\nINTEL:\n' + memText.slice(0,1000) + '\nFor each pursuit: (1) Roles needed vs available (2) Best named staff fits (3) Where teaming needed (4) Recurring gaps across multiple bids (5) Recruiting action needed before next deadline.',
    800);
  if (!a || a.length < 80) return null;
  await storeMemory('recruiting_bench', null, 'staffing,bench,gaps', 'BENCH:\n'+a, 'analysis');
  return { agent:'recruiting_bench', chars:a.length };
}

async function agentKb(memText) {
  var a = await think('HGI knowledge base agent. Identify most impactful KB gaps given active proposals.',
    'VERTICALS: Disaster Recovery (primary — St. George due Apr 24), Workforce/WIOA.\nKB STATUS: 21 docs, 350+ chunks. Strong: GOHSEP(149), TPCIGA(94), HTHA(22). Weak: 6 image-PDFs, 2 docx zero chunks.\nMEMORY:\n' + memText.slice(0,1500) + '\nIdentify: (1) KB content most referenced in current proposals (2) Critical past performance missing or thin (3) Agency-specific intel that should become KB chunks (4) Technical methodology gaps hurting proposal quality (5) Single document Lou should send next and exactly what gap it fills.',
    700);
  if (!a || a.length < 80) return null;
  await storeMemory('knowledge_base_agent', null, 'kb_gaps,kb_health', 'KB AGENT:\n'+a, 'pattern');
  return { agent:'knowledge_base_agent', chars:a.length };
}

async function agentScraper(activeOpps, memText) {
  var a = await think('HGI scraper health monitor. Track source yield and ROI.',
    'PIPELINE:\n' + activeOpps.map(function(o){ return (o.title||'').slice(0,50)+'|OPI:'+o.opi_score+'|Source:Central Bidding'; }).join('\n') + '\nMEMORY:\n' + memText.slice(0,800) + '\nAnalyze: (1) Which sources produce GO-quality vs noise (2) Central Bidding pattern analysis (3) Highest-ROI new source given active verticals (4) Degradation signs (5) Keyword adjustments per source.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('scraper_insights', null, 'scraper_health,source_roi', 'SCRAPER:\n'+a, 'pattern');
  return { agent:'scraper_insights', chars:a.length };
}

async function agentExecBrief(activeOpps, memText) {
  var a = await think('HGI executive briefing agent for Lou Resweber (CEO) and Larry Oney (Chairman). Concise, no noise. They need decisions, not status.',
    'PIPELINE:\n' + activeOpps.map(function(o){ return o.title+'|'+o.agency+'|OPI:'+o.opi_score+'|Due:'+(o.due_date||'TBD')+'|Stage:'+(o.stage||'?'); }).join('\n') + '\nINTEL:\n' + memText.slice(0,1800) + '\nDigest: (1) Pipeline summary and financial stakes (2) Decisions needed from Lou or Larry this week (3) Opportunities needing executive-level relationships (4) Where are we most likely to win and why (5) What needs their visibility that Christopher has not surfaced.',
    700);
  if (!a || a.length < 80) return null;
  await storeMemory('executive_brief_agent', null, 'executive_brief,digest', 'EXEC BRIEF:\n'+a, 'analysis');
  return { agent:'executive_brief_agent', chars:a.length };
}

async function agentDesign(activeOpps, memText) {
  var a = await think('HGI design and visual agent. Every HGI output should look like it came from a firm that manages billion-dollar programs.',
    'ACTIVE PROPOSALS:\n' + activeOpps.filter(function(o){ return (o.staffing_plan||'').length > 100; }).map(function(o){ return o.title+'|'+o.agency+'|Due:'+(o.due_date||'TBD'); }).join('\n') + '\nMEMORY:\n' + memText.slice(0,1000) + '\nAnalyze: (1) Visual structure that would impress evaluators for each active proposal (2) Sections needing tables, org charts, compliance matrices (3) Brand standards — gold/navy, professional typography (4) Visual differentiators vs CDR Maguire and Tetra Tech (5) Single highest-priority visual improvement.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('design_visual', null, 'visual,branding,format', 'DESIGN:\n'+a, 'pattern');
  return { agent:'design_visual', chars:a.length };
}

async function agentDashboard(activeOpps, allMemories, memText) {
  var a = await think('HGI dashboard agent. Morning briefing for Christopher. What needs his attention vs what is running fine.',
    'SYSTEM: ' + activeOpps.length + ' active opps | ' + allMemories.length + ' memories in brain\nPIPELINE:\n' + activeOpps.map(function(o){ return o.title+'|OPI:'+o.opi_score+'|Stage:'+(o.stage||'?')+'|Due:'+(o.due_date||'?'); }).join('\n') + '\nMEMORY:\n' + memText.slice(0,1500) + '\nSynthesize: (1) Organism health — how well is every agent contributing? (2) Which opportunities need Christopher today vs running autonomously (3) Most important single thing Christopher should know right now (4) Highest-impact improvement this week.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('dashboard_agent', null, 'dashboard,morning_brief', 'DASHBOARD:\n'+a, 'analysis');
  return { agent:'dashboard_agent', chars:a.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const trigger = (req.body || {}).trigger || (req.method === 'GET' ? 'manual' : 'cron');
  const results = { trigger, started_at: new Date().toISOString(), work_completed: [], errors: [] };

  // Load full opportunity records including all rich fields
  const [activeOpps, allMemories] = await Promise.all([
    sbGet('/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.65&select=id,title,agency,vertical,state,opi_score,due_date,stage,capture_action,scope_analysis,financial_analysis,research_brief,staffing_plan,estimated_value&order=opi_score.desc&limit=5'),
    sbGet('/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=60')
  ]);
  results.opps_loaded = activeOpps.length;
  results.memories_loaded = allMemories.length;

  const memText = allMemories.slice(0, 40).map(function(m) {
    return '[' + (m.agent||'') + '|' + (m.memory_type||'') + '|' + (m.created_at||'').slice(0,10) + ']:\n' + (m.observation||'').slice(0,300);
  }).join('\n\n---\n\n');

  function oppMem(opp) {
    return allMemories.filter(function(m) {
      return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||'');
    }).map(function(m) { return (m.observation||'').slice(0,250); }).join('\n\n');
  }

  // ═══ ALL PER-OPPORTUNITY AGENTS FIRE IN PARALLEL ═══
  // Each agent now receives buildCtx(opp, mem) — full record + memory
  var perOppPromises = [];
  for (var i = 0; i < activeOpps.length; i++) {
    (function(opp) {
      var mem = oppMem(opp);
      var ctx = buildCtx(opp, mem);
      perOppPromises.push(safe(function(){ return agentIntelligence(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentCrm(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentFinancial(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentResearch(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentWinnability(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentQualityGate(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentProposal(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentBrief(opp, ctx); }));
      perOppPromises.push(safe(function(){ return agentOppBrief(opp, ctx); }));
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

  var allResults = await Promise.all(perOppPromises.concat(systemPromises));
  for (var j = 0; j < allResults.length; j++) {
    if (allResults[j]) results.work_completed.push(allResults[j]);
  }

  // ═══ SELF-AWARENESS RUNS LAST — sees everything all agents produced ═══
  var selfResult = await safe(async function() {
    var a = await think(
      'HGI self-awareness engine. You see the full picture — every agent result, every memory, every opportunity. Identify patterns and the single highest-leverage improvement.',
      'WORK COMPLETED THIS RUN:\n' + JSON.stringify(results.work_completed.slice(0,20)).slice(0,2000) + '\nERRORS: ' + results.errors.length + '\nTOTAL MEMORIES: ' + allMemories.length + '\nMEMORY STATE:\n' + memText.slice(0,1500) + '\nAnalyze: (1) Patterns emerging across all opportunities and all agents (2) Which agents produced highest-value intelligence today (3) What data gaps are costing HGI the most right now (4) Single improvement with highest win rate impact (5) Contradictions or anomalies — anything that does not add up.',
      1000
    );
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