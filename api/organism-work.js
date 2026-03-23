import { HGI_CONTEXT, HGI_CLASSIFICATION_GUIDE } from './hgi-master-context.js';
export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function getCSTDate() { return new Date(Date.now() - 6 * 3600000); }
function getCSTDateStr() { return getCSTDate().toISOString().slice(0, 10); }
function logCost(agent, model, inTok, outTok, endpoint) {
  var p = model.indexOf('sonnet') !== -1 ? { in: 0.000003, out: 0.000015 } : { in: 0.00000025, out: 0.00000125 };
  var cost = inTok * p.in + outTok * p.out;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), source: 'api_cost', status: JSON.stringify({ agent: agent, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: endpoint || 'organism-work' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}
async function sbGet(path) { try { const r = await fetch(SB + path, { headers: H }); if (!r.ok) return []; return await r.json(); } catch(e) { return []; } }
async function storeMemory(agent, oppId, tags, observation, memType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: observation, memory_type: memType || 'analysis', created_at: new Date().toISOString() }) }); } catch(e) {}
}
async function gatedWebSearch(query, agentName) {
  if (agentName) {
    var gate = await shouldWebSearch(agentName);
    if (!gate) return '';
  }
  return await webSearch(query);
}
async function webSearch(query) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Intelligence analyst. Return specific verified findings with sources. Be concise.', messages: [{ role: 'user', content: query }] }) });
    if (!r.ok) return '';
    const d = await r.json();
    if (d.usage) logCost('web_search', 'claude-haiku-4-5-20251001', d.usage.input_tokens||0, d.usage.output_tokens||0, 'organism-work-search');
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}
async function think(system, prompt, maxT, useSonnet) {
  var model = useSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: model, max_tokens: maxT || 800, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return '';
    const d = await r.json();
    if (d.usage) logCost('think', model, d.usage.input_tokens||0, d.usage.output_tokens||0, 'organism-work');
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return ''; }
}

// Web search frequency gate — check if agent searched recently
async function shouldWebSearch(agentName) {
  var ALWAYS_SEARCH = ['intelligence_engine','crm_agent','financial_agent','discovery_agent','winnability_agent'];
  if (ALWAYS_SEARCH.indexOf(agentName) !== -1) return true;
  try {
    var r = await fetch(SB + '/rest/v1/organism_memory?agent=eq.' + agentName + '&order=created_at.desc&limit=1&select=created_at', { headers: H });
    if (!r.ok) return true;
    var d = await r.json();
    if (!d || !d.length) return true;
    var lastRun = new Date(d[0].created_at);
    var hoursSince = (Date.now() - lastRun.getTime()) / 3600000;
    return hoursSince > 20;
  } catch(e) { return true; }
}
async function safe(fn, label) { try { return await fn(); } catch(e) { return { _error: true, agent: label || 'unknown', message: e.message || String(e) }; } }

// Build full context for an opportunity — memory + ALL rich fields
// This is the fix: agents now see the actual scope, research, proposal draft, financials
function buildCtx(opp, mem, tier) {
  var full = (tier === 'full');
  var parts = [];
  parts.push('=== OPPORTUNITY RECORD ===');
  parts.push('Title: ' + opp.title);
  parts.push('Agency: ' + opp.agency);
  parts.push('Vertical: ' + (opp.vertical||''));
  parts.push('OPI: ' + opp.opi_score);
  parts.push('Stage: ' + (opp.stage||''));
  parts.push('Due: ' + (opp.due_date||'TBD'));
  parts.push('Est Value: ' + (opp.estimated_value||'unknown'));
  if ((opp.capture_action||'').length > 20) parts.push('\n--- CAPTURE ACTION / WINNABILITY ---\n' + (opp.capture_action||'').slice(0, full ? 1500 : 800));
  if ((opp.scope_analysis||'').length > 100) parts.push('\n--- SCOPE ANALYSIS (RFP REQUIREMENTS) ---\n' + (opp.scope_analysis||'').slice(0, full ? 5000 : 2500));
  if ((opp.financial_analysis||'').length > 100) parts.push('\n--- FINANCIAL ANALYSIS ---\n' + (opp.financial_analysis||'').slice(0, full ? 2500 : 1200));
  if ((opp.research_brief||'').length > 100) parts.push('\n--- RESEARCH BRIEF (COMPETITIVE INTEL) ---\n' + (opp.research_brief||'').slice(0, full ? 3000 : 1500));
  if ((opp.staffing_plan||'').length > 100) parts.push('\n--- PROPOSAL DRAFT ---\n' + (opp.staffing_plan||'').slice(0, full ? 15000 : 5000));
  if (mem && mem.length > 50) parts.push('\n=== ORGANISM MEMORY ===\n' + mem.slice(0, full ? 4000 : 2500));
  return parts.join('\n');
}

// ═══ AGENT FUNCTIONS — all receive full context ═══

async function agentIntelligence(opp, ctx) {
  var web = await webSearch(opp.agency + ' ' + (opp.state||'Louisiana') + ' ' + (opp.vertical||'professional services') + ' contracts awarded 2023 2024 2025 who won award amount competitor incumbent');
  // Lower threshold — even short web results are useful
  var webCtx = (web && web.length > 30) ? ('\nWEB FINDINGS:\n' + web.slice(0,2000)) : '\n(No new web data — analyze from existing intelligence below)';
  var a = await think(
    'HGI competitive intelligence analyst. HGI has NEVER had a direct federal contract — all work through state/local agencies. Cite specific dollar amounts, firm names, dates. Flag anything that contradicts what the proposal or research already assumes.',
    ctx + webCtx + '\n\nExtract and update: (1) Named competitors likely to bid — specific firms and why they are threats (2) Recent comparable contract award amounts with sources (3) Incumbent contractor if any (4) Agency procurement patterns and decision-maker info (5) Red flags or competitive advantages not yet captured in the proposal draft above.',
    1000, true
  );
  if (!a || a.length < 80) return null;
  await storeMemory('intelligence_engine', opp.id, opp.agency+','+(opp.vertical||'')+',competitive_intel', 'INTEL ENGINE — '+opp.agency+':\n'+a, 'competitive_intel');
  try { await fetch(SB+'/rest/v1/competitive_intelligence', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'ci-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), competitor_name:'market_research', agency:opp.agency||'', vertical:opp.vertical||'', strategic_notes:a.slice(0,2000), opportunity_id:opp.id, source_agent:'intelligence_engine', created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
  return { agent:'intelligence_engine', opp:opp.title, chars:a.length };
}

async function agentCrm(opp, ctx) {
  var web = await webSearch('procurement director contact ' + opp.agency + ' ' + (opp.state||'Louisiana') + ' professional services contracts email phone 2024 2025');
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
  var web = await webSearch((opp.state||'Louisiana') + ' ' + (opp.vertical||'professional services') + ' ' + (opp.title||'').slice(0,60) + ' consulting contract award amount 2022 2023 2024 comparable contracts');
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
  var doWeb = await shouldWebSearch('research_analysis');
  var web = doWeb ? await webSearch((opp.agency||'') + ' ' + (opp.vertical||'professional services') + ' ' + (opp.title||'').slice(0,60) + ' evaluation criteria best practices winning proposal strategies government RFP 2025 2026') : '';
  var webCtx = (web && web.length > 30) ? ('\nWEB RESEARCH FINDINGS:\n' + web.slice(0,1500)) : '';
  var a = await think(
    'You are a strategic capture advisor who combines deep domain expertise with competitive intelligence to build win strategies. You have the full proposal draft, scope, research brief, financials, organism memory, AND fresh web intelligence. Your recommendations must be specific enough to act on — reference exact proposal sections, exact eval criteria point values, exact competitor names.',
    ctx + webCtx + '\n\nSTRATEGIC ANALYSIS:\n(1) Competitive landscape — who specifically will bid on this, what are their strengths against each eval criterion, where are they vulnerable? Use web intel to verify or update assumptions.\n(2) Win strategy by eval criterion — for each criterion with its point value, what is HGI\'s strongest argument and what is the gap? Be specific to THIS RFP, not generic.\n(3) Domain expertise check — based on web research, is the proposal using the most current and authoritative methodology, terminology, and standards for this domain? What should be upgraded?\n(4) Agency-specific intelligence — what does web research reveal about this agency\'s procurement patterns, budget pressures, leadership priorities, or recent decisions that should inform the proposal?\n(5) ALL actions that would improve our competitive position before deadline, ranked by point impact. Do not limit — include everything that moves the score.',
    2000, true
  );
  if (!a || a.length < 100) return null;
  await storeMemory('research_analysis', opp.id, opp.agency+','+(opp.vertical||'')+',strategy', 'RESEARCH — '+opp.title+':\n'+a, 'analysis');
  return { agent:'research_analysis', opp:opp.title, chars:a.length };
}

async function agentWinnability(opp, ctx) {
  var web = await webSearch((opp.agency||'') + ' ' + (opp.vertical||'professional services') + ' ' + (opp.title||'').slice(0,60) + ' contract award incumbent performance issues ' + (opp.state||'Louisiana') + ' 2024 2025 2026');
  var webCtx = (web && web.length > 30) ? ('\nWEB WINNABILITY DATA:\n' + web.slice(0,1200)) : '';
  var a = await think(
    'You are a senior BD director making a bid/no-bid decision with real money on the line. You have the full proposal draft, competitive intelligence, financial analysis, and organism memory showing what competitors have been found for THIS opportunity. Think like someone who has won and lost hundreds of government contracts.',
    ctx + webCtx + '\n\nBID DECISION ANALYSIS:\n(1) Read the proposal draft critically — if you were an evaluator at this agency, would this proposal win? Using the competitive intelligence and organism memory above, who specifically will bid on THIS opportunity and why are they threats?\n(2) Score HGI against each eval criterion vs the ACTUAL competitors identified in research and memory. Where do we win, where do we lose?\n(3) What specific weaknesses in the current draft would cost us the most points? Be surgical.\n(4) What would flip this to NO-BID? What would raise PWIN by 10+ points?\n(5) Are we priced to win given the competitive field and agency budget?\n(6) FINAL: PWIN X% | GO / CONDITIONAL GO / NO-BID | EVERY action that would increase PWIN, ranked by impact, with estimated point value of each.',
    1500, true
  );
  if (!a || a.length < 80) return null;
  await storeMemory('winnability_agent', opp.id, opp.agency+',winnability,pwin', 'WINNABILITY — '+opp.title+':\n'+a, 'winnability');
  return { agent:'winnability_agent', opp:opp.title, chars:a.length };
}

async function agentQualityGate(opp, ctx) {
  if ((opp.staffing_plan||'').length < 100) return null;
  var webCtx = ''; // cost gated — quality gate audits against RFP scope in memory
  var a = await think(
    'You are a senior proposal compliance reviewer with 20 years experience scoring government proposals. You have the actual proposal draft and the RFP requirements. Your job is to score this proposal the way an evaluator would — ruthlessly, specifically, with exact point values at risk. Do not give generic feedback. Name the section, name the gap, name the points at risk.',
    ctx + webCtx + '\n\nCOMPLIANCE AUDIT — Score each eval criterion as an evaluator would:\n(1) For EACH eval criterion listed in the scope analysis, score the current draft 1-10 and explain specifically what would raise the score. How many of the available points are we likely to capture vs lose?\n(2) List every RFP requirement that is NOT addressed in the proposal draft — by name, by section number\n(3) All required positions — are they named with real people and rates, or are they TBD/placeholder? An evaluator will score named personnel higher than TBD.\n(4) Past performance — are there 3 references with full contact info (name, email, phone)? Is relevance to THIS RFP explicitly stated?\n(5) Required exhibits/forms — which are complete, which need signature, which need notarization, which are missing entirely?\n(6) FINAL VERDICT: Estimated total score out of 100 points | GO / CONDITIONAL GO / NO-GO | ALL deficiencies that cost points, ranked by impact | ALL strengths that score well, ranked by impact',
    2000, true
  );
  if (!a || a.length < 80) return null;
  await storeMemory('quality_gate', opp.id, opp.agency+',quality_gate,compliance', 'QUALITY GATE — '+opp.title+':\n'+a, 'analysis');
  return { agent:'quality_gate', opp:opp.title, chars:a.length };
}

async function agentProposal(opp, ctx) {
  if ((opp.staffing_plan||'').length < 100) return null;
  var vertical = opp.vertical || 'professional services';
  var web = await webSearch((opp.title||'').slice(0,80) + ' ' + vertical + ' best practices methodology industry standards winning government proposal techniques 2025 2026');
  var webCtx = (web && web.length > 30) ? ('\nWEB — DOMAIN BEST PRACTICES & INDUSTRY STANDARDS:\n' + web.slice(0,2000)) : '';
  
  // STEP 1: Identify specific improvements with evaluator scoring logic
  var step1 = await think(
    'You are a senior capture manager and proposal writer who has won hundreds of government contracts. You have the actual proposal draft, the RFP requirements, competitive intelligence, and current industry best practices from web research. Your job is to identify the specific edits that move the most evaluation points. Think like the evaluator — what scores highest?',
    ctx + webCtx + '\n\nSTEP 1 — IMPROVEMENT ANALYSIS:\n(1) Score each proposal section 1-10 against its eval criterion. Where are we losing points?\n(2) For EVERY section scoring below 8: what specific content, language, or evidence would raise the score? Write the actual improved paragraph, not a description of what to write.\n(3) Does the technical approach use the best available domain terminology and methodology from web research, or is it generic? What specific upgrades from industry best practices should be incorporated?\n(4) Competitive differentiation — does each section clearly show why HGI wins over the likely competitors? Where is differentiation weakest?\n(5) What is the single highest-point-value improvement — the one edit that moves the most evaluation points?',
    2500, true
  );
  if (!step1 || step1.length < 100) return null;
  
  // STEP 2: Evaluate the improvements and prioritize
  var step2 = await think(
    'You are reviewing proposed improvements to a government proposal. Prioritize ruthlessly by evaluation point impact. Only the changes that move the score matter.',
    'PROPOSED IMPROVEMENTS:\n' + step1.slice(0,3000) + '\n\nSTEP 2 — PRIORITIZE:\nRank every proposed improvement by estimated point impact (highest first). For each:\n- Which eval criterion does it affect and how many points?\n- How much effort to implement (quick fix vs major rewrite)?\n- Confidence that the improvement actually scores higher with evaluators?\nThen: ALL ACTIONS Christopher should take on the proposal, in priority order by point impact, with the specific text changes ready to paste in. Do not limit to 3 — include every improvement that moves points.',
    1500, true
  );
  
  var combined = 'PROPOSAL IMPROVEMENT — ' + opp.title + ':\n\n=== ANALYSIS ===\n' + step1.slice(0,4000) + '\n\n=== PRIORITIZED ACTIONS ===\n' + (step2||'(evaluation step skipped)').slice(0,3000);
  await storeMemory('proposal_agent', opp.id, opp.agency+','+(vertical)+',proposal_improvement', combined, 'pattern');
  return { agent:'proposal_agent', opp:opp.title, chars:combined.length, steps:2 };
}

async function agentBrief(opp, ctx) {
  if ((opp.stage||'') !== 'proposal' && (opp.stage||'') !== 'pursuing') return null;
  var webCtx = ''; // cost gated — brief uses organism memory + agent output
  var a = await think(
    'HGI team briefing agent. You have the full record. Brief is current state — what the team needs to know and do right now. Functional roles only, never personal names.',
    ctx + webCtx + '\n\nTeam brief: (1) Where we stand — proposal status, key gaps still open (2) What changed since last brief based on new intelligence in memory (3) Open items that must be resolved before submission (4) What each functional role must do this week — specific tasks (5) Overall win confidence and why.',
    700
  );
  if (!a || a.length < 80) return null;
  await storeMemory('brief_agent', opp.id, opp.agency+',briefing', 'BRIEF — '+opp.title+':\n'+a, 'analysis');
  return { agent:'brief_agent', opp:opp.title, chars:a.length };
}

async function agentOppBrief(opp, ctx) {
  var web = await webSearch((opp.agency||'') + ' procurement history leadership budget ' + (opp.vertical||'') + ' Louisiana recent news 2025 2026');
  var webCtx = (web && web.length > 30) ? ('\nWEB AGENCY INTEL:\n' + web.slice(0,1500)) : '';
  var a = await think(
    'HGI opportunity brief agent. You have the complete record including proposal draft. Produce the deepest possible single-opportunity view. Surface what matters most first.',
    ctx + webCtx + '\n\nComplete brief: (1) Everything the organism knows about this agency — budget, procurement patterns, relationships (2) Full competitive field with specific threat levels — who will beat us and how (3) HGI strengths and weaknesses mapped to each eval criterion with point values (4) Financial picture — are we priced to win? (5) Relationship map — who do we know, who do we not (6) Critical path to submission — every remaining milestone with owner.',
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
  var today = getCSTDate();
  var health = activeOpps.map(function(o) { var d = o.due_date ? Math.ceil((new Date(o.due_date)-today)/86400000) : null; return o.title+'|Stage:'+(o.stage||'?')+'|Days:'+(d!==null?d:'?')+'|OPI:'+o.opi_score+'|Proposal:'+(o.staffing_plan||'').length+'chars'; }).join('\n');
  var agencies = activeOpps.map(function(o){return o.agency||'';}).filter(function(a){return a;}).join(' OR ');
  var web = ''; // cost gated
  // was: await webSearch(agencies + ' RFP amendment addendum extension deadline change 2026')
  var webCtx = (web && web.length > 30) ? ('\nWEB DEADLINE/AMENDMENT DATA:\n' + web.slice(0,1200)) : '';
  var a = await think('HGI pipeline health monitor. Flag everything needing immediate action. Be direct and specific.',
    'PIPELINE:\n' + health + webCtx + '\nMEMORY:\n' + memText.slice(0,1200) + '\nFlag: (1) Within 14 days without complete proposal (2) GO stuck same stage 7+ days (3) OPI inconsistent with what organism knows (4) Deadline conflicts (5) Pipeline health score 1-10 with specific reasoning.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('pipeline_scanner', null, 'pipeline_health,deadlines', 'PIPELINE SCANNER:\n'+a, 'analysis');
  return { agent:'pipeline_scanner', chars:a.length };
}

async function agentOpiCalibration(activeOpps, memText) {
  var oppList = activeOpps.map(function(o) { return o.title+'|'+o.agency+'|OPI:'+o.opi_score+'|'+o.vertical+'|Proposal:'+(o.staffing_plan||'').length+'chars|Research:'+(o.research_brief||'').length+'chars'; }).join('\n');
  var webCtx = ''; // cost gated — uses memory + prior intel
  var a = await think('HGI OPI calibration engine. Refine scoring accuracy based on accumulated intelligence and actual proposal state.',
    'OPPS:\n' + oppList + webCtx + '\nINTEL:\n' + memText.slice(0,1800) + '\nFor each: (1) Does OPI reflect full picture including proposal completeness? (2) Specific adjustment recommended and by how much? (3) Factors consistently over/underweighted? (4) What single addition to the scoring model would most improve accuracy?',
    800);
  if (!a || a.length < 80) return null;
  await storeMemory('scanner_opi', null, 'opi_calibration,scoring', 'OPI CALIBRATION:\n'+a, 'pattern');
  return { agent:'scanner_opi', chars:a.length };
}

async function agentContent(memText) {
  var web = await gatedWebSearch('government proposal writing best practices winning federal RFP evaluator preferences persuasive technical writing 2025 2026', 'content_engine');
  var webCtx = (web && web.length > 30) ? ('\nWEB — CURRENT BEST PRACTICES:\n' + web.slice(0,1500)) : '';
  var a = await think('You are a proposal writing strategist who has helped firms win billions in government contracts. Your job is not to enforce a house style — it is to ensure every sentence in every proposal is the most persuasive, evaluator-friendly language possible for that specific domain. You combine industry best practices with HGI-specific content to produce writing that scores highest.',
    'MEMORY (includes proposal excerpts and organism patterns):\n' + memText.slice(0,2500) + webCtx + '\nANALYZE THE CURRENT PROPOSAL DRAFTS IN MEMORY:\n(1) Which sections have the strongest evaluator-ready language? What makes them strong?\n(2) Which sections read like generic AI output or boilerplate? Cite specific passages and rewrite them.\n(3) For each active opportunity, what domain-specific terminology should the proposal be using based on web research? Are we using the right terms?\n(4) What persuasion techniques from winning government proposals (per web research) are we NOT using?\n(5) Provide before/after rewrites for EVERY passage that needs improvement — take the actual sentence from the current draft and show how it should read to score highest. Do not limit to 3 — rewrite everything that can be stronger.',
    1500, true);
  if (!a || a.length < 80) return null;
  await storeMemory('content_engine', null, 'voice,style', 'CONTENT ENGINE:\n'+a, 'pattern');
  return { agent:'content_engine', chars:a.length };
}

async function agentBench(activeOpps, memText) {
  var oppCtx = activeOpps.map(function(o){ return o.title+'|'+(o.vertical||'')+'|Stage:'+(o.stage||'')+'|Due:'+(o.due_date||'TBD'); }).join('\n');
  var webCtx = ''; // cost gated — uses memory + prior intel
  var a = await think('HGI recruiting and bench agent. Track staffing gaps before they block bids.',
    'ACTIVE PURSUITS:\n' + oppCtx + webCtx + '\nHGI STAFF: 67 FT + 43 contract. Named: Louis Resweber (PD), Berron (PA SME), April Gloston (HM), Klunk (Financial), Wiltz (Documentation).\nINTEL:\n' + memText.slice(0,1000) + '\nFor each pursuit: (1) Roles needed vs available (2) Best named staff fits (3) Where teaming needed (4) Recurring gaps across multiple bids (5) Recruiting action needed before next deadline.',
    800);
  if (!a || a.length < 80) return null;
  await storeMemory('recruiting_bench', null, 'staffing,bench,gaps', 'BENCH:\n'+a, 'analysis');
  return { agent:'recruiting_bench', chars:a.length };
}

async function agentKb(memText) {
  var webCtx = ''; // cost gated — KB agent uses internal data
  var a = await think('HGI knowledge base agent. Identify most impactful KB gaps given active proposals. CRITICAL: HGI web data is often stale or wrong — flag any conflicts with known facts but do not treat web data as authoritative over the KB.',
    'HGI BUSINESS UNIVERSE: ' + HGI_CONTEXT.slice(0, 800) + '\nKB STATUS: 21 docs, 350+ chunks. Strong: GOHSEP(149), TPCIGA(94), HTHA(22). Weak: 6 image-PDFs, 2 docx zero chunks. Corporate Profile and Capabilities Statement both extracted.\nACTIVE PIPELINE VERTICALS: ' + activeOpps.map(function(o){return o.vertical||'unknown';}).join(', ') + '\nMEMORY:\n' + memText.slice(0,1500) + webCtx + '\nIdentify: (1) KB content most referenced in current proposals (2) Which of HGI full business lines have NO KB coverage — mediation, settlement admin, staff aug, call centers, DEI, AFWA, contact tracing? (3) Critical past performance missing or thin across ALL verticals (4) Technical methodology gaps hurting proposal quality (5) Single document Lou should send next and exactly what gap it fills.',
    700);
  if (!a || a.length < 80) return null;
  await storeMemory('knowledge_base_agent', null, 'kb_gaps,kb_health', 'KB AGENT:\n'+a, 'pattern');
  return { agent:'knowledge_base_agent', chars:a.length };
}

async function agentScraper(activeOpps, memText) {
  var webCtx = ''; // cost gated — scraper insights uses internal pipeline data
  var a = await think('HGI scraper health monitor. Track source yield and ROI. Identify new procurement portals HGI should monitor.',
    'PIPELINE:\n' + activeOpps.map(function(o){ return (o.title||'').slice(0,50)+'|OPI:'+o.opi_score+'|Source:Central Bidding'; }).join('\n') + '\nMEMORY:\n' + memText.slice(0,800) + webCtx + '\nAnalyze: (1) Which sources produce GO-quality vs noise (2) Central Bidding pattern analysis (3) Highest-ROI new source given active verticals (4) Degradation signs (5) Keyword adjustments per source.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('scraper_insights', null, 'scraper_health,source_roi', 'SCRAPER:\n'+a, 'pattern');
  return { agent:'scraper_insights', chars:a.length };
}

async function agentExecBrief(activeOpps, memText) {
  var webCtx = ''; // cost gated — exec brief synthesizes from memory
  var a = await think('HGI executive briefing agent for Lou Resweber (CEO) and Larry Oney (Chairman). Concise, no noise. They need decisions, not status.',
    'PIPELINE:\n' + activeOpps.map(function(o){ return o.title+'|'+o.agency+'|OPI:'+o.opi_score+'|Due:'+(o.due_date||'TBD')+'|Stage:'+(o.stage||'?'); }).join('\n') + webCtx + '\nINTEL:\n' + memText.slice(0,1800) + '\nDigest: (1) Pipeline summary and financial stakes (2) Decisions needed from Lou or Larry this week (3) Opportunities needing executive-level relationships (4) Where are we most likely to win and why (5) What needs their visibility that Christopher has not surfaced.',
    700);
  if (!a || a.length < 80) return null;
  await storeMemory('executive_brief_agent', null, 'executive_brief,digest', 'EXEC BRIEF:\n'+a, 'analysis');
  return { agent:'executive_brief_agent', chars:a.length };
}

async function agentDesign(activeOpps, memText) {
  var webCtx = ''; // cost gated — design agent uses memory + brand standards
  var a = await think('HGI design and visual agent. Every HGI output should look like it came from a firm that manages billion-dollar programs.',
    'ACTIVE PROPOSALS:\n' + activeOpps.filter(function(o){ return (o.staffing_plan||'').length > 100; }).map(function(o){ return o.title+'|'+o.agency+'|Due:'+(o.due_date||'TBD'); }).join('\n') + '\nMEMORY:\n' + memText.slice(0,1000) + '\nAnalyze: (1) Visual structure that would impress evaluators for each active proposal (2) Sections needing tables, org charts, compliance matrices (3) Brand standards — gold/navy, professional typography (4) Visual differentiators vs CDR Maguire and Tetra Tech (5) Single highest-priority visual improvement.',
    600);
  if (!a || a.length < 80) return null;
  await storeMemory('design_visual', null, 'visual,branding,format', 'DESIGN:\n'+a, 'pattern');
  return { agent:'design_visual', chars:a.length };
}

async function agentDashboard(activeOpps, allMemories, memText) {
  var webCtx = ''; // cost gated — dashboard synthesizes from all agent output
  var a = await think('HGI dashboard agent. Morning briefing for Christopher. What needs his attention vs what is running fine. Include any breaking news that affects active pursuits.',
    'SYSTEM: ' + activeOpps.length + ' active opps | ' + allMemories.length + ' memories in brain\nPIPELINE:\n' + activeOpps.map(function(o){ return o.title+'|OPI:'+o.opi_score+'|Stage:'+(o.stage||'?')+'|Due:'+(o.due_date||'?'); }).join('\n') + webCtx + '\nMEMORY:\n' + memText.slice(0,1500) + '\nSynthesize: (1) Organism health — how well is every agent contributing? (2) Which opportunities need Christopher today vs running autonomously (3) Most important single thing Christopher should know right now (4) Highest-impact improvement this week.',
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

  function oppMem(opp, tier) {
    var charLimit = (tier === 'full') ? 600 : 250;
    return allMemories.filter(function(m) {
      return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||'');
    }).map(function(m) { return (m.observation||'').slice(0, charLimit); }).join('\n\n');
  }

  // ═══ ALL AGENTS FIRE IN PARALLEL — tiered context ═══
  var perOppPromises = [];
  for (var i = 0; i < activeOpps.length; i++) {
    (function(opp) {
      var memFull = oppMem(opp, 'full');
      var memCompact = oppMem(opp, 'compact');
      var ctxFull = buildCtx(opp, memFull, 'full');
      var ctxCompact = buildCtx(opp, memCompact, 'compact');
      // Sonnet agents (intel, research, winnability, quality_gate, proposal) moved to sonnet-work.js
      // They silently fail here from rate limiting — sonnet-work runs them sequentially at 12:15 CST
      perOppPromises.push(safe(function(){ return agentOppBrief(opp, ctxFull); }));
      // Haiku routine agents — compact context
      perOppPromises.push(safe(function(){ return agentCrm(opp, ctxCompact); }));
      perOppPromises.push(safe(function(){ return agentFinancial(opp, ctxCompact); }));
      perOppPromises.push(safe(function(){ return agentBrief(opp, ctxCompact); }));
    })(activeOpps[i]);
  }
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
    if (allResults[j] && allResults[j]._error) results.errors.push(allResults[j]);
    else if (allResults[j]) results.work_completed.push(allResults[j]);
  }

  // ═══ SELF-AWARENESS RUNS LAST — sees everything all agents produced ═══
  var selfWebCtx = ''; // cost gated — self-awareness synthesizes from agent output
  var selfResult = await safe(async function() {
    var a = await think(
      'HGI self-awareness engine. You see the full picture — every agent result, every memory, every opportunity. Identify patterns and the single highest-leverage improvement. Compare against industry best practices from web research.',
      'WORK COMPLETED THIS RUN:\n' + JSON.stringify(results.work_completed.slice(0,20)).slice(0,2000) + '\nERRORS: ' + results.errors.length + '\nTOTAL MEMORIES: ' + allMemories.length + '\nMEMORY STATE:\n' + memText.slice(0,1500) + selfWebCtx + '\nAnalyze: (1) Patterns emerging across all opportunities and all agents (2) Which agents produced highest-value intelligence today (3) What data gaps are costing HGI the most right now (4) Single improvement with highest win rate impact (5) Contradictions or anomalies — anything that does not add up.',
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