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

    // === AGENT 1: QUALITY GATE (Sonnet 4.6) — MEMORY-AWARE ===
    var gateResearch = (opp.research_brief||'').slice(0, 1500);
    var gateSystem = 'Senior proposal compliance reviewer with full competitive context. You have three inputs: (1) the RFP scope and eval criteria, (2) the current proposal draft, (3) competitive intelligence and research findings from prior agent analysis. Use ALL three. Score each criterion as a real evaluator would — by stated point weights — but informed by what you know about the competitive field and the specific gaps the research agents found. Do not audit in a vacuum. Your first line MUST be: VERDICT: [score]/100 | [GO or NO-GO]';
    var gatePrompt = ctx +
      (gateResearch.length > 50 ? '\n\n=== COMPETITIVE RESEARCH & STRATEGIC INTEL ===\n' + gateResearch : '') +
      (gateMemCtx.length > 50 ? '\n\n=== ORGANISM MEMORY — COMPETITIVE INTEL, ANALYSIS, RED TEAM FINDINGS ===\n' + gateMemCtx : '') +
      '\n\nUsing all context above — RFP scope, proposal draft, competitive research, and organism memory — score each eval criterion exactly as this evaluator panel will. For each criterion: current draft score 1-10, specific gap identified by research or memory, points at risk, and what exact content would close the gap. First line MUST be: VERDICT: XX/100 | GO or NO-GO';
    var g = await sonnet(gateSystem, gatePrompt, 1500);
    var gateVerdict = 'unknown';
    if (g.length > 80 && !g.startsWith('API_ERR') && !g.startsWith('ERR:')) {
      await mem('quality_gate', opp.id, opp.agency+',quality_gate', 'SONNET GATE:\n'+g, 'analysis');
      oppR.agents.push({a:'quality_gate',c:g.length});
      if (g.toUpperCase().indexOf('NO-GO') !== -1) gateVerdict = 'NO-GO';
      else if (g.toUpperCase().indexOf('| GO') !== -1) gateVerdict = 'GO';
    } else { oppR.errors.push({a:'gate',r:g.slice(0,200)}); }
    oppR.gate_verdict = gateVerdict;

    // === AGENT 2: WINNABILITY (Sonnet 4.6) — MEMORY-AWARE ===
    var winSystem = 'Senior BD director making a real bid/no-bid decision with full competitive context. You have: (1) the RFP scope and proposal draft, (2) the quality gate verdict and findings, (3) competitive intelligence and research from prior agent analysis — named competitors, pricing benchmarks, agency patterns, red team scores. Use ALL of it. Your PWIN must be based on real competitive findings, not generic assessment. Never say "likely competitors" when memory tells you exactly who they are.';
    var winPrompt = ctx +
      (gateResearch.length > 50 ? '\n\n=== COMPETITIVE RESEARCH & STRATEGIC INTEL ===\n' + gateResearch : '') +
      (gateMemCtx.length > 50 ? '\n\n=== ORGANISM MEMORY — COMPETITIVE INTEL, RED TEAM SCORES, ANALYSIS ===\n' + gateMemCtx : '') +
      '\n\nQUALITY GATE VERDICT: ' + gateVerdict + '\n\nGATE FINDINGS SUMMARY:\n' + g.slice(0,800) +
      '\n\nUsing all competitive context above — named competitors from memory, their strengths vs each eval criterion, gate findings, research brief, red team scores — deliver a rigorous bid decision. Score HGI vs each named competitor per eval criterion. State PWIN X% | GO/NO-BID. List every action that would raise PWIN, ranked by point impact, with the specific proposal section each action targets.';
    var w = await sonnet(winSystem, winPrompt, 1500);
    if (w.length > 80 && !w.startsWith('API_ERR') && !w.startsWith('ERR:')) { await mem('winnability_agent', opp.id, opp.agency+',winnability', 'SONNET WIN (gate='+gateVerdict+'):\n'+w, 'winnability'); oppR.agents.push({a:'winnability',c:w.length}); } else { oppR.errors.push({a:'win',r:w.slice(0,200)}); }

    // === AGENT 3: PROPOSAL BUILDER (Opus 4.6 + Extended Thinking + Web + KB) ===
    {
      // Gate verdict is INPUT not a blocker. NO-GO = build the missing sections immediately.
      // Everything derived from the actual RFP — never hardcoded
      var vertical = (opp.vertical || 'professional services').trim();
      var agency = (opp.agency || '').trim();
      var title = (opp.title || '').trim();
      var state = (opp.state || 'Louisiana').trim();
      // Extract first 300 chars of scope as topic context for queries
      var scopeSnippet = (opp.scope_analysis || '').replace(/[^a-zA-Z0-9 .,\-]/g, ' ').slice(0, 300).trim();

      // Step 1: Three web searches — 100% driven by what THIS RFP requires
      // Search 1: Technical approach and methodology for this specific service type
      var web1 = await webSearch(title + ' ' + vertical + ' technical approach methodology best practices winning government proposals 2025 2026 evaluation criteria');
      // Search 2: Agency-specific intelligence and similar contracts
      var web2 = await webSearch(agency + ' ' + state + ' ' + vertical + ' professional services procurement requirements similar contracts awarded 2023 2024 2025');
      // Search 3: Regulatory and compliance framework specific to this scope
      var web3 = await webSearch(vertical + ' government contract compliance framework regulatory requirements ' + state + ' best practices 2025 2026 ' + scopeSnippet.slice(0,100));
      oppR.web_searches = 3;

      // Step 2: KB query — built from THIS opportunity's vertical and scope
      var kbQuery = vertical + ' ' + title + ' ' + scopeSnippet.slice(0,150);
      var kbContent = await queryKB(kbQuery);
      oppR.kb_chars = kbContent.length;

      // Step 3: Assemble intelligence package — all labeled by what they contain
      var webIntel = '';
      if (web1 && web1.length > 50) webIntel += '\n=== WEB RESEARCH 1 — METHODOLOGY & BEST PRACTICES FOR THIS RFP ===\n' + web1.slice(0,2000);
      if (web2 && web2.length > 50) webIntel += '\n\n=== WEB RESEARCH 2 — AGENCY INTELLIGENCE & SIMILAR AWARDS ===\n' + web2.slice(0,1500);
      if (web3 && web3.length > 50) webIntel += '\n\n=== WEB RESEARCH 3 — REGULATORY & COMPLIANCE FRAMEWORK ===\n' + web3.slice(0,1500);
      var kbIntel = kbContent.length > 100 ? '\n\n=== HGI KNOWLEDGE BASE — INSTITUTIONAL KNOWLEDGE FOR THIS VERTICAL ===\n' + kbContent.slice(0,3000) : '';
      var memIntel = memCtx.length > 100 ? '\n\n=== ORGANISM INTELLIGENCE — COMPETITIVE FINDINGS ON THIS OPPORTUNITY ===\n' + memCtx.slice(0,2000) : '';

      // System prompt: built from THIS RFP — no hardcoded program types
      var proposalSystem =
        'You are the most capable government proposal writer in the world with 30 years of experience winning government contracts across all service verticals.' +
        '\n\nYou are building a proposal for: ' + title + ' | Client: ' + agency + ' | Service area: ' + vertical +
        '\n\nYou have five intelligence sources: (1) The actual RFP requirements and current draft, (2) Quality gate findings showing what scores low and why, (3) Live web research on current methodology and best practices FOR THIS SPECIFIC SERVICE TYPE, (4) HGI institutional knowledge base, (5) Competitive intelligence on this opportunity.' +
        '\n\nYour mission: OUTPUT A COMPLETE, UPDATED PROPOSAL DOCUMENT — every section from the first word to the last. Read the existing draft first. Keep every section scoring 8+/10 as-is. Rebuild every section scoring below 8/10 completely. Add every required section that is missing. Extended thinking is enabled — use it to synthesize all sources before writing. Your output IS the full improved proposal — not suggestions, not analysis, the actual submission-ready text.' +
        '\n\nCRITICAL BUILD RULES:' +
        '\n1. THIS RFP DRIVES EVERYTHING. Every section you write, every methodology you describe, every approach you articulate must be directly responsive to what THIS client asked for in THIS RFP. Never write generic sections.' +
        '\n2. MISSING SECTIONS: If a required RFP section is absent or thin relative to its evaluation point weight — BUILD IT COMPLETELY from the RFP requirements, web research, and HGI facts. Do not flag gaps — fill them.' +
        '\n3. TECHNICAL APPROACH IS PRIORITY. Read the eval criteria in the scope analysis. Find the highest-weighted technical section. If it is weak, write it completely: describe the specific methodology, workflow, tools, staff, and deliverables HGI will bring to THIS scope. Use the web research to ensure the methodology reflects current best practice for this service type.' +
        '\n4. METHODOLOGY = CURRENT BEST PRACTICE + HGI PROOF. Web research tells you what evaluators expect to see. KB and draft tell you what HGI actually does. Combine them — every claim backed by HGI evidence, every approach current with industry standards.' +
        '\n5. CONFIRMED HGI REFERENCES ARE FACTS. Use exactly as written, never question or suggest replacing: Paul Rainwater (rainwater97@gmail.com, 225-281-8176), Jeff Haley (jeff.haley@la.gov, 225-330-0036), Pat Forbes (Patrick.Forbes@la.gov, 225-342-1626), Bubba Orgeron (bubbaorgeron@tpsd.org, 985-876-7400), Gregory Harding (gregoryharding@tpsd.org, 985-688-0052).' +
        '\n6. OUTPUT = SUBMISSION-READY TEXT. Complete paragraphs, tables, matrices ready to paste. Never describe what to write — write it.' +
        '\n7. NO FABRICATION. Do not invent past performance values, contract amounts, or credentials not in the draft or KB.';

      // Prompt: sections prioritized by THIS RFP eval criteria, not generic templates
      var proposalPrompt =
        '=== THIS RFP AND CURRENT DRAFT ===\n' + ctx.slice(0,14000) +
        '\n\n=== QUALITY GATE FINDINGS — what is scoring low in THIS proposal ===\n' + g.slice(0,2000) +
        '\n\n=== WINNABILITY ASSESSMENT ===\n' + w.slice(0,1000) +
        webIntel + kbIntel + memIntel +
        '\n\n=== YOUR TASK ===' +
        '\nRead the eval criteria in this RFP carefully. Identify every section that is missing, weak, or scoring below 8/10 based on the gate findings.' +
        '\nPrioritize by point weight from the actual eval criteria in this RFP — not a generic template.' +
        '\nFor each weak or missing section: write the complete, submission-ready text using all five intelligence sources. Every methodology must match what THIS client asked for, backed by web research on current best practice and HGI proof from the KB and draft.' +
        '\nYour output MUST be the COMPLETE UPDATED PROPOSAL — every section, start to finish. Keep sections scoring 8+/10. Rebuild sections scoring below 8/10 using web research best practices and HGI KB evidence. Build every missing required section completely. Replace every [ACTION REQUIRED] for technical content with actual submission-ready text. Preserve [ACTION REQUIRED] only for physical certifications or signatures.' +
        '\nDo not include any content that is not directly responsive to THIS RFP scope and requirements.';

      var p = await opusProposal(proposalSystem, proposalPrompt);

      if (p.length > 200 && !p.startsWith('API_ERR') && !p.startsWith('ERR:')) {
        await mem('proposal_agent', opp.id, opp.agency+',proposal,opus,extended_thinking', 'OPUS PROPOSAL (gate='+gateVerdict+' | web+kb+memory | rfp-specific):\n'+p, 'pattern');
        var minLen = Math.max(500, Math.floor((opp.staffing_plan||'').length * 0.4));
        if (p.length > minLen) {
          try { await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opp.id), { method: 'PATCH', headers: H, body: JSON.stringify({ staffing_plan: p, last_updated: new Date().toISOString() }) }); oppR.draft_written = p.length; } catch(wErr) { oppR.errors.push({step:'draft_write',msg:wErr.message}); }
        }
        oppR.agents.push({a:'proposal_opus',c:p.length,sources:['gate','winnability','web_x3','kb','memory','direct_writeback']});
        // Fire kb-enrich async — don't await, don't block proposal run
        fetch('https://hgi-capture-system.vercel.app/api/kb-enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal: p, gate_output: g, vertical: vertical, opp_title: title, agency: agency })
        }).catch(function() {});
        oppR.kb_enrich_triggered = true;
      } else {
        oppR.errors.push({a:'prop_opus',r:(p||'').slice(0,200)});
      }
    }

  } catch(e) { oppR.errors.push({fatal:e.message}); }
  return oppR;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), opps_processed: [], errors: [] };
  try {
    var allOpps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&select=id,title,agency,vertical,opi_score,scope_analysis,financial_analysis,research_brief,staffing_plan,capture_action&order=opi_score.desc&limit=5', { headers: H })).json();
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