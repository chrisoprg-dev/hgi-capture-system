export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
async function sbGet(path) { try { const r = await fetch(SB + path, { headers: H }); if (!r.ok) return []; return await r.json(); } catch(e) { return []; } }
async function storeMemory(agent, oppId, tags, observation, memType) {
  try {
    await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: observation, memory_type: memType || 'analysis', created_at: new Date().toISOString() }) });
  } catch(e) {}
}
async function webSearch(query) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Intelligence analyst. Search web and return specific verified findings with sources.', messages: [{ role: 'user', content: query }] }) });
    if (!r.ok) return '';
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}
async function think(system, prompt, maxT) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxT || 1000, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return '';
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const trigger = (req.body || {}).trigger || (req.method === 'GET' ? 'manual' : 'cron');
  const results = { trigger, started_at: new Date().toISOString(), work_completed: [], errors: [] };

  const [activeOpps, allMemories] = await Promise.all([
    sbGet('/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.65&select=id,title,agency,vertical,state,opi_score,due_date,stage,scope_analysis,financial_analysis,research_brief,staffing_plan,estimated_value&order=opi_score.desc&limit=10'),
    sbGet('/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=60')
  ]);
  results.opps_loaded = activeOpps.length;
  results.memories_loaded = allMemories.length;
  const memText = allMemories.slice(0, 40).map(function(m) { return '[' + (m.agent||'') + '|' + (m.memory_type||'') + '|' + (m.created_at||'').slice(0,10) + ']:\n' + (m.observation||'').slice(0,350); }).join('\n\n---\n\n');

  function oppMem(opp) {
    return allMemories.filter(function(m) { return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||''); }).map(function(m) { return (m.observation||'').slice(0,300); }).join('\n\n') + '\n\n' + memText.slice(0,1500);
  }

  async function run(agentName, fn) {
    try { var r = await fn(); if (r) results.work_completed.push(r); } catch(e) { results.errors.push(agentName + ':' + e.message); }
  }

  // ═══ PER-OPPORTUNITY AGENTS ═══
  for (var i = 0; i < activeOpps.length; i++) {
    var opp = activeOpps[i];
    var mem = oppMem(opp);

    // 1. INTELLIGENCE ENGINE — web research on competitors, awards, agency intel
    await run('intelligence_engine', async function() {
      var web = await webSearch('Louisiana government contracts awarded ' + opp.agency + ' ' + (opp.vertical||'disaster recovery') + ' professional services 2023 2024 2025 who won how much');
      if (!web || web.length < 100) return null;
      var a = await think('HGI competitive intelligence analyst. NEVER a direct federal contract — all work through state/local. Cite dollar amounts, names, dates.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + '\nWEB FINDINGS:\n' + web.slice(0,3000) + '\nPRIOR MEMORY:\n' + mem.slice(0,1200) + '\nExtract: (1) Named competitors likely to bid and strengths (2) Recent award amounts for comparable contracts (3) Incumbent if any (4) Agency budget/procurement patterns (5) Red flags or unique opportunities. Flag anything that contradicts prior assumptions.', 1200);
      if (a && a.length > 100) {
        await storeMemory('intelligence_engine', opp.id, opp.agency+','+(opp.vertical||'')+',competitive_intel', 'INTEL ENGINE — '+opp.agency+':\n'+a, 'competitive_intel');
        try { await fetch(SB+'/rest/v1/competitive_intelligence', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'ci-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), competitor_name:'market_research', agency:opp.agency||'', vertical:opp.vertical||'', strategic_notes:a.slice(0,2000), opportunity_id:opp.id, source_agent:'intelligence_engine', created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
        return { agent:'intelligence_engine', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 2. CRM / RELATIONSHIP AGENT — finds real decision-maker contacts
    await run('crm_agent', async function() {
      var web = await webSearch('procurement contact purchasing director ' + opp.agency + ' Louisiana who signs professional services contracts email phone');
      if (!web || web.length < 100) return null;
      var a = await think('HGI relationship intelligence agent. Find verified decision-maker contacts. Note relationship strength cold/unknown unless evidence otherwise.', 'AGENCY: ' + opp.agency + ' | STATE: ' + (opp.state||'LA') + '\nWEB FINDINGS:\n' + web.slice(0,2000) + '\nPRIOR MEMORY:\n' + mem.slice(0,800) + '\nExtract named contacts, titles, emails, phones. Note best outreach approach. Flag any mutual connections or HGI history with this agency.', 800);
      if (a && a.length > 80) {
        await storeMemory('crm_agent', opp.id, opp.agency+',contacts,relationship', 'CRM — '+opp.agency+' contacts:\n'+a, 'relationship');
        try { await fetch(SB+'/rest/v1/relationship_graph', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'rg-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), organization:opp.agency||'', notes:a.slice(0,1500), relationship_strength:'cold', source_agent:'crm_agent', opportunity_id:opp.id, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}) }); } catch(e) {}
        return { agent:'crm_agent', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 3. FINANCIAL & PRICING AGENT — real comparable contract values
    await run('financial_agent', async function() {
      var web = await webSearch('Louisiana ' + (opp.vertical||'disaster recovery') + ' consulting contract award amount MSA 2022 2023 2024 FEMA PA program management hourly rates parish city');
      if (!web || web.length < 100) return null;
      var a = await think('HGI CFO-level financial analyst. Only cite verified dollar amounts with sources. Show what the numbers imply for our pricing.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + ' | Current estimate: ' + (opp.estimated_value||'unknown') + '\nWEB AWARD DATA:\n' + web.slice(0,2000) + '\nPRIOR MEMORY:\n' + mem.slice(0,800) + '\nExtract real award amounts for comparable work — name agency, amount, period, scope. What does this imply for our estimate? Flag if we are priced too high or too low.', 800);
      if (a && a.length > 80) {
        await storeMemory('financial_agent', opp.id, opp.agency+','+(opp.vertical||'')+',pricing_benchmark', 'FINANCIAL — pricing benchmarks for '+opp.title+':\n'+a, 'pricing_benchmark');
        return { agent:'financial_agent', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 4. RESEARCH & ANALYSIS AGENT — strategic dossier from all accumulated intel
    await run('research_analysis', async function() {
      var a = await think('HGI strategic research and analysis agent. Every recommendation must tie to specific evidence in the intelligence. No generic advice.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + ' | OPI: ' + opp.opi + '\nEVAL CRITERIA: Technical 30 / Experience 25 / Past Performance 20 / Staffing 15 / Price 10\nACCUMULATED INTELLIGENCE:\n' + mem.slice(0,3000) + '\nProduce: (1) Updated competitive landscape with named firms and their specific threats (2) Revised win strategy mapped to eval criteria point values (3) Intelligence gaps still needed (4) Red flags that changed since initial analysis (5) Single highest-leverage action HGI should take this week.', 1000);
      if (a && a.length > 100) {
        await storeMemory('research_analysis', opp.id, opp.agency+','+(opp.vertical||'')+',strategy,research', 'RESEARCH ANALYSIS — '+opp.title+':\n'+a, 'analysis');
        return { agent:'research_analysis', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 5. WINNABILITY AGENT — re-evaluates GO/PWIN as intelligence accumulates
    await run('winnability_agent', async function() {
      var a = await think('HGI bid decision engine. Re-evaluate GO/PWIN honestly as new intelligence arrives. Be specific about what changed.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + ' | Current OPI: ' + opp.opi + '\nACCUMULATED INTELLIGENCE:\n' + mem.slice(0,2500) + '\nRe-evaluate: (1) Should GO decision change based on new intel? (2) Has PWIN moved and why specifically? (3) What new risks emerged? (4) What would flip this to NO-BID? (5) Current recommendation: PWIN X% | GO/CONDITIONAL/NO-BID.', 700);
      if (a && a.length > 80) {
        await storeMemory('winnability_agent', opp.id, opp.agency+',winnability,pwin', 'WINNABILITY RE-EVAL — '+opp.title+':\n'+a, 'winnability');
        return { agent:'winnability_agent', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 6. QUALITY GATE AGENT — proactively audits proposals before submission
    await run('quality_gate', async function() {
      if ((opp.staffing_plan||'').length < 300) return null;
      var a = await think('HGI submission quality gate. Catch every deficiency before an evaluator does. Be specific about what is missing.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + '\nEVAL CRITERIA: Technical 30 / Experience 25 / Past Performance 20 / Staffing 15 / Price 10\nSCOPE: ' + (opp.scope_analysis||'').slice(0,800) + '\nProposal draft exists. Compliance check: (1) Every RFP requirement addressed? (2) Eval criteria sections thin or missing? (3) All 10 required positions with rates? (4) 3 past performance references with contact info? (5) Exhibits B-J noted? (6) Compliance matrix complete? Verdict: GO/NO-GO with deficiency list.', 900);
      if (a && a.length > 80) {
        await storeMemory('quality_gate', opp.id, opp.agency+',quality_gate,compliance', 'QUALITY GATE — '+opp.title+':\n'+a, 'analysis');
        return { agent:'quality_gate', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 7. PROPOSAL AGENT — continuous improvement analysis on existing drafts
    await run('proposal_agent', async function() {
      if ((opp.staffing_plan||'').length < 300) return null;
      var a = await think('HGI proposal strategy agent. Identify specific improvements — not generic. Cite what the organism knows about competitors and eval criteria.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + '\nEVAL CRITERIA: Technical 30 / Experience 25 / Past Performance 20 / Staffing 15 / Price 10\nINTELLIGENCE:\n' + mem.slice(0,2000) + '\nProposal draft exists. Identify: (1) Weakest sections against eval criteria point values (2) Specific missing content that would score higher (3) Compliance gaps (4) Competitive positioning vs CDR Maguire / Tetra Tech / IEM (5) Single most impactful edit to make.', 900);
      if (a && a.length > 100) {
        await storeMemory('proposal_agent', opp.id, opp.agency+','+(opp.vertical||'')+',proposal_improvement', 'PROPOSAL AGENT — '+opp.title+':\n'+a, 'pattern');
        return { agent:'proposal_agent', opp:opp.title, chars:a.length };
      }
      return null;
    });

    // 8. BRIEF AGENT — keeps team briefings current with latest intel
    await run('brief_agent', async function() {
      if ((opp.stage||'') !== 'proposal' && (opp.stage||'') !== 'pursuing') return null;
      var a = await think('HGI team briefing agent. Keep the team picture current. Use functional roles only — never personal names.', 'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + ' | Due: ' + (opp.due_date||'TBD') + '\nLATEST INTELLIGENCE:\n' + mem.slice(0,2500) + '\nUpdate brief: (1) What changed since last brief — new competitors, agency intel, pricing shifts? (2) Open items still unresolved (3) What must happen before next milestone (4) What each functional role must do this week (5) Overall confidence level in win.', 800);
      if (a && a.length > 80) {
        await storeMemory('brief_agent', opp.id, opp.agency+',briefing,team_brief', 'BRIEF AGENT — '+opp.title+':\n'+a, 'analysis');
        return { agent:'brief_agent', opp:opp.title, chars:a.length };
      }
      return null;
    });
  }

  // ═══ SYSTEM-WIDE AGENTS — run once, see everything ═══

  // 9. DISCOVERY AGENT — finds new sources and pre-solicitation signals
  await run('discovery_agent', async function() {
    var web = await webSearch('Louisiana government professional services procurement 2026 disaster recovery FEMA CDBG-DR housing new RFP solicitation pre-solicitation vendor conference');
    var a = await think('HGI discovery agent. Find new opportunity sources and pre-solicitation signals before RFPs drop. HGI works through state/local only.', 'WEB SCAN:\n' + (web||'').slice(0,2500) + '\nCURRENT SOURCES: Central Bidding, LaPAC, FEMA API, Grants.gov. Missing: Louisiana Housing Corporation, SAM.gov, parish meeting minutes.\nMemory:\n' + memText.slice(0,1000) + '\nFind: (1) Pre-solicitation signals — budget discussions, vendor days, consultants mentioned (2) New agencies HGI should watch (3) Market signals about upcoming LA/TX/FL/MS disaster contracts (4) Source gaps competitors are watching that HGI is missing.', 900);
    if (a && a.length > 80) {
      await storeMemory('discovery_agent', null, 'discovery,pre_solicitation,market_signals', 'DISCOVERY AGENT:\n'+a, 'pattern');
      return { agent:'discovery_agent', chars:a.length };
    }
    return null;
  });

  // 10. PIPELINE SCANNER — monitors deadlines, stale pursuits, anomalies
  await run('pipeline_scanner', async function() {
    var today = new Date();
    var health = activeOpps.map(function(o) { var d = o.due_date ? Math.ceil((new Date(o.due_date)-today)/86400000) : null; return o.title+'|Stage:'+(o.stage||'?')+'|Days:'+(d!==null?d:'?')+'|OPI:'+o.opi; }).join('\n');
    var a = await think('HGI pipeline health monitor. Flag everything that needs immediate action. Be direct.', 'PIPELINE:\n' + health + '\nMEMORY:\n' + memText.slice(0,1500) + '\nFlag: (1) Opportunities within 14 days of deadline without complete proposal (2) GO opportunities stuck in same stage 7+ days (3) OPI scores inconsistent with current intelligence (4) Deadline conflicts — two proposals same week (5) Pipeline health score 1-10 with reasoning.', 700);
    if (a && a.length > 80) {
      await storeMemory('pipeline_scanner', null, 'pipeline_health,deadlines,anomalies', 'PIPELINE SCANNER:\n'+a, 'analysis');
      return { agent:'pipeline_scanner', chars:a.length };
    }
    return null;
  });

  // 11. SCANNER / OPI CALIBRATION — re-evaluates scores with accumulated intelligence
  await run('scanner_opi', async function() {
    var oppList = activeOpps.map(function(o) { return o.title+'|'+o.agency+'|OPI:'+o.opi+'|Vertical:'+(o.vertical||''); }).join('\n');
    var a = await think('HGI OPI calibration engine. Continuously refine scoring accuracy based on everything the organism knows. Be specific about what to adjust.', 'ACTIVE OPPORTUNITIES:\n' + oppList + '\nORGANISM INTELLIGENCE:\n' + memText.slice(0,2000) + '\nFor each: (1) Does current OPI reflect what organism now knows? (2) Which scores need adjustment and by how much? (3) What factors are consistently over/underweighted? (4) What would change the scoring model most if added?', 900);
    if (a && a.length > 80) {
      await storeMemory('scanner_opi', null, 'opi_calibration,scoring', 'OPI CALIBRATION:\n'+a, 'pattern');
      return { agent:'scanner_opi', chars:a.length };
    }
    return null;
  });

  // 12. CONTENT ENGINE — voice consistency and pattern learning
  await run('content_engine', async function() {
    var a = await think('HGI institutional voice agent. Maintain and improve HGI voice across all outputs. Active voice target 75%+.', 'ORGANISM MEMORY (recent outputs):\n' + memText.slice(0,2000) + '\nAnalyze: (1) Voice patterns emerging — active vs passive ratio, preferred phrases, sentence structures (2) Phrases to add to blocked list (3) What makes HGI writing distinctive and authoritative (4) Specific style improvements that would most strengthen the next proposal.', 700);
    if (a && a.length > 80) {
      await storeMemory('content_engine', null, 'voice,style,content_standards', 'CONTENT ENGINE:\n'+a, 'pattern');
      return { agent:'content_engine', chars:a.length };
    }
    return null;
  });

  // 13. RECRUITING & BENCH AGENT — staffing gaps across all active pursuits
  await run('recruiting_bench', async function() {
    var a = await think('HGI recruiting and bench agent. Track staffing needs, identify gaps, flag recurring shortfalls before they block bids.', 'ACTIVE OPPORTUNITIES:\n' + activeOpps.map(function(o){ return o.title+'|Vertical:'+(o.vertical||'')+'|Stage:'+(o.stage||''); }).join('\n') + '\nHGI STAFF: 67 FT + 43 contract. Named staff: Louis Resweber (Program Director), Berron (PA SME), April Gloston (HM Specialist), Klunk (Financial/Grant), Wiltz (Documentation).\nINTELLIGENCE:\n' + memText.slice(0,1200) + '\nFor each pursuit: (1) Roles needed vs available (2) Which named staff best suited (3) Where teaming or subcontracting needed (4) Recurring qualification gaps appearing across multiple bids (5) Recruiting action needed before next deadline.', 900);
    if (a && a.length > 80) {
      await storeMemory('recruiting_bench', null, 'staffing,bench,gaps,recruiting', 'RECRUITING BENCH:\n'+a, 'analysis');
      return { agent:'recruiting_bench', chars:a.length };
    }
    return null;
  });

  // 14. KNOWLEDGE BASE AGENT — identifies gaps, suggests what to add
  await run('knowledge_base_agent', async function() {
    var a = await think('HGI knowledge base agent. The KB is the organism brain — keep it complete and useful. Identify the most impactful gaps.', 'ACTIVE VERTICALS: Disaster Recovery (primary), Workforce/WIOA.\nCURRENT KB: 21 docs, 350+ chunks. Strong: GOHSEP (149 chunks), TPCIGA (94 chunks), HTHA (22 chunks). Weak: 6 image-PDFs minimal extraction, 2 docx zero chunks.\nMEMORY:\n' + memText.slice(0,1500) + '\nIdentify: (1) KB content referenced most in current proposals and research (2) Critical HGI past performance missing or thin (3) Agency-specific intelligence that should be KB chunks (4) Technical methodology content that would most improve proposals (5) Single document Lou should send next — what gap does it fill?', 800);
    if (a && a.length > 80) {
      await storeMemory('knowledge_base_agent', null, 'kb_gaps,missing_content,kb_health', 'KB AGENT:\n'+a, 'pattern');
      return { agent:'knowledge_base_agent', chars:a.length };
    }
    return null;
  });

  // 15. SCRAPER INSIGHTS AGENT — source health and ROI
  await run('scraper_insights', async function() {
    var a = await think('HGI scraper health and data quality monitor. Track source yield, detect degradation, report ROI in GO-quality opportunities per source.', 'PIPELINE SOURCE MIX:\n' + activeOpps.map(function(o){ return (o.title||'').slice(0,50)+'|OPI:'+o.opi; }).join('\n') + '\nMEMORY:\n' + memText.slice(0,1000) + '\nAnalyze: (1) Which sources produce GO-quality opportunities vs noise? (2) Patterns in what Central Bidding catches vs misses? (3) Highest-ROI new source to add given active verticals? (4) Signs of scraper degradation or missed opportunities? (5) Recommended keyword adjustments per source.', 700);
    if (a && a.length > 80) {
      await storeMemory('scraper_insights', null, 'scraper_health,source_roi,keywords', 'SCRAPER INSIGHTS:\n'+a, 'pattern');
      return { agent:'scraper_insights', chars:a.length };
    }
    return null;
  });

  // 16. EXECUTIVE BRIEF AGENT — keeps Lou and Larry digest current
  await run('executive_brief_agent', async function() {
    var a = await think('HGI executive briefing agent for Lou Resweber (CEO) and Larry Oney (Chairman). Concise, no noise. Big picture and what requires their attention or relationships.', 'PIPELINE:\n' + activeOpps.map(function(o){ return o.title+'|'+o.agency+'|OPI:'+o.opi+'|Due:'+(o.due_date||'TBD')+'|Stage:'+(o.stage||'?'); }).join('\n') + '\nINTELLIGENCE:\n' + memText.slice(0,2000) + '\nExecutive digest: (1) Pipeline summary — what are we pursuing and stakes? (2) This week critical decisions and deadlines (3) Opportunities needing executive relationships (4) Win probability summary — where most likely to win and why? (5) What should Lou and Larry know that needs their visibility?', 800);
    if (a && a.length > 80) {
      await storeMemory('executive_brief_agent', null, 'executive_brief,lou,larry,digest', 'EXECUTIVE BRIEF:\n'+a, 'analysis');
      return { agent:'executive_brief_agent', chars:a.length };
    }
    return null;
  });

  // 17. DESIGN & VISUAL AGENT — tracks which formats win, recommends templates
  await run('design_visual', async function() {
    var a = await think('HGI design and visual agent. Every HGI output should look like it came from a firm that manages billion-dollar programs. Track what works.', 'ACTIVE PROPOSALS:\n' + activeOpps.filter(function(o){ return (o.staffing_plan||'').length > 300; }).map(function(o){ return o.title+'|'+o.agency; }).join('\n') + '\nMEMORY:\n' + memText.slice(0,1200) + '\nAnalyze: (1) What visual format and structure would most impress evaluators for each active proposal? (2) Which sections need visual elements — tables, org charts, compliance matrices? (3) Brand standards to enforce — gold/navy palette, professional typography (4) What visual elements would differentiate HGI from CDR Maguire and Tetra Tech submissions? (5) Highest-priority visual improvement across all active proposals.', 700);
    if (a && a.length > 80) {
      await storeMemory('design_visual', null, 'visual_design,branding,format,templates', 'DESIGN AGENT:\n'+a, 'pattern');
      return { agent:'design_visual', chars:a.length };
    }
    return null;
  });

  // 18. DASHBOARD AGENT — aggregates system health metrics for display
  await run('dashboard_agent', async function() {
    var a = await think('HGI dashboard intelligence agent. Synthesize system health for Christopher morning briefing.', 'SYSTEM STATE:\nActive opps: ' + activeOpps.length + '\nMemories: ' + allMemories.length + '\nWork done this run (will be completed): intelligence, crm, financial, research, winnability, quality gate, proposal, brief, discovery, pipeline scan, opi calibration, content, bench, kb, scraper, exec brief, design\n\nMEMORY PATTERNS:\n' + memText.slice(0,1500) + '\nSynthesize: (1) Overall organism health — how well is the system working? (2) Which opportunities need Christopher attention vs running fine autonomously? (3) What is the most important thing Christopher should know right now? (4) System improvement that would have highest impact this week.', 700);
    if (a && a.length > 80) {
      await storeMemory('dashboard_agent', null, 'dashboard,system_health,morning_brief', 'DASHBOARD AGENT:\n'+a, 'analysis');
      return { agent:'dashboard_agent', chars:a.length };
    }
    return null;
  });

  // 19. OPPORTUNITY BRIEF AGENT — deep single-opportunity view for decision-making
  await run('opportunity_brief_agent', async function() {
    var primaryOpp = activeOpps[0];
    if (!primaryOpp) return null;
    var a = await think('HGI opportunity brief agent. Produce the deepest possible single-opportunity view for decision-making. Surface what matters most first.', 'PRIMARY OPPORTUNITY: ' + primaryOpp.title + ' | ' + primaryOpp.agency + ' | OPI: ' + primaryOpp.opi + ' | Due: ' + (primaryOpp.due_date||'TBD') + '\nALL ACCUMULATED INTELLIGENCE:\n' + oppMem(primaryOpp).slice(0,3000) + '\nProduce complete decision brief: (1) Everything organism knows about this agency (2) Complete competitive field with specific threat assessment (3) HGI strengths and gaps mapped to eval criteria (4) Financial picture — realistic range and margin (5) Relationship map — who do we know, who do we not, what that means (6) Critical path to submission — every remaining milestone.', 1200);
    if (a && a.length > 100) {
      await storeMemory('opportunity_brief_agent', primaryOpp.id, primaryOpp.agency+',opportunity_brief,deep_dive', 'OPP BRIEF — '+primaryOpp.title+':\n'+a, 'analysis');
      return { agent:'opportunity_brief_agent', opp:primaryOpp.title, chars:a.length };
    }
    return null;
  });

  // 20. SELF-AWARENESS ENGINE — runs last, sees everything, identifies improvements
  await run('self_awareness', async function() {
    var a = await think('HGI self-awareness engine. You see everything every agent did. Identify patterns, limitations, and the single highest-leverage improvement.', 'WORK COMPLETED THIS RUN:\n' + JSON.stringify(results.work_completed).slice(0,2000) + '\nERRORS:\n' + results.errors.join('\n') + '\nMEMORY STATE (' + allMemories.length + ' memories):\n' + memText.slice(0,2000) + '\nAnalyze: (1) Patterns emerging across all opportunities and agents (2) Which agents produced highest-value intelligence today (3) Data gaps costing HGI the most right now (4) Single improvement with highest impact on win rate (5) Anything that does not add up — contradictions, anomalies, stale data.', 1200);
    if (a && a.length > 100) {
      await storeMemory('self_awareness', null, 'system_health,self_assessment,patterns,improvements', 'SELF-AWARENESS DIGEST:\n'+a, 'pattern');
      return { agent:'self_awareness', chars:a.length };
    }
    return null;
  });

  try {
    await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({ id:'hr-work-'+Date.now(), source:'organism_work', status: results.work_completed.length+' work items | '+activeOpps.length+' opps | '+allMemories.length+' memories | '+results.errors.length+' errors', run_at: new Date().toISOString(), opportunities_found: 0 }) });
  } catch(e) {}

  results.completed_at = new Date().toISOString();
  results.total_work_items = results.work_completed.length;
  return res.status(200).json(results);
}