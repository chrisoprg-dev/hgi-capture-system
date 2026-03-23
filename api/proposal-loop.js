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

async function runOpp(opp, R) {
  var oppR = { opp: opp.title, draft_chars: (opp.staffing_plan||'').length, steps: [], errors: [], action: null };
  try {
    var draft = opp.staffing_plan || '';
    // Load latest agent findings from memory for THIS opp
    var mems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&memory_type=neq.decision_point&order=created_at.desc&limit=30&select=agent,observation', { headers: H })).json();
    // Fallback: if no opp-specific memories, load global recent memories
    if (!mems || !mems.length) {
      mems = await (await fetch(SB + '/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=30&select=agent,observation', { headers: H })).json();
    }
    var gateText = '';
    var propText = '';
    var winText = '';
    var redText = '';
    for (var i = 0; i < (mems||[]).length; i++) {
      var m = mems[i];
      if (m.agent === 'quality_gate' && !gateText) gateText = (m.observation||'').slice(0,3000);
      if (m.agent === 'proposal_agent' && !propText) propText = (m.observation||'').slice(0,3000);
      if (m.agent === 'winnability_agent' && !winText) winText = (m.observation||'').slice(0,2000);
      if (m.agent === 'red_team' && !redText) redText = (m.observation||'').slice(0,2500);
    }
    if (!gateText && !propText && !redText) { oppR.steps.push('no_findings_skip'); return oppR; }
    // Extract red team adversarial HGI score
    var redTeamScore = null;
    if (redText) {
      var rtMatch = redText.match(/TOTALS[^\n]*\n[^\n]*HGI:\s*(\d+)\s*\/\s*100/i);
      if (!rtMatch) rtMatch = redText.match(/HGI:\s*(\d+)\s*\/\s*100/i);
      if (rtMatch) redTeamScore = parseInt(rtMatch[1]);
    }
    oppR.red_team_score = redTeamScore;
    oppR.gate_chars = gateText.length;
    oppR.prop_chars = propText.length;
    // STEP 1: Score current draft
    var scorePrompt = '=== CURRENT DRAFT ===\n' + draft.slice(0,22000) + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,4000) + '\n\nScore this proposal 0-100 as a real evaluator would. First line MUST be: SCORE: XX/100. Then 2 sentences why.';
    var beforeScore = await sonnet('Senior government proposal evaluator. Score ruthlessly. First line: SCORE: XX/100', scorePrompt, 500);
    var bMatch = beforeScore.match(/SCORE:\s*(\d+)/i);
    oppR.before_score = bMatch ? parseInt(bMatch[1]) : 0;
    oppR.steps.push('scored_before');
    // STEP 2: Identify weakest section dynamically
    var headerMatches = [];
    var headerRegex = /^\*\*([^\n*]{3,80})\*\*/gm;
    var hm;
    while ((hm = headerRegex.exec(draft)) !== null) {
      headerMatches.push({ header: hm[1].trim(), index: hm.index });
    }
    if (headerMatches.length < 2) {
      var altRegex = /^(#{1,3}\s+.{3,80}|[A-Z][\w\s]{3,60}:?$|\d+\.\s+[A-Z].{3,60})/gm;
      while ((hm = altRegex.exec(draft)) !== null) {
        headerMatches.push({ header: hm[1].trim().replace(/^#+\s+/,''), index: hm.index });
      }
    }
    oppR.sections_found = headerMatches.length;
    var sectionList = headerMatches.slice(0, 20).map(function(h, i) { return i + ': ' + h.header; }).join('\n');
    var identifyPrompt = '=== DRAFT SECTIONS IN THIS PROPOSAL ===\n' + sectionList + '\n\n=== QUALITY GATE FINDINGS ===\n' + gateText.slice(0,2000) + '\n\n=== PROPOSAL AGENT IMPROVEMENTS ===\n' + propText.slice(0,2000) + '\n\n=== RED TEAM SCORE MATRIX & GAP ANALYSIS ===\n' + (redText ? redText.slice(0,1500) : '(not yet run)') + '\n\nWhich section number (from the list above) scored lowest and has the highest point impact if improved?\nFirst line MUST be: WEAKEST_INDEX: [number]\nSecond line MUST be: WEAKEST_HEADER: [exact header text from the list]';
    var weakest = await sonnet('Identify the single weakest proposal section by evaluator point impact. Use ONLY section numbers from the provided list.', identifyPrompt, 200);
    var wIdxMatch = weakest.match(/WEAKEST_INDEX:\s*(\d+)/i);
    var wHdrMatch = weakest.match(/WEAKEST_HEADER:\s*(.+)/i);
    var targetIdx = wIdxMatch ? parseInt(wIdxMatch[1]) : 0;
    var targetHeader = wHdrMatch ? wHdrMatch[1].trim() : (headerMatches.length > 0 ? headerMatches[0].header : '');
    oppR.target_section = targetHeader;
    oppR.steps.push('identified_weakest');
    // Extract section
    var sIdx = -1;
    var sEnd = draft.length;
    if (targetIdx < headerMatches.length) {
      sIdx = headerMatches[targetIdx].index;
      if (targetIdx + 1 < headerMatches.length) { sEnd = headerMatches[targetIdx + 1].index; }
    }
    if (sIdx === -1) {
      var searchFor = '**' + targetHeader + '**';
      sIdx = draft.indexOf(searchFor);
      if (sIdx === -1) sIdx = draft.indexOf(targetHeader);
    }
    if (sIdx === -1) { oppR.errors.push({step:'section_not_found', section:targetHeader}); return oppR; }
    var originalSection = draft.slice(sIdx, sEnd);
    oppR.original_section_chars = originalSection.length;
    // Rewrite section
    var rewritePrompt = '=== SECTION TO IMPROVE ===\n' + originalSection.slice(0,6000) + '\n\n=== QUALITY GATE FINDINGS ===\n' + gateText.slice(0,2000) + '\n\n=== PROPOSAL AGENT IMPROVEMENTS ===\n' + propText.slice(0,2000) + '\n\n=== WINNABILITY ASSESSMENT ===\n' + winText.slice(0,1000) + '\n\n=== RED TEAM GAP ANALYSIS ===\n' + (redText ? redText.slice(0,2000) : '(not yet run)') + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,2000) + '\n\nRewrite this section to score higher. RULES:\n1. Keep the same section header and structure\n2. Preserve ALL [ACTION REQUIRED] flags exactly\n3. Preserve all rates, names, contact info, credentials exactly\n4. Make it more specific to the agency and RFP requirements\n5. Strengthen competitive differentiation\n6. Add quantified evidence where the gate found gaps\n7. Do NOT fabricate past performance or claims\n8. Output ONLY the improved section';
    var improvedSection = await sonnet('Senior proposal writer rewriting one section to maximize evaluator score. Output ONLY the improved section text.', rewritePrompt, 4000);
    if (improvedSection.length < 200 || improvedSection.startsWith('API_ERR') || improvedSection.startsWith('ERR:')) {
      oppR.errors.push({ step: 'rewrite', msg: improvedSection.slice(0,200) });
      return oppR;
    }
    oppR.improved_section_chars = improvedSection.length;
    var improved = draft.slice(0, sIdx) + improvedSection + draft.slice(sEnd);
    oppR.improved_chars = improved.length;
    oppR.steps.push('rewritten');
    // STEP 3: Score improved draft
    var afterPrompt = '=== IMPROVED DRAFT ===\n' + improved.slice(0,22000) + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,4000) + '\n\nScore this proposal 0-100 as a real evaluator would. First line MUST be: SCORE: XX/100. Then 2 sentences why.';
    var afterScore = await sonnet('Senior government proposal evaluator. Score ruthlessly. First line: SCORE: XX/100', afterPrompt, 500);
    var aMatch = afterScore.match(/SCORE:\s*(\d+)/i);
    oppR.after_score = aMatch ? parseInt(aMatch[1]) : 0;
    oppR.steps.push('scored_after');
    oppR.score_delta = oppR.after_score - oppR.before_score;
    // STEP 4: Decision — use red team baseline when available
    var baseline = (redTeamScore !== null) ? redTeamScore : oppR.before_score;
    oppR.baseline_used = (redTeamScore !== null) ? 'red_team' : 'self_scored';
    oppR.baseline_score = baseline;
    if (oppR.after_score > baseline && improved.length > draft.length * 0.7) {
      await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opp.id), { method: 'PATCH', headers: H, body: JSON.stringify({ staffing_plan: improved, last_updated: new Date().toISOString() }) });
      oppR.action = 'APPLIED';
      oppR.steps.push('draft_updated');
      await mem('proposal_loop', opp.id, opp.agency + ',proposal_loop,improvement', 'PROPOSAL LOOP APPLIED: Score ' + oppR.before_score + ' -> ' + oppR.after_score + ' (+' + oppR.score_delta + '). Section improved: ' + oppR.target_section + '.', 'pattern');
      // Auto-generate Word doc
      try {
        var docR = await fetch('https://hgi-capture-system.vercel.app/api/generate-doc?opp=' + encodeURIComponent(opp.id));
        if (docR.ok) {
          var docD = await docR.json();
          oppR.doc_generated = docD.success || false;
          oppR.doc_url = docD.download_url || null;
          oppR.doc_sections = docD.sections_parsed || 0;
          oppR.steps.push('docx_generated');
          if (docD.success) {
            fetch('https://hgi-capture-system.vercel.app/api/submission-assembly?opp=' + encodeURIComponent(opp.id)).catch(function() {});
            oppR.steps.push('submission_assembly_triggered');
          }
        } else { oppR.errors.push({ step: 'doc_gen', status: docR.status }); }
      } catch(docErr) { oppR.errors.push({ step: 'doc_gen', msg: docErr.message }); }
    } else {
      oppR.action = 'REVERTED';
      oppR.steps.push('kept_original');
      await mem('proposal_loop', opp.id, opp.agency + ',proposal_loop,reverted', 'PROPOSAL LOOP REVERTED: Score ' + oppR.before_score + ' -> ' + oppR.after_score + ' (' + oppR.score_delta + '). Draft NOT updated.', 'analysis');
      await mem('proposal_loop_draft', opp.id, opp.agency + ',proposal_draft_candidate', improved.slice(0, 8000), 'pattern');
    }
  } catch(e) { oppR.errors.push({ fatal: e.message }); }
  return oppR;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), opps_processed: [], errors: [] };
  // DAILY RUN GUARD
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
    // Load ALL active proposal/pursuing opps with OPI 65+
    var allOpps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&select=id,title,agency,opi_score,scope_analysis,staffing_plan,capture_action,financial_analysis&order=opi_score.desc&limit=5', { headers: H })).json();
    if (!allOpps || !allOpps.length) return res.status(200).json({ note: 'No proposal/pursuing opps with OPI 65+' });
    // Filter to opps with substantial drafts
    var oppsWithDraft = allOpps.filter(function(o) { return (o.staffing_plan||'').length >= 1000; });
    if (!oppsWithDraft.length) return res.status(200).json({ note: 'No opps with draft >= 1000 chars', titles: allOpps.map(function(o) { return o.title; }) });
    R.total_qualifying = allOpps.length;
    R.total_with_draft = oppsWithDraft.length;
    // Sequential loop — each opp gets full score/rewrite/score/decision cycle
    for (var oi = 0; oi < oppsWithDraft.length; oi++) {
      var oppResult = await runOpp(oppsWithDraft[oi], R);
      R.opps_processed.push(oppResult);
    }
  } catch(e) { R.errors.push({ fatal: e.message }); }
  // Run log summary
  try {
    var applied = R.opps_processed.filter(function(o) { return o.action === 'APPLIED'; }).length;
    var reverted = R.opps_processed.filter(function(o) { return o.action === 'REVERTED'; }).length;
    var skipped = R.opps_processed.filter(function(o) { return !o.action; }).length;
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'hr-loop-' + Date.now(), source: 'proposal_loop', status: R.opps_processed.length + ' opps | ' + applied + ' applied | ' + reverted + ' reverted | ' + skipped + ' skipped', run_at: new Date().toISOString(), opportunities_found: 0 }) });
  } catch(e) {}
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}