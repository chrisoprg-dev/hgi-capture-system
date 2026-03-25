// api/opus-build.js — Opus proposal builder with full 300s
// Runs 5 min after sonnet-work. Reads gate + winnability from organism_memory.
// Does: parallel web searches + KB query + Opus extended thinking on FULL draft.
// Opus sees everything — no context cuts.
export const config = { maxDuration: 300 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var AK = process.env.ANTHROPIC_API_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
var d = String.fromCharCode(36);

function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function logCost(agent, model, inTok, outTok) {
  var p;
  if (model.indexOf('opus') !== -1) p = { in: 0.000005, out: 0.000025 };
  else if (model.indexOf('sonnet') !== -1) p = { in: 0.000003, out: 0.000015 };
  else p = { in: 0.00000025, out: 0.00000125 };
  var cost = inTok * p.in + outTok * p.out;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-ob-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), source: 'api_cost', status: JSON.stringify({ agent: agent, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: 'opus-build' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}

async function mem(agent, oppId, tags, obs, mType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: obs, memory_type: mType || 'analysis', created_at: new Date().toISOString() }) }); return true; } catch(e) { return false; }
}

async function webSearch(query) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Government proposal research analyst. Find specific, current, actionable information for proposal writing. Cite sources. Be concise.', messages: [{ role: 'user', content: query }] }) });
    if (!r.ok) return '';
    var dd = await r.json();
    if (dd.usage) logCost('web_search', 'claude-haiku-4-5-20251001', dd.usage.input_tokens||0, dd.usage.output_tokens||0);
    return (dd.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}

