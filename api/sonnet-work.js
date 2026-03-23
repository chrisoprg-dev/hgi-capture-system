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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), agents: [], errors: [] };
  try {
    var opps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&select=id,title,agency,vertical,opi_score,scope_analysis,financial_analysis,research_brief,staffing_plan,capture_action&order=opi_score.desc&limit=2', { headers: H })).json();
    if (!opps || !opps.length) return res.status(200).json({ note: 'No active proposal/pursuing opps' });
    var opp = null;
    for (var oi = 0; oi < opps.length; oi++) { if ((opps[oi].staffing_plan||'').length >= 200) { opp = opps[oi]; break; } }
    if (!opp) return res.status(200).json({ note: 'No opp with draft', opps: opps.map(function(o){return o.title;}) });
    R.opp = opp.title;
    R.draft = (opp.staffing_plan||'').length;

    // Load organism memory for this opp
    var mems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&memory_type=neq.decision_point&order=created_at.desc&limit=12&select=agent,observation', { headers: H })).json();
    var memCtx = (mems||[]).map(function(m) { return '[' + m.agent + ']: ' + (m.observation||'').slice(0, 350); }).join('\n\n');

    var ctx = '=== ' + opp.title + ' | ' + opp.agency + ' | OPI ' + opp.opi_score + ' ===\n' +
      (opp.scope_analysis||'').slice(0,4000) + '\n---\n' +
      (opp.staffing_plan||'').slice(0,12000) + '\n---\n' +
      (opp.capture_action||'').slice(0,1000) + '\n---\n' +
      (opp.financial_analysis||'').slice(0,1500);
    R.ctx = ctx.length;

    // === AGENT 1: QUALITY GATE (Sonnet 4.6) ===
    var g = await sonnet('Senior proposal compliance reviewer. Score like a real evaluator — specific sections, specific points at risk, specific gaps. Your first line MUST be: VERDICT: [score]/100 | [GO or NO-GO]', ctx + '\n\nSCORE EACH CRITERION 1-10. List ALL gaps. First line MUST be: VERDICT: XX/100 | GO or NO-GO', 1500);
    var gateVerdict = 'unknown';
    if (g.length > 80 && !g.startsWith('API_ERR') && !g.startsWith('ERR:')) {
      await mem('quality_gate', opp.id, opp.agency+',quality_gate', 'SONNET GATE:\n'+g, 'analysis');
      R.agents.push({a:'quality_gate',c:g.length});
      if (g.toUpperCase().indexOf('NO-GO') !== -1) gateVerdict = 'NO-GO';
      else if (g.toUpperCase().indexOf('| GO') !== -1) gateVerdict = 'GO';
    } else { R.errors.push({a:'gate',r:g.slice(0,200)}); }
    R.gate_verdict = gateVerdict;

    // === AGENT 2: WINNABILITY (Sonnet 4.6) ===
    var w = await sonnet('Senior BD director. Bid/no-bid with real money on the line. Quality gate verdict: ' + gateVerdict + '. Factor this into your assessment.', ctx + '\n\nQUALITY GATE SAYS: ' + gateVerdict + '\n\nWould this beat CDR Maguire and Tetra Tech? Score per criterion. PWIN X% | GO/NO-BID. All actions ranked by impact.', 1500);
    if (w.length > 80 && !w.startsWith('API_ERR') && !w.startsWith('ERR:')) { await mem('winnability_agent', opp.id, opp.agency+',winnability', 'SONNET WIN (gate='+gateVerdict+'):\n'+w, 'winnability'); R.agents.push({a:'winnability',c:w.length}); } else { R.errors.push({a:'win',r:w.slice(0,200)}); }

    // === AGENT 3: PROPOSAL BUILDER (Opus 4.6 + Extended Thinking + Web + KB) ===
    if (gateVerdict === 'NO-GO') {
      R.agents.push({a:'proposal',c:0,skipped:'gate_NO-GO'});
      await mem('proposal_agent', opp.id, opp.agency+',proposal', 'PROPOSAL BLOCKED BY GATE (NO-GO). Fix deficiencies before investing in proposal improvements. Gate output:\n'+g.slice(0,2000), 'analysis');
    } else {
      // Step 1: Three targeted web searches (Haiku — cost efficient)
      var vertical = opp.vertical || 'disaster recovery';
      var agency = opp.agency || '';
      var web1 = await webSearch('FEMA Public Assistance Technical Approach best practices 2025 2026 winning government proposals PAPPG methodology PW formulation damage assessment compliance');
      var web2 = await webSearch(agency + ' Louisiana GOHSEP disaster recovery procurement ' + vertical + ' requirements methodology 2025 2026 successful proposals');
      var web3 = await webSearch('CDBG-DR program management technical approach methodology HUD compliance 2 CFR 200 winning proposals government 2025 2026');
      R.web_searches = 3;

      // Step 2: KB query — HGI institutional knowledge
      var kbContent = await queryKB('disaster recovery FEMA public assistance technical approach methodology CDBG-DR compliance 2 CFR 200 program management');
      R.kb_chars = kbContent.length;

      // Step 3: Build full intelligence package for Opus
      var webIntel = '';
      if (web1 && web1.length > 50) webIntel += '\n=== WEB INTEL 1 — FEMA PA METHODOLOGY ===\n' + web1.slice(0,2000);
      if (web2 && web2.length > 50) webIntel += '\n\n=== WEB INTEL 2 — AGENCY & LOUISIANA CONTEXT ===\n' + web2.slice(0,1500);
      if (web3 && web3.length > 50) webIntel += '\n\n=== WEB INTEL 3 — CDBG-DR & COMPLIANCE ===\n' + web3.slice(0,1500);
      var kbIntel = kbContent.length > 100 ? '\n\n=== HGI KNOWLEDGE BASE — INSTITUTIONAL METHODOLOGY ===\n' + kbContent.slice(0,3000) : '';
      var memIntel = memCtx.length > 100 ? '\n\n=== ORGANISM INTELLIGENCE — WHAT AGENTS KNOW ===\n' + memCtx.slice(0,2000) : '';

      var proposalSystem =
        'You are the most capable government proposal writer in the world, combining 30 years of winning FEMA PA and CDBG-DR proposals with deep knowledge of current federal methodology, agency expectations, and competitive positioning.' +
        '\n\nYou have five intelligence sources: (1) The current RFP and draft proposal, (2) Quality gate findings showing exactly what scores low and why, (3) Live web research on current FEMA/HUD methodology and best practices, (4) HGI institutional knowledge base built over 95 years, (5) Organism memory of competitive intelligence on this specific opportunity.' +
        '\n\nYour mission: Use ALL five sources together to produce the highest-scoring possible proposal sections. Extended thinking is enabled — use it to synthesize across all sources before writing.' +
        '\n\nCRITICAL BUILD RULES:' +
        '\n1. MISSING SECTIONS: If a required RFP section is absent or thin relative to its eval point weight — BUILD IT COMPLETELY. Do not flag it, fill it. Use web research for current methodology, KB for HGI-specific content, RFP for structure.' +
        '\n2. TECHNICAL APPROACH IS PRIORITY 1 (30 points). If Section D is weak: write complete methodology with FEMA PA process workflows, PW formulation standards, PAPPG citations, CDBG-DR compliance framework, agency liaison protocols, staffing mobilization model, named HGI staff with specific credentials tied to specific deliverables. Use tables and matrices where evaluators expect them.' +
        '\n3. METHODOLOGY = CURRENT BEST PRACTICE + HGI PROOF. Web research tells you what winning proposals include. KB tells you how HGI actually does it. Combine them — do not use one without the other.' +
        '\n4. CONFIRMED HGI REFERENCES ARE FACTS. Use exactly as written, never question: Paul Rainwater (rainwater97@gmail.com, 225-281-8176), Jeff Haley (jeff.haley@la.gov, 225-330-0036), Pat Forbes (Patrick.Forbes@la.gov, 225-342-1626), Bubba Orgeron (bubbaorgeron@tpsd.org, 985-876-7400), Gregory Harding (gregoryharding@tpsd.org, 985-688-0052).' +
        '\n5. OUTPUT = SUBMISSION-READY TEXT. Write complete paragraphs, tables, matrices, and structured sections ready to paste directly into the proposal. Never describe what should be written — write it.' +
        '\n6. NO FABRICATION. Do not invent past performance values, contract amounts, staff credentials, or claims not supported by the draft, KB, or web research.';

      var proposalPrompt =
        '=== RFP & CURRENT DRAFT ===\n' + ctx.slice(0,14000) +
        '\n\n=== QUALITY GATE FINDINGS (what is scoring low and why) ===\n' + g.slice(0,2000) +
        '\n\n=== WINNABILITY ASSESSMENT ===\n' + w.slice(0,1000) +
        webIntel + kbIntel + memIntel +
        '\n\n=== YOUR TASK ===' +
        '\nUsing ALL intelligence sources above, produce complete submission-ready proposal text for every section that is missing, weak, or scoring below 8/10.' +
        '\nPrioritize by evaluation point weight. Technical Approach (30 pts) first. Then Past Performance (20 pts). Then Personnel (15 pts). Then Qualifications (25 pts).' +
        '\nFor each section: write the complete final text, not notes or suggestions. Include specific FEMA terminology, policy guide citations, HGI staff credentials tied to deliverables, and quantified evidence where web research or KB supports it.';

      var p = await opusProposal(proposalSystem, proposalPrompt);

      if (p.length > 200 && !p.startsWith('API_ERR') && !p.startsWith('ERR:')) {
        await mem('proposal_agent', opp.id, opp.agency+',proposal,opus,extended_thinking', 'OPUS PROPOSAL (gate='+gateVerdict+' | web+kb+memory):\n'+p, 'pattern');
        R.agents.push({a:'proposal_opus',c:p.length,sources:['gate','winnability','web_x3','kb','memory']});
      } else {
        R.errors.push({a:'prop_opus',r:(p||'').slice(0,200)});
      }
    }

  } catch(e) { R.errors.push({fatal:e.message}); }

  try { await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers: Object.assign({},H,{'Prefer':'return=minimal'}), body: JSON.stringify({id:'hr-sonnet-'+Date.now(), source:'sonnet_work', status: R.agents.length+'/3 agents | '+R.errors.length+' errors | web:'+R.web_searches+' kb:'+R.kb_chars, run_at: new Date().toISOString(), opportunities_found: 0}) }); } catch(e) {}

  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}