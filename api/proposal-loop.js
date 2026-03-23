export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
async function mem(agent, oppId, tags, obs, mType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: obs, memory_type: mType || 'analysis', created_at: new Date().toISOString() }) }); } catch(e) {}
}
async function sonnet(system, prompt, maxT) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxT || 4000, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERR_' + r.status;
    var d = await r.json();
    if (d.usage) logCost('proposal_loop', 'claude-sonnet-4-6', d.usage.input_tokens||0, d.usage.output_tokens||0, 'proposal-loop');
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}
function getCSTDateStr() { return new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10); }
function logCost(agent, model, inTok, outTok, endpoint) {
  var p = model.indexOf('sonnet') !== -1 ? { in: 0.000003, out: 0.000015 } : { in: 0.00000025, out: 0.00000125 };
  var cost = inTok * p.in + outTok * p.out;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), source: 'api_cost', status: JSON.stringify({ agent: agent, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: endpoint || 'proposal-loop' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), steps: [], errors: [] };
  // DAILY RUN GUARD — one run per day CST. Prevents accidental double-spend from manual triggers.
  var force = (req.query && req.query.force === 'true');
  if (!force) {
    try {
      var todayCST = getCSTDateStr();
      var recent = await (await fetch(SB + '/rest/v1/hunt_runs?source=eq.proposal_loop&order=run_at.desc&limit=5', { headers: H })).json();
      var ranToday = (recent||[]).some(function(r) { return (r.run_at||'').slice(0,10) === todayCST && (r.status||'').indexOf('error') === -1; });
      if (ranToday) return res.status(200).json({ skipped: true, reason: 'Already ran today CST (' + todayCST + '). Use ?force=true to override.' });
    } catch(e) {}
  }
  try {
    // Load highest-priority proposal-stage opp
    var opps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=eq.proposal&opi_score=gte.65&select=id,title,agency,opi_score,scope_analysis,staffing_plan,capture_action,financial_analysis&order=opi_score.desc&limit=1', { headers: H })).json();
    if (!opps || !opps.length) return res.status(200).json({ note: 'No proposal-stage opp' });
    var opp = opps[0];
    var draft = opp.staffing_plan || '';
    R.opp = opp.title;
    R.draft_chars = draft.length;
    if (draft.length < 1000) return res.status(200).json({ note: 'Draft too short', opp: opp.title });
    // Load latest Sonnet findings from memory
    var mems = await (await fetch(SB + '/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=30&select=agent,observation', { headers: H })).json();
    var gateText = '';
    var propText = '';
    var winText = '';
    var redText = '';
    for (var i = 0; i < (mems||[]).length; i++) {
      var m = mems[i];
      if (m.agent === 'quality_gate' && !gateText) gateText = (m.observation||'').slice(0,3000);
      if (m.agent === 'proposal_agent' && !propText) propText = (m.observation||'').slice(0,3000);
      if (m.agent === 'winnability_agent' && !winText) winText = (m.observation||'').slice(0,2000);
    }
    if (!gateText && !propText) return res.status(200).json({ note: 'No Sonnet findings yet', opp: opp.title });
    R.gate_chars = gateText.length;
    R.prop_chars = propText.length;
    // STEP 1: Score current draft
    var scorePrompt = '=== CURRENT DRAFT ===\n' + draft.slice(0,15000) + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,4000) + '\n\nScore this proposal 0-100 as a real evaluator would. First line MUST be: SCORE: XX/100. Then 2 sentences why.';
    var beforeScore = await sonnet('Senior government proposal evaluator. Score ruthlessly. First line: SCORE: XX/100', scorePrompt, 500);
    var bMatch = beforeScore.match(/SCORE:\s*(\d+)/i);
    R.before_score = bMatch ? parseInt(bMatch[1]) : 0;
    R.steps.push('scored_before');
    // STEP 2: Identify weakest section dynamically from THIS draft's actual structure
    // Extract all section headers from the draft — works for ANY RFP structure, not just A-G
    var headerMatches = [];
    var headerRegex = /^\*\*([^\n*]{3,80})\*\*/gm;
    var hm;
    while ((hm = headerRegex.exec(draft)) !== null) {
      headerMatches.push({ header: hm[1].trim(), index: hm.index });
    }
    // Fallback: look for numbered or lettered headers without bold markers
    if (headerMatches.length < 2) {
      var altRegex = /^(#{1,3}\s+.{3,80}|[A-Z][\w\s]{3,60}:?$|\d+\.\s+[A-Z].{3,60})/gm;
      while ((hm = altRegex.exec(draft)) !== null) {
        headerMatches.push({ header: hm[1].trim().replace(/^#+\s+/,''), index: hm.index });
      }
    }
    R.sections_found = headerMatches.length;
    // Ask AI to identify weakest section using actual section names from this draft
    var sectionList = headerMatches.slice(0, 20).map(function(h, i) { return i + ': ' + h.header; }).join('\n');
    var identifyPrompt = '=== DRAFT SECTIONS IN THIS PROPOSAL ===\n' + sectionList + '\n\n=== QUALITY GATE FINDINGS ===\n' + gateText.slice(0,2000) + '\n\n=== PROPOSAL AGENT IMPROVEMENTS ===\n' + propText.slice(0,2000) + '\n\nWhich section number (from the list above) scored lowest and has the highest point impact if improved?\nFirst line MUST be: WEAKEST_INDEX: [number]\nSecond line MUST be: WEAKEST_HEADER: [exact header text from the list]';
    var weakest = await sonnet('Identify the single weakest proposal section by evaluator point impact. Use ONLY section numbers from the provided list.', identifyPrompt, 200);
    var wIdxMatch = weakest.match(/WEAKEST_INDEX:\s*(\d+)/i);
    var wHdrMatch = weakest.match(/WEAKEST_HEADER:\s*(.+)/i);
    var targetIdx = wIdxMatch ? parseInt(wIdxMatch[1]) : 0;
    var targetHeader = wHdrMatch ? wHdrMatch[1].trim() : (headerMatches.length > 0 ? headerMatches[0].header : '');
    R.target_section = targetHeader;
    R.steps.push('identified_weakest');
    // Extract section using found header positions — works for any structure
    var sIdx = -1;
    var sEnd = draft.length;
    if (targetIdx < headerMatches.length) {
      sIdx = headerMatches[targetIdx].index;
      // End at next section header, or end of draft
      if (targetIdx + 1 < headerMatches.length) {
        sEnd = headerMatches[targetIdx + 1].index;
      }
    }
    if (sIdx === -1) {
      // Last fallback: search for the header text directly
      var searchFor = '**' + targetHeader + '**';
      sIdx = draft.indexOf(searchFor);
      if (sIdx === -1) sIdx = draft.indexOf(targetHeader);
    }
    if (sIdx === -1) { R.errors.push({step:'section_not_found', section:targetHeader, sections_found:headerMatches.length}); return res.status(200).json(R); }
    var originalSection = draft.slice(sIdx, sEnd);
    R.original_section_chars = originalSection.length;
    // Rewrite just this section
    var rewritePrompt = '=== SECTION TO IMPROVE ===\n' + originalSection.slice(0,6000) + '\n\n=== QUALITY GATE FINDINGS ===\n' + gateText.slice(0,2000) + '\n\n=== PROPOSAL AGENT IMPROVEMENTS ===\n' + propText.slice(0,2000) + '\n\n=== WINNABILITY ASSESSMENT ===\n' + winText.slice(0,1000) + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,2000) + '\n\nRewrite this section to score higher. RULES:\n1. Keep the same section header and structure\n2. Preserve ALL [ACTION REQUIRED] flags exactly\n3. Preserve all rates, names, contact info, credentials exactly\n4. Make it more specific to the agency and RFP requirements\n5. Strengthen competitive differentiation\n6. Add quantified evidence where the gate found gaps\n7. Do NOT fabricate past performance or claims\n8. Output ONLY the improved section — nothing before or after it';
    var improvedSection = await sonnet('Senior proposal writer rewriting one section to maximize evaluator score. Output ONLY the improved section text.', rewritePrompt, 4000);
    if (improvedSection.length < 200 || improvedSection.startsWith('API_ERR') || improvedSection.startsWith('ERR:')) {
      R.errors.push({ step: 'rewrite', msg: improvedSection.slice(0,200) });
      return res.status(200).json(R);
    }
    R.improved_section_chars = improvedSection.length;
    // Splice improved section back into full draft
    var improved = draft.slice(0, sIdx) + improvedSection + draft.slice(sEnd);
    R.improved_chars = improved.length;
    R.steps.push('rewritten');
    // STEP 3: Score improved draft
    var afterPrompt = '=== IMPROVED DRAFT ===\n' + improved.slice(0,15000) + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,4000) + '\n\nScore this proposal 0-100 as a real evaluator would. First line MUST be: SCORE: XX/100. Then 2 sentences why.';
    var afterScore = await sonnet('Senior government proposal evaluator. Score ruthlessly. First line: SCORE: XX/100', afterPrompt, 500);
    var aMatch = afterScore.match(/SCORE:\s*(\d+)/i);
    R.after_score = aMatch ? parseInt(aMatch[1]) : 0;
    R.steps.push('scored_after');
    R.score_delta = R.after_score - R.before_score;
    // STEP 4: Decision — keep or revert
    if (R.after_score > R.before_score && improved.length > draft.length * 0.7) {
      // Improved — write it back
      await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opp.id), { method: 'PATCH', headers: H, body: JSON.stringify({ staffing_plan: improved, last_updated: new Date().toISOString() }) });
      R.action = 'APPLIED';
      R.steps.push('draft_updated');
      await mem('proposal_loop', opp.id, opp.agency + ',proposal_loop,improvement', 'PROPOSAL LOOP APPLIED: Score ' + R.before_score + ' -> ' + R.after_score + ' (+' + R.score_delta + '). Draft updated from ' + R.draft_chars + ' to ' + R.improved_chars + ' chars. Section improved: ' + R.target_section + '.', 'pattern');
    } else {
      // Score dropped or draft shrunk — store in memory but do NOT overwrite
      R.action = 'REVERTED';
      R.steps.push('kept_original');
      await mem('proposal_loop', opp.id, opp.agency + ',proposal_loop,reverted', 'PROPOSAL LOOP REVERTED: Score ' + R.before_score + ' -> ' + R.after_score + ' (' + R.score_delta + '). Draft NOT updated. Improved version (' + improved.length + ' chars) stored in memory only.', 'analysis');
      // Store the improved version in memory so it is not lost
      await mem('proposal_loop_draft', opp.id, opp.agency + ',proposal_draft_candidate', improved.slice(0, 8000), 'pattern');
    }
  } catch(e) { R.errors.push({ fatal: e.message }); }
  try { await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'hr-loop-' + Date.now(), source: 'proposal_loop', status: (R.action||'error') + ' | ' + (R.before_score||0) + '->' + (R.after_score||0) + ' | ' + (R.score_delta||0), run_at: new Date().toISOString(), opportunities_found: 0 }) }); } catch(e) {}
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}