async function queryKB(query) {
  try {
    var r = await fetch('https://hgi-capture-system.vercel.app/api/knowledge-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query, limit: 12 }) });
    if (!r.ok) return '';
    var dd = await r.json();
    var chunks = dd.results || dd.chunks || [];
    return chunks.map(function(c) { return (c.content || c.text || '').slice(0, 500); }).join('\n\n');
  } catch(e) { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), status: 'starting' };
  try {
    // Get highest OPI active opp with a draft
    var opps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&order=opi_score.desc&limit=1&select=id,title,agency,vertical,state,opi_score,scope_analysis,financial_analysis,research_brief,staffing_plan,capture_action', { headers: H })).json();
    if (!opps || !opps.length) return res.status(200).json({ note: 'No active opps' });
    var opp = opps[0];
    if ((opp.staffing_plan||'').length < 200) return res.status(200).json({ note: 'No draft for ' + opp.title });
    R.opp = opp.title;
    R.opi = opp.opi_score;
    R.draft_chars = (opp.staffing_plan||'').length;
    await mem('opus_build', opp.id, 'checkpoint,start', 'OPUS-BUILD STARTED: ' + opp.title + ' | draft=' + R.draft_chars + 'chars | ' + new Date().toISOString(), 'system_alert');

    // Read gate + winnability from organism_memory (written by sonnet-work ~5 min ago)
    var gateMems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&agent=eq.quality_gate&order=created_at.desc&limit=1&select=observation', { headers: H })).json();
    var gateOutput = (gateMems && gateMems[0] && gateMems[0].observation) || '';
    var winMems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&agent=eq.winnability_agent&order=created_at.desc&limit=1&select=observation', { headers: H })).json();
    var winOutput = (winMems && winMems[0] && winMems[0].observation) || '';
    // All organism memory for this opp
    var allMems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&memory_type=neq.decision_point&memory_type=neq.system_alert&order=created_at.desc&limit=20&select=agent,observation,memory_type', { headers: H })).json();
    var memCtx = (allMems||[]).map(function(m) { return '[' + m.agent + ']: ' + (m.observation||'').slice(0, 350); }).join('\n\n');
    R.gate_len = gateOutput.length;
    R.win_len = winOutput.length;
    R.mem_count = (allMems||[]).length;

    // Build full context — NO CUTS to draft
    var ctx = '=== ' + opp.title + ' | ' + opp.agency + ' | OPI ' + opp.opi_score + ' ===\n' +
      (opp.scope_analysis||'') + '\n---\nCURRENT PROPOSAL DRAFT:\n' +
      (opp.staffing_plan||'') + '\n---\n' +
      (opp.capture_action||'') + '\n---\n' +
      (opp.financial_analysis||'');

    // Parallel: 2 web searches + KB query (all at once, ~15s total)
    var vertical = (opp.vertical || 'professional services').trim();
    var agency = (opp.agency || '').trim();
    var state = (opp.state || 'Louisiana').trim();
    var scopeSnippet = (opp.scope_analysis || '').replace(/[^a-zA-Z0-9 .,\-]/g, ' ').slice(0, 150).trim();
    var kbQuery = vertical + ' ' + opp.title + ' ' + scopeSnippet.slice(0,100);
    var results = await Promise.all([
      webSearch(scopeSnippet.slice(0,100) + ' ' + vertical + ' methodology best practices 2025 2026'),
      webSearch(agency + ' ' + state + ' contracts awarded consultant ' + vertical + ' 2024 2025 2026'),
      queryKB(kbQuery)
    ]);
    var web1 = results[0];
    var web2 = results[1];
    var kbContent = results[2];
    R.web1_len = web1.length;
    R.web2_len = web2.length;
    R.kb_len = kbContent.length;
    await mem('opus_build', opp.id, 'checkpoint,research_done', 'CHECKPOINT research done: web1=' + web1.length + ' web2=' + web2.length + ' kb=' + kbContent.length + ' | ' + new Date().toISOString(), 'system_alert');

    // Assemble intelligence
    var webIntel = '';
    if (web1.length > 50) webIntel += '\n=== WEB RESEARCH — METHODOLOGY & BEST PRACTICES ===\n' + web1.slice(0,2000);
    if (web2.length > 50) webIntel += '\n\n=== WEB RESEARCH — AGENCY INTELLIGENCE & SIMILAR AWARDS ===\n' + web2.slice(0,1500);
    var kbIntel = kbContent.length > 100 ? '\n\n=== HGI KNOWLEDGE BASE ===\n' + kbContent.slice(0,3000) : '';
    var memIntel = memCtx.length > 100 ? '\n\n=== ORGANISM INTELLIGENCE ===\n' + memCtx.slice(0,2000) : '';

    // Opus call — full draft, full context, full 300s window
    var proposalSystem =
      'You are the most capable government proposal writer in the world with 30 years of experience winning government contracts across all service verticals.' +
      '\n\nYou are building a proposal for: ' + opp.title + ' | Client: ' + agency + ' | Service area: ' + vertical +
      '\n\nYou have five intelligence sources: (1) The actual RFP requirements and current draft, (2) Quality gate findings showing what scores low and why, (3) Live web research on current methodology and best practices FOR THIS SPECIFIC SERVICE TYPE, (4) HGI institutional knowledge base, (5) Competitive intelligence on this opportunity.' +
      '\n\nYour mission: OUTPUT A COMPLETE, UPDATED PROPOSAL DOCUMENT — every section from the first word to the last. Read the existing draft first. Keep every section scoring 8+/10 as-is. Rebuild every section scoring below 8/10 completely. Add every required section that is missing. Extended thinking is enabled — use it to synthesize all sources before writing. Your output IS the full improved proposal — not suggestions, not analysis, the actual submission-ready text.' +
      '\n\nCRITICAL BUILD RULES:' +
      '\n1. THIS RFP DRIVES EVERYTHING. Every section must be directly responsive to what THIS client asked for.' +
      '\n2. MISSING SECTIONS: Build completely from RFP requirements, web research, and HGI facts.' +
      '\n3. TECHNICAL APPROACH IS PRIORITY. Build specific methodology with workflow, tools, staff, and deliverables. Use web research for current best practice.' +
      '\n4. METHODOLOGY = CURRENT BEST PRACTICE + HGI PROOF. Web research shows what evaluators expect. KB shows what HGI does. Combine them.' +
      '\n5. CONFIRMED HGI REFERENCES ARE FACTS. Use exactly: Paul Rainwater (rainwater97@gmail.com, 225-281-8176), Jeff Haley (jeff.haley@la.gov, 225-330-0036), Pat Forbes (Patrick.Forbes@la.gov, 225-342-1626), Bubba Orgeron (bubbaorgeron@tpsd.org, 985-876-7400), Gregory Harding (gregoryharding@tpsd.org, 985-688-0052).' +
      '\n6. OUTPUT = SUBMISSION-READY TEXT. Complete paragraphs, tables, matrices ready to paste.' +
      '\n7. NO FABRICATION. Do not invent past performance values, contract amounts, or credentials not in the draft or KB.';

    var proposalPrompt =
      '=== THIS RFP AND CURRENT DRAFT (FULL — read every word) ===\n' + ctx +
      '\n\n=== QUALITY GATE FINDINGS ===\n' + gateOutput.slice(0,4000) +
      '\n\n=== WINNABILITY ASSESSMENT ===\n' + winOutput.slice(0,2000) +
      webIntel + kbIntel + memIntel +
      '\n\n=== YOUR TASK ===' +
      '\nRead the eval criteria in this RFP. Identify every section missing, weak, or scoring below 8/10.' +
      '\nPrioritize by point weight from the actual eval criteria.' +
      '\nFor each weak or missing section: write complete, submission-ready text using all five intelligence sources.' +
      '\nYour output MUST be the COMPLETE UPDATED PROPOSAL — every section, start to finish.' +
      '\nKeep sections scoring 8+/10. Rebuild sections below 8/10. Build missing sections completely.' +
      '\nReplace [ACTION REQUIRED] for technical content with actual text. Preserve [ACTION REQUIRED] only for physical certs/signatures.';

    var opusR = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 16000, thinking: { type: 'enabled', budget_tokens: 5000 }, system: proposalSystem, messages: [{ role: 'user', content: proposalPrompt }] }) });
    if (!opusR.ok) {
      var errTxt = await opusR.text();
      R.status = 'OPUS_ERROR_' + opusR.status;
      R.error = errTxt.slice(0, 500);
      await mem('opus_build', opp.id, 'error', 'OPUS API ERROR ' + opusR.status + ': ' + errTxt.slice(0, 500), 'system_alert');
    } else {
      var opusData = await opusR.json();
      if (opusData.usage) logCost('opus_build', 'claude-opus-4-6', opusData.usage.input_tokens||0, opusData.usage.output_tokens||0);
      var p = (opusData.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
      R.opus_output_len = p.length;

      if (p.length > 500) {
        // Write to memory
        await mem('proposal_agent', opp.id, opp.agency + ',proposal,opus,extended_thinking', 'OPUS PROPOSAL (opus-build | web+kb+memory+gate+win):\n' + p, 'pattern');
        // Write back to staffing_plan if longer than 40% of current draft
        var minLen = Math.max(500, Math.floor((opp.staffing_plan||'').length * 0.4));
        if (p.length > minLen) {
          await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opp.id), { method: 'PATCH', headers: H, body: JSON.stringify({ staffing_plan: p, last_updated: new Date().toISOString() }) });
          R.draft_written = true;
          R.new_draft_chars = p.length;
        }
        // Trigger kb-enrich async
        fetch('https://hgi-capture-system.vercel.app/api/kb-enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: p, gate_output: gateOutput.slice(0,1000), vertical: vertical, opp_title: opp.title, agency: agency }) }).catch(function() {});
        R.status = 'SUCCESS';
        await mem('opus_build', opp.id, 'checkpoint,complete', 'OPUS-BUILD COMPLETE: ' + p.length + ' chars written | ' + new Date().toISOString(), 'system_alert');
      } else {
        R.status = 'OPUS_OUTPUT_TOO_SHORT';
        R.opus_raw = p.slice(0, 300);
        await mem('opus_build', opp.id, 'error', 'OPUS OUTPUT TOO SHORT: ' + p.length + ' chars. Raw: ' + p.slice(0,300), 'system_alert');
      }
    }
  } catch(e) {
    R.status = 'FATAL';
    R.error = e.message;
    await mem('opus_build', null, 'error,fatal', 'OPUS-BUILD FATAL: ' + e.message, 'system_alert');
  }
  // Always log
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'hr-opus-' + Date.now(), source: 'opus_build', status: R.status + ' | ' + (R.opus_output_len||0) + ' chars', run_at: new Date().toISOString(), opportunities_found: 0 }) });
  } catch(e) {}
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}