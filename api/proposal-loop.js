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
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxT || 4000, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return 'API_ERR_' + r.status;
    var d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return 'ERR: ' + e.message; }
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), steps: [], errors: [] };
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
    // STEP 2: Rewrite weakest sections using gate + proposal findings
    var rewritePrompt = '=== CURRENT PROPOSAL DRAFT ===\n' + draft.slice(0,15000) + '\n\n=== QUALITY GATE FINDINGS ===\n' + gateText.slice(0,2500) + '\n\n=== PROPOSAL AGENT IMPROVEMENTS ===\n' + propText.slice(0,2500) + '\n\n=== WINNABILITY ASSESSMENT ===\n' + winText.slice(0,1500) + '\n\n=== SCOPE/EVAL CRITERIA ===\n' + (opp.scope_analysis||'').slice(0,3000) + '\n\nYou are rewriting this proposal to score higher. You have the quality gate deficiencies and the proposal agent improvements above.\n\nRULES:\n1. Output the COMPLETE improved proposal — every section, not just changed parts\n2. Preserve ALL [ACTION REQUIRED] flags exactly as they appear\n3. Preserve the version header but update it: [ORGANISM DRAFT v3 — Improved from WORKING DRAFT v2]\n4. Preserve all rates, personnel names, contact info, exhibit listings exactly\n5. Rewrite ONLY the sections the gate and proposal agent identified as weak\n6. Make Technical Approach (Section D) more St. George-specific per gate findings\n7. Strengthen competitive differentiation language per winnability assessment\n8. Do NOT remove any content — only improve existing content\n9. Do NOT add fabricated past performance, personnel, or claims\n10. Keep the same section structure A through G plus Exhibits\n\nOutput the complete improved proposal now.';
    var improved = await sonnet('Senior government proposal writer. You are improving an existing draft using specific findings from quality gate and proposal improvement agents. Preserve everything that works. Fix only what the agents identified as weak. Output the COMPLETE proposal.', rewritePrompt, 8000);
    if (improved.length < 1000 || improved.startsWith('API_ERR') || improved.startsWith('ERR:')) {
      R.errors.push({ step: 'rewrite', msg: improved.slice(0,200) });
      return res.status(200).json(R);
    }
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
      await mem('proposal_loop', opp.id, opp.agency + ',proposal_loop,improvement', 'PROPOSAL LOOP APPLIED: Score ' + R.before_score + ' -> ' + R.after_score + ' (+' + R.score_delta + '). Draft updated from ' + R.draft_chars + ' to ' + R.improved_chars + ' chars. Key changes: addressed gate deficiencies in technical approach, strengthened competitive differentiation.', 'pattern');
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