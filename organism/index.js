// HGI Living Organism V2 — Multi-Agent Intelligence Session Engine
// Phase 3: 6 agents wired — Intelligence, Financial, Winnability, CRM, Quality Gate, Self-Awareness
// 37 agents total. One shared brain. All into all.

import http from 'http';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

const supabase = createClient(SB_URL, SB_KEY);
const anthropic = new Anthropic({ apiKey: AK });

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'alive', uptime_seconds: Math.floor(process.uptime()), timestamp: new Date().toISOString(), version: 'V2.3.0-six-agents', agents_active: 6 }));
    return;
  }
  if (req.url === '/run-session' && req.method === 'POST') {
    runSession('manual').catch(console.error);
    res.writeHead(202);
    res.end(JSON.stringify({ accepted: true, message: 'Session triggered - 6 agents firing' }));
    return;
  }
  res.writeHead(200);
  res.end(JSON.stringify({ status: 'alive', uptime: Math.floor(process.uptime()) }));
});

server.listen(PORT, () => log('Health server listening on port ' + PORT));

function log(msg) { console.log('[' + new Date().toISOString() + '] [ORGANISM] ' + msg); }

async function storeMemory(agent, oppId, tags, observation, memType) {
  try {
    await supabase.from('organism_memory').insert({
      id: agent + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      agent: agent, opportunity_id: oppId || null,
      entity_tags: tags, observation: observation,
      memory_type: memType || 'analysis',
      created_at: new Date().toISOString()
    });
  } catch(e) { log('Memory error: ' + e.message); }
}

async function claudeCall(system, prompt, maxTokens) {
  var response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens || 1200,
    system: system,
    messages: [{ role: 'user', content: prompt }]
  });
  return (response.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
}

async function loadState() {
  log('Loading system state...');
  var results = await Promise.all([
    supabase.from('opportunities').select('*').eq('status','active').order('opi_score', { ascending: false }).limit(10),
    supabase.from('organism_memory').select('*').neq('memory_type','decision_point').order('created_at', { ascending: false }).limit(100),
    supabase.from('competitive_intelligence').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('relationship_graph').select('*').order('updated_at', { ascending: false }).limit(50),
  ]);
  var state = { pipeline: results[0].data||[], memories: results[1].data||[], competitive: results[2].data||[], relationships: results[3].data||[] };
  log('State loaded: ' + state.pipeline.length + ' opps | ' + state.memories.length + ' memories | ' + state.competitive.length + ' comp intel | ' + state.relationships.length + ' relationships');
  return state;
}

function buildCtx(state) {
  var memText = state.memories.slice(0,30).map(function(m) { return '[' + (m.agent||'?') + ']: ' + (m.observation||'').slice(0,200); }).join('\n\n');
  var compText = state.competitive.slice(0,15).map(function(c) { return (c.competitor_name||'?') + ' | ' + (c.agency||'') + ': ' + (c.strategic_notes||'').slice(0,120); }).join('\n');
  var relText = state.relationships.slice(0,15).map(function(r) { return (r.contact_name||'?') + ' | ' + (r.organization||'') + ' | ' + (r.relationship_strength||'cold'); }).join('\n');
  return { memText: memText, compText: compText, relText: relText };
}

function oppBase(opp) {
  return 'OPPORTUNITY: ' + (opp.title||'unknown') +
    '\nAgency: ' + (opp.agency||'unknown') +
    '\nVertical: ' + (opp.vertical||'unknown') +
    '\nOPI: ' + (opp.opi_score||0) + ' | Stage: ' + (opp.stage||'identified') +
    '\nDue: ' + (opp.due_date||'TBD') + ' | Est Value: ' + (opp.estimated_value||'unknown') +
    '\nScope: ' + (opp.scope_analysis||'').slice(0,500) +
    '\nResearch Brief: ' + (opp.research_brief||'').slice(0,600);
}

var HGI = 'HGI Global (Hammerman and Gainer LLC). ~95 years. 100pct minority-owned. 67 FT + 43 contract. ' +
  'Verticals: Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management. ' +
  'Past perf: Road Home $67M/$13B+ program, HAP $950M, Restore Louisiana $42.3M, Rebuild NJ $67.7M, TPSD $2.96M completed 2022-2025, St. John Sheriff $788K, BP GCCF $1.65M. ' +
  'Rates (fully burdened/hr): Principal $220, Program Director $210, SME $200, Sr PM $180, PM $155, Grant Writer $145, Admin $65. ' +
  'No current direct federal contract. All work through state/local agencies.';

// ── AGENT 1: INTELLIGENCE ENGINE ──────────────────────────────────
async function agentIntelligence(opp, ctx) {
  log('INTEL: ' + (opp.title||'?').slice(0,50));
  var prompt = HGI + '\n\n' + oppBase(opp) +
    '\n\nCOMP INTEL STORE:\n' + ctx.compText +
    '\n\nRELATIONSHIPS:\n' + ctx.relText +
    '\n\nMEMORY:\n' + ctx.memText.slice(0,1000) +
    '\n\nMISSION: (1) Named competitors most likely to bid and why each is a threat (2) Incumbent if known (3) Agency procurement patterns (4) HGI strongest angle (5) Intelligence gaps (6) Single highest-leverage action THIS WEEK (7) Updated PWIN 0-100pct. Be specific. Real money on the line.';
  var out = await claudeCall('You are HGI Intelligence Engine, agent 1 of 37. Competitive analyst. Your findings compound across all 36 others. Never fabricate.', prompt, 1500);
  if (!out || out.length < 100) return null;
  log('INTEL complete: ' + out.length + ' chars');
  await storeMemory('intelligence_engine', opp.id, (opp.agency||'') + ',competitive_intel', 'INTEL - ' + (opp.title||'').slice(0,50) + ':\n' + out, 'competitive_intel');
  await supabase.from('opportunities').update({ research_brief: out.slice(0,8000), last_updated: new Date().toISOString() }).eq('id', opp.id);
  return { agent: 'intelligence_engine', opp: opp.title, chars: out.length };
}

// ── AGENT 2: FINANCIAL ANALYST ────────────────────────────────────
async function agentFinancial(opp, ctx) {
  log('FINANCIAL: ' + (opp.title||'?').slice(0,50));
  var prompt = HGI + '\n\n' + oppBase(opp) +
    '\n\nCOMP INTEL (includes pricing data from Intelligence Engine):\n' + ctx.compText +
    '\n\nMEMORY (includes Intel Engine findings):\n' + ctx.memText.slice(0,1200) +
    '\n\nMISSION: (1) Real comparable contract award amounts - name agency, amount, period, scope (2) Does our current estimated value match market reality? (3) Price-to-win recommendation based on competitive field (4) Three independent pricing methods with visible math - staffing-based, comp-based, pct-of-program (5) LOW/MID/HIGH range clearly labeled (6) Base period only - option years shown separately as upside (7) Any pricing risks for this specific agency type.';
  var out = await claudeCall('You are HGI Financial Agent, agent 2 of 37. CFO-level analyst. You read what the Intelligence Engine found and build on it. Show your math. Never fabricate dollar amounts.', prompt, 1500);
  if (!out || out.length < 100) return null;
  log('FINANCIAL complete: ' + out.length + ' chars');
  await storeMemory('financial_agent', opp.id, (opp.agency||'') + ',pricing_benchmark', 'FINANCIAL - ' + (opp.title||'').slice(0,50) + ':\n' + out, 'pricing_benchmark');
  await supabase.from('opportunities').update({ financial_analysis: out.slice(0,8000), last_updated: new Date().toISOString() }).eq('id', opp.id);
  return { agent: 'financial_agent', opp: opp.title, chars: out.length };
}

// ── AGENT 3: WINNABILITY ──────────────────────────────────────────
async function agentWinnability(opp, ctx) {
  log('WINNABILITY: ' + (opp.title||'?').slice(0,50));
  var prompt = HGI + '\n\n' + oppBase(opp) +
    '\n\nINTEL ENGINE FINDINGS (read before scoring):\n' + ctx.memText.slice(0,1000) +
    '\n\nFINANCIAL ANALYSIS:\n' + (opp.financial_analysis||'not yet available').slice(0,400) +
    '\n\nMISSION: You are a senior BD director with real budget on the line. (1) Score HGI against each eval criterion vs ACTUAL named competitors from intel findings (2) What specific weaknesses in the current pursuit would cost the most points (3) What would flip this to NO-BID? What would raise PWIN by 10+ points? (4) Are we priced to win given the competitive field? (5) FINAL: PWIN X pct | GO / CONDITIONAL GO / NO-BID | EVERY action that would increase PWIN ranked by impact.';
  var out = await claudeCall('You are HGI Winnability Agent, agent 3 of 37. Senior BD director. You read Intel and Financial findings and make the real bid decision. Be ruthless and specific.', prompt, 1500);
  if (!out || out.length < 100) return null;
  log('WINNABILITY complete: ' + out.length + ' chars');
  await storeMemory('winnability_agent', opp.id, (opp.agency||'') + ',winnability,pwin', 'WINNABILITY - ' + (opp.title||'').slice(0,50) + ':\n' + out, 'winnability');
  await supabase.from('opportunities').update({ capture_action: out.slice(0,8000), last_updated: new Date().toISOString() }).eq('id', opp.id);
  return { agent: 'winnability_agent', opp: opp.title, chars: out.length };
}

// ── AGENT 4: CRM / RELATIONSHIP ───────────────────────────────────
async function agentCRM(opp, ctx) {
  log('CRM: ' + (opp.title||'?').slice(0,50));
  var prompt = HGI + '\n\n' + oppBase(opp) +
    '\n\nRELATIONSHIP GRAPH:\n' + ctx.relText +
    '\n\nINTEL FINDINGS:\n' + ctx.memText.slice(0,800) +
    '\n\nMISSION: (1) Named decision-makers - who evaluates and awards this contract (2) Relationship status - do we know anyone at this agency? How warm? (3) Who specifically at HGI should call or email this week - name, role, what to say, what outcome to drive (4) Cross-agency connections - do we know anyone who knows someone here (5) Best outreach approach given agency culture and procurement stage (6) What relationship move would most improve our competitive position before deadline.';
  var out = await claudeCall('You are HGI CRM Agent, agent 4 of 37. Relationship intelligence specialist. You find the humans behind the procurement and tell HGI exactly who to call and what to say.', prompt, 1200);
  if (!out || out.length < 100) return null;
  log('CRM complete: ' + out.length + ' chars');
  await storeMemory('crm_agent', opp.id, (opp.agency||'') + ',contacts,relationship', 'CRM - ' + (opp.title||'').slice(0,50) + ':\n' + out, 'relationship');
  try {
    await supabase.from('relationship_graph').insert({ id: 'crm-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), organization: opp.agency||'', notes: out.slice(0,1500), relationship_strength: 'cold', source_agent: 'crm_agent', opportunity_id: opp.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  } catch(e) {}
  return { agent: 'crm_agent', opp: opp.title, chars: out.length };
}

// ── AGENT 5: QUALITY GATE ─────────────────────────────────────────
async function agentQualityGate(opp, ctx) {
  if ((opp.staffing_plan||'').length < 100 && (opp.scope_analysis||'').length < 200) return null;
  log('QUALITY GATE: ' + (opp.title||'?').slice(0,50));
  var prompt = HGI + '\n\n' + oppBase(opp) +
    '\n\nPROPOSAL DRAFT (if exists):\n' + (opp.staffing_plan||'No proposal draft yet').slice(0,2000) +
    '\n\nWINNABILITY FINDINGS:\n' + (opp.capture_action||'').slice(0,400) +
    '\n\nMISSION: Score this pursuit like an evaluator. (1) For EACH eval criterion in the scope analysis, score current state 1-10 and state specifically what would raise it (2) Every RFP requirement NOT yet addressed by name (3) Required positions - named with real people and rates, or TBD placeholder? (4) Past performance - 3 refs with full contact info? Relevance to THIS RFP stated? (5) Required exhibits/forms - complete, missing, needs signature? (6) VERDICT: Estimated score out of 100 | GO/CONDITIONAL GO/NO-GO | ALL deficiencies ranked by point impact.';
  var out = await claudeCall('You are HGI Quality Gate Agent, agent 5 of 37. Senior proposal compliance reviewer. You score proposals like an evaluator would. Be ruthless. Name the section, name the gap, name the points at risk.', prompt, 1500);
  if (!out || out.length < 100) return null;
  log('QUALITY GATE complete: ' + out.length + ' chars');
  await storeMemory('quality_gate', opp.id, (opp.agency||'') + ',quality_gate,compliance', 'QUALITY GATE - ' + (opp.title||'').slice(0,50) + ':\n' + out, 'analysis');
  return { agent: 'quality_gate', opp: opp.title, chars: out.length };
}

// ── AGENT 6: SELF-AWARENESS (runs last, sees everything) ──────────
async function agentSelfAwareness(state, sessionResults, ctx) {
  log('SELF-AWARENESS: analyzing full session output...');
  var resultsSummary = sessionResults.map(function(r) { return (r ? r.agent + ' completed ' + r.chars + ' chars on ' + (r.opp||'?').slice(0,40) : 'agent skipped'); }).join('\n');
  var prompt = HGI +
    '\n\nSESSION RESULTS (all agents that just ran):\n' + resultsSummary +
    '\n\nPIPELINE STATUS:\n' + state.pipeline.map(function(o) { return (o.title||'?').slice(0,50) + ' OPI:' + o.opi_score + ' ' + (o.stage||'?'); }).join('\n') +
    '\n\nACCUMULATED MEMORY (' + state.memories.length + ' total):\n' + ctx.memText.slice(0,1500) +
    '\n\nMISSION: You see the full picture - every agent result, every memory, every opportunity. (1) What patterns are emerging across all opportunities that individual agents missed? (2) Which agents produced highest-value intelligence this session? (3) What single improvement to the organism would most improve HGI win rates? (4) What data gaps are costing HGI the most right now? (5) Any contradictions between agents - where did Intel and Winnability disagree? (6) The one thing Christopher must do this week to most improve competitive position across the entire pipeline.';
  var out = await claudeCall('You are HGI Self-Awareness Engine, agent 6 of 37. You run last and see everything all other agents produced. You identify patterns no individual agent can see. You are the organism reflecting on itself.', prompt, 1500);
  if (!out || out.length < 100) return null;
  log('SELF-AWARENESS complete: ' + out.length + ' chars');
  await storeMemory('self_awareness', null, 'system_health,self_assessment,patterns', 'SELF-AWARENESS SESSION COMPLETE:\n' + out, 'pattern');
  return { agent: 'self_awareness', chars: out.length };
}


// ── AGENT 7: DISCOVERY AGENT ──────────────────────────────────────
async function agentDiscovery(state, ctx) {
  log('DISCOVERY: scanning for pre-solicitation signals...');
  var oppSummary = state.pipeline.map(function(o) { return (o.title||'?').slice(0,50) + ' | ' + (o.vertical||'') + ' | OPI:' + o.opi_score; }).join('\n');
  var prompt = HGI + '\n\nACTIVE PIPELINE:\n' + oppSummary + '\n\nMEMORY:\n' + ctx.memText.slice(0,800) +
    '\n\nMISSION: (1) Pre-solicitation signals - budget appropriations, agency announcements suggesting upcoming RFPs in HGI verticals (2) Sources HGI is NOT monitoring that carry procurement in disaster recovery, TPA/claims, workforce, housing, grant management (3) Agencies in LA/TX/FL/MS/AL/GA with expiring contracts in HGI verticals - prime recompete targets (4) FEMA disaster declarations in last 30 days that will generate recovery procurement (5) Market signals - budget cycles, legislative action, federal funding announcements that predict future HGI opportunities (6) Single highest-value new opportunity source HGI should add right now.';
  var out = await claudeCall('You are HGI Discovery Agent, agent 7 of 37. You find what is coming before it is posted. Your findings feed every other agent.', prompt, 1200);
  if (!out || out.length < 100) return null;
  log('DISCOVERY complete: ' + out.length + ' chars');
  await storeMemory('discovery_agent', null, 'discovery,pre_solicitation,market_signals', 'DISCOVERY:\n' + out, 'pattern');
  return { agent: 'discovery_agent', chars: out.length };
}

// ── AGENT 8: PIPELINE SCANNER ─────────────────────────────────────
async function agentPipelineScanner(state, ctx) {
  log('PIPELINE SCANNER: health check...');
  var today = new Date();
  var health = state.pipeline.map(function(o) {
    var daysLeft = o.due_date ? Math.ceil((new Date(o.due_date) - today) / 86400000) : null;
    return (o.title||'?').slice(0,50) + ' | Stage:' + (o.stage||'?') + ' | Days:' + (daysLeft !== null ? daysLeft : 'unknown') + ' | OPI:' + o.opi_score + ' | Proposal:' + (o.staffing_plan||'').length + 'chars';
  }).join('\n');
  var prompt = HGI + '\n\nPIPELINE STATUS:\n' + health + '\n\nMEMORY:\n' + ctx.memText.slice(0,600) +
    '\n\nMISSION: (1) Flag any opportunity within 14 days of deadline without complete proposal (2) Flag any GO opportunity stuck in same stage 7+ days (3) OPI scores inconsistent with what organism now knows (4) Deadline conflicts where two opportunities require simultaneous proposal work (5) Pipeline health score 1-10 with reasoning (6) Single most urgent action to prevent missed deadline or lost opportunity.';
  var out = await claudeCall('You are HGI Pipeline Scanner, agent 8 of 37. You watch deadlines and anomalies. You flag everything needing immediate action.', prompt, 800);
  if (!out || out.length < 100) return null;
  log('PIPELINE SCANNER complete: ' + out.length + ' chars');
  await storeMemory('pipeline_scanner', null, 'pipeline_health,deadlines', 'PIPELINE SCANNER:\n' + out, 'analysis');
  return { agent: 'pipeline_scanner', chars: out.length };
}

// ── AGENT 9: OPI CALIBRATION ──────────────────────────────────────
async function agentOPICalibration(state, ctx) {
  log('OPI CALIBRATION: reviewing scores...');
  var oppList = state.pipeline.map(function(o) { return (o.title||'?').slice(0,50) + ' | OPI:' + o.opi_score + ' | ' + (o.vertical||'') + ' | Stage:' + (o.stage||'?') + ' | Proposal:' + (o.staffing_plan||'').length + 'chars'; }).join('\n');
  var prompt = HGI + '\n\nOPPORTUNITIES WITH CURRENT OPI SCORES:\n' + oppList + '\n\nINTELLIGENCE AND WINNABILITY FINDINGS:\n' + ctx.memText.slice(0,1500) +
    '\n\nMISSION: Based on everything the organism now knows, (1) For each opportunity - does current OPI reflect full competitive picture? Recommend adjustment with specific reasoning (2) Which OPI factors are consistently over/under-weighted (3) Single addition to OPI scoring model that would most improve accuracy (4) Any opportunity that should be escalated to NO-BID based on what agents found today.';
  var out = await claudeCall('You are HGI OPI Calibration Agent, agent 9 of 37. You refine scoring accuracy. Every recalibration makes future scoring smarter.', prompt, 800);
  if (!out || out.length < 100) return null;
  log('OPI CALIBRATION complete: ' + out.length + ' chars');
  await storeMemory('scanner_opi', null, 'opi_calibration,scoring', 'OPI CALIBRATION:\n' + out, 'pattern');
  return { agent: 'scanner_opi', chars: out.length };
}

// ── AGENT 10: CONTENT ENGINE ──────────────────────────────────────
async function agentContentEngine(state, ctx) {
  log('CONTENT ENGINE: analyzing proposal language...');
  var drafts = state.pipeline.filter(function(o) { return (o.staffing_plan||'').length > 200; }).map(function(o) { return (o.title||'?').slice(0,40) + ':\n' + (o.staffing_plan||'').slice(0,400); }).join('\n\n---\n\n');
  if (!drafts) { log('CONTENT ENGINE: no drafts to review'); return null; }
  var prompt = HGI + '\n\nPROPOSAL DRAFT EXCERPTS:\n' + drafts +
    '\n\nMISSION: (1) Which sections have strongest evaluator-ready language and why (2) Which sections read like generic AI output - rewrite them specifically (3) Domain-specific terminology each proposal should be using but is not (4) Before/after rewrites for every passage needing improvement (5) Flag every passive voice sentence and rewrite it (6) Single highest-impact language improvement across all drafts.';
  var out = await claudeCall('You are HGI Content Engine, agent 10 of 37. You make every sentence the most persuasive evaluator-friendly language possible. You optimize for scores not style.', prompt, 1500);
  if (!out || out.length < 100) return null;
  log('CONTENT ENGINE complete: ' + out.length + ' chars');
  await storeMemory('content_engine', null, 'voice,style,proposal_language', 'CONTENT ENGINE:\n' + out, 'pattern');
  return { agent: 'content_engine', chars: out.length };
}

// ── AGENT 11: RECRUITING AND BENCH ───────────────────────────────
async function agentRecruiting(state, ctx) {
  log('RECRUITING: staffing gap analysis...');
  var oppCtx = state.pipeline.map(function(o) { return (o.title||'?').slice(0,50) + ' | ' + (o.vertical||'') + ' | Stage:' + (o.stage||'') + ' | Due:' + (o.due_date||'TBD'); }).join('\n');
  var prompt = HGI + '\n\nACTIVE PURSUITS:\n' + oppCtx +
    '\n\nHGI NAMED STAFF: Louis Resweber (Program Director), Berron (PA SME), April Gloston (HM Specialist), Klunk (Financial/Grant), Wiltz (Documentation Manager).' +
    '\n\nMEMORY:\n' + ctx.memText.slice(0,600) +
    '\n\nMISSION: (1) For each pursuit - required positions vs available named staff, identify gaps (2) Where teaming is needed (3) Recurring gaps across multiple pursuits simultaneously (4) Certifications or qualifications HGI lacks that cost points (5) Single recruiting or teaming action before next deadline (6) Any pursuit where staffing gap alone should trigger NO-BID.';
  var out = await claudeCall('You are HGI Recruiting and Bench Agent, agent 11 of 37. You track staffing gaps before they block bids. You flag before it is too late.', prompt, 800);
  if (!out || out.length < 100) return null;
  log('RECRUITING complete: ' + out.length + ' chars');
  await storeMemory('recruiting_bench', null, 'staffing,bench,gaps', 'RECRUITING:\n' + out, 'analysis');
  return { agent: 'recruiting_bench', chars: out.length };
}

// ── AGENT 12: KNOWLEDGE BASE AGENT ───────────────────────────────
async function agentKnowledgeBase(state, ctx) {
  log('KB AGENT: gap analysis...');
  var verticals = state.pipeline.map(function(o) { return o.vertical || 'unknown'; }).join(', ');
  var prompt = HGI + '\n\nACTIVE PIPELINE VERTICALS: ' + verticals +
    '\n\nKB STATUS: 21 docs, 350+ chunks. Strong: GOHSEP(149), TPCIGA(94), HTHA v4(22). Weak: 6 image-PDFs minimal extraction, 2 docx zero chunks.' +
    '\n\nMEMORY:\n' + ctx.memText.slice(0,800) +
    '\n\nMISSION: (1) Which pursuits are weakest on KB-supported past performance (2) HGI business lines with NO KB coverage - mediation, settlement admin, staff aug, call centers, DEI (3) Critical past performance documentation missing across verticals (4) Technical methodology gaps hurting proposal quality now (5) Single document Lou Resweber should send next and exactly what gap it fills (6) KB health score 1-10 for each active pursuit vertical.';
  var out = await claudeCall('You are HGI Knowledge Base Agent, agent 12 of 37. You identify missing institutional knowledge. Every gap you find and fill makes future proposals stronger.', prompt, 800);
  if (!out || out.length < 100) return null;
  log('KB AGENT complete: ' + out.length + ' chars');
  await storeMemory('knowledge_base_agent', null, 'kb_gaps,kb_health', 'KB AGENT:\n' + out, 'pattern');
  return { agent: 'knowledge_base_agent', chars: out.length };
}

// ── AGENT 13: SCRAPER INSIGHTS ────────────────────────────────────
async function agentScraperInsights(state, ctx) {
  log('SCRAPER INSIGHTS: source analysis...');
  var sourceBreakdown = state.pipeline.map(function(o) { return (o.title||'?').slice(0,40) + ' | Source:' + (o.source||'unknown') + ' | OPI:' + o.opi_score; }).join('\n');
  var prompt = HGI + '\n\nPIPELINE BY SOURCE:\n' + sourceBreakdown +
    '\n\nACTIVE SOURCES: Central Bidding (8AM+8PM CST), LaPAC (every 6min), SAM.gov (every 12hr), Grants.gov (4x daily).' +
    '\n\nMEMORY:\n' + ctx.memText.slice(0,500) +
    '\n\nMISSION: (1) Which sources produce GO-quality vs noise (2) Source gaps - portals in LA/TX/FL/MS/AL/GA carrying HGI vertical work not currently monitored (3) Keyword gaps causing HGI business lines to generate zero results (4) Any source showing degradation signs (5) Single highest-ROI new source to add given active pipeline verticals.';
  var out = await claudeCall('You are HGI Scraper Insights Agent, agent 13 of 37. You track source yield and identify where opportunities are being missed.', prompt, 800);
  if (!out || out.length < 100) return null;
  log('SCRAPER INSIGHTS complete: ' + out.length + ' chars');
  await storeMemory('scraper_insights', null, 'scraper_health,source_roi', 'SCRAPER INSIGHTS:\n' + out, 'pattern');
  return { agent: 'scraper_insights', chars: out.length };
}

// ── AGENT 14: EXECUTIVE BRIEF ─────────────────────────────────────
async function agentExecutiveBrief(state, ctx) {
  log('EXECUTIVE BRIEF: preparing for Lou and Larry...');
  var pipelineSummary = state.pipeline.map(function(o) { return (o.title||'?').slice(0,50) + ' | OPI:' + o.opi_score + ' | Due:' + (o.due_date||'TBD') + ' | Stage:' + (o.stage||'?'); }).join('\n');
  var prompt = HGI + '\n\nPIPELINE:\n' + pipelineSummary + '\n\nINTELLIGENCE THIS SESSION:\n' + ctx.memText.slice(0,1500) +
    '\n\nMISSION: Brief Lou Resweber (CEO) and Larry Oney (Chairman). Concise. No noise. Decisions not status. (1) Pipeline summary - total opps, combined estimated value, realistic win probability weighted by OPI (2) Decisions needed from Lou or Larry this week specifically - name decision, deadline, stakes (3) Opportunities needing executive-level relationship intervention (4) Where HGI is most likely to win this quarter and why (5) Single biggest risk to revenue right now (6) What needs their visibility that has not been surfaced yet.';
  var out = await claudeCall('You are HGI Executive Brief Agent, agent 14 of 37. You brief the CEO and Chairman. Concise. Actionable. Every word earns its place.', prompt, 1000);
  if (!out || out.length < 100) return null;
  log('EXECUTIVE BRIEF complete: ' + out.length + ' chars');
  await storeMemory('executive_brief_agent', null, 'executive_brief,digest', 'EXECUTIVE BRIEF:\n' + out, 'analysis');
  return { agent: 'executive_brief_agent', chars: out.length };
}

// ── AGENT 15: PROPOSAL WRITER ─────────────────────────────────────
async function agentProposalWriter(opp, ctx) {
  if ((opp.staffing_plan||'').length < 300) return null;
  log('PROPOSAL WRITER: ' + (opp.title||'?').slice(0,50));
  var prompt = HGI + '\n\n' + oppBase(opp) +
    '\n\nCURRENT PROPOSAL DRAFT:\n' + (opp.staffing_plan||'').slice(0,4000) +
    '\n\nQUALITY GATE AND INTEL CONTEXT:\n' + ctx.memText.slice(0,600) +
    '\n\nMISSION: (1) Score each section 1-10 against eval criterion - where are we losing points (2) For EVERY section scoring below 8: write the actual improved paragraph not a description (3) Does technical approach use best available domain terminology - what specific upgrades needed (4) Does each section show why HGI wins over likely competitors (5) Rewrite executive summary optimized for this specific evaluator and agency (6) Single highest-point-value improvement.';
  var out = await claudeCall('You are HGI Proposal Writer, agent 15 of 37. You produce submission-ready proposal language. You write to win. Best language wins.', prompt, 2000);
  if (!out || out.length < 100) return null;
  log('PROPOSAL WRITER complete: ' + out.length + ' chars');
  await storeMemory('proposal_agent', opp.id, (opp.agency||'') + ',proposal_improvement', 'PROPOSAL WRITER - ' + (opp.title||'').slice(0,50) + ':\n' + out, 'pattern');
  return { agent: 'proposal_agent', opp: opp.title, chars: out.length };
}

// ── SESSION ────────────────────────────────────────────────────────
async function runSession(trigger) {
  var id = 'v2-' + Date.now();
  log('=== SESSION START: ' + id + ' | trigger: ' + trigger + ' | 6 agents ===');

  try {
    var state = await loadState();

    if (state.pipeline.length === 0) {
      log('No pipeline records. Session complete.');
      await storeMemory('v2_engine', null, 'v2,session', 'V2 SESSION - no pipeline. Trigger: ' + trigger, 'analysis');
      return;
    }

    log('Pipeline (' + state.pipeline.length + ' opps):');
    state.pipeline.forEach(function(o) { log('  OPI:' + o.opi_score + ' | ' + (o.stage||'?') + ' | ' + (o.title||'').slice(0,55)); });

    var ctx = buildCtx(state);
    var activeOpps = state.pipeline.filter(function(o) { return (o.opi_score||0) >= 65; });
    log('Firing 5 agents on ' + activeOpps.length + ' opportunities OPI 65+...');

    var allResults = [];

    for (var i = 0; i < activeOpps.length; i++) {
      var opp = activeOpps[i];
      log('--- Opportunity ' + (i+1) + '/' + activeOpps.length + ': ' + (opp.title||'?').slice(0,50) + ' ---');

      // Fire agents sequentially per opportunity so each builds on prior
      try { var r1 = await agentIntelligence(opp, ctx); if (r1) allResults.push(r1); } catch(e) { log('Intel error: ' + e.message); }

      // Refresh opp record so financial sees intel findings
      try { var fresh = await supabase.from('opportunities').select('*').eq('id', opp.id).single(); if (fresh.data) opp = fresh.data; } catch(e) {}

      try { var r2 = await agentFinancial(opp, ctx); if (r2) allResults.push(r2); } catch(e) { log('Financial error: ' + e.message); }
      try { var r3 = await agentWinnability(opp, ctx); if (r3) allResults.push(r3); } catch(e) { log('Winnability error: ' + e.message); }
      try { var r4 = await agentCRM(opp, ctx); if (r4) allResults.push(r4); } catch(e) { log('CRM error: ' + e.message); }
      try { var r5 = await agentQualityGate(opp, ctx); if (r5) allResults.push(r5); } catch(e) { log('QualityGate error: ' + e.message); }
    }

    // System-wide agents (run once, see full pipeline)
    log('--- System-wide agents ---');
    try { var rD = await agentDiscovery(state, ctx); if (rD) allResults.push(rD); } catch(e) { log('Discovery error: ' + e.message); }
    try { var rPS = await agentPipelineScanner(state, ctx); if (rPS) allResults.push(rPS); } catch(e) { log('PipelineScanner error: ' + e.message); }
    try { var rOPI = await agentOPICalibration(state, ctx); if (rOPI) allResults.push(rOPI); } catch(e) { log('OPICalibration error: ' + e.message); }
    try { var rCE = await agentContentEngine(state, ctx); if (rCE) allResults.push(rCE); } catch(e) { log('ContentEngine error: ' + e.message); }
    try { var rRec = await agentRecruiting(state, ctx); if (rRec) allResults.push(rRec); } catch(e) { log('Recruiting error: ' + e.message); }
    try { var rKB = await agentKnowledgeBase(state, ctx); if (rKB) allResults.push(rKB); } catch(e) { log('KB error: ' + e.message); }
    try { var rSI = await agentScraperInsights(state, ctx); if (rSI) allResults.push(rSI); } catch(e) { log('ScraperInsights error: ' + e.message); }
    try { var rEB = await agentExecutiveBrief(state, ctx); if (rEB) allResults.push(rEB); } catch(e) { log('ExecBrief error: ' + e.message); }

    // Proposal writer fires on proposal-stage opps
    for (var pw = 0; pw < activeOpps.length; pw++) {
      try { var rPW = await agentProposalWriter(activeOpps[pw], ctx); if (rPW) allResults.push(rPW); } catch(e) { log('ProposalWriter error: ' + e.message); }
    }

    // Self-awareness runs last — sees everything
    try { var rSA = await agentSelfAwareness(state, allResults, ctx); if (rSA) allResults.push(rSA); } catch(e) { log('SelfAwareness error: ' + e.message); }

    await storeMemory('v2_engine', null, 'v2,session,phase3',
      'V2 SESSION - trigger:' + trigger + ' pipeline:' + state.pipeline.length + ' agents_completed:' + allResults.length + ' uptime:' + Math.floor(process.uptime()) + 's',
      'analysis'
    );

    log('=== SESSION COMPLETE: ' + id + ' | ' + allResults.length + ' agent outputs ===');
    log('Completed: ' + allResults.map(function(r) { return r.agent + '(' + r.chars + ')'; }).join(', '));

  } catch(e) {
    log('SESSION ERROR: ' + e.message);
  }
}

log('==========================================================');
log('HGI LIVING ORGANISM V2 - STARTING');
log('6 agents active. 31 more coming.');
log('37 agents. One shared brain. All into all.');
log('This server never sleeps. It never times out.');
log('==========================================================');

setTimeout(function() { runSession('startup').catch(console.error); }, 3000);

setInterval(function() {
  var hour = new Date().getUTCHours();
  var min = new Date().getUTCMinutes();
  if (hour === 12 && min === 0) {
    log('Daily 6AM CST session firing');
    runSession('scheduled_daily').catch(console.error);
  }
}, 60000);

log('Startup complete. 6-agent session in 3s...');
