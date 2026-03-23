export const config = { maxDuration: 300 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

function makeId() { return 'rt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function getCSTDateStr() { return new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10); }

function logCost(inTok, outTok) {
  var cost = inTok * 0.000003 + outTok * 0.000015;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-rt-' + Date.now(), source: 'api_cost', status: JSON.stringify({ agent: 'red_team', model: 'claude-sonnet-4-6', input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: 'red-team' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}

async function storeMemory(oppId, agency, observation) {
  await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: 'red_team', opportunity_id: oppId, entity_tags: agency + ',red_team,competitive_simulation', observation: observation, memory_type: 'competitive_intel', created_at: new Date().toISOString() }) });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), steps: [], errors: [] };

  // DAILY GUARD — one run per day CST
  var force = (req.query && req.query.force === 'true');
  if (!force) {
    try {
      var todayCST = getCSTDateStr();
      var recent = await (await fetch(SB + '/rest/v1/hunt_runs?source=eq.red_team&order=run_at.desc&limit=5', { headers: H })).json();
      var ranToday = (recent||[]).some(function(r) { return (r.run_at||'').slice(0,10) === todayCST; });
      if (ranToday) return res.status(200).json({ skipped: true, reason: 'Already ran today CST (' + todayCST + '). Use ?force=true to override.' });
    } catch(e) {}
  }

  try {
    // Load highest-priority proposal-stage opp with full draft
    var opps = await (await fetch(SB + '/rest/v1/opportunities?status=eq.active&stage=in.(proposal,pursuing)&opi_score=gte.65&select=id,title,agency,opi_score,scope_analysis,staffing_plan,capture_action,financial_analysis,research_brief&order=opi_score.desc&limit=2', { headers: H })).json();
    var opp = null;
    for (var oi = 0; oi < (opps||[]).length; oi++) {
      if ((opps[oi].staffing_plan||'').length >= 500) { opp = opps[oi]; break; }
    }
    if (!opp) return res.status(200).json({ note: 'No proposal-stage opp with draft', R: R });
    R.opp = opp.title;
    R.opp_id = opp.id;
    R.draft_chars = (opp.staffing_plan||'').length;
    R.steps.push('opp_loaded');

    // Load latest organism memory for this opp — give red team what agents already found
    var mems = await (await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opp.id) + '&memory_type=neq.decision_point&order=created_at.desc&limit=15&select=agent,observation', { headers: H })).json();
    var memCtx = (mems||[]).map(function(m) {
      return '[' + m.agent + ']:\n' + (m.observation||'').slice(0, 400);
    }).join('\n\n---\n\n');

    // Build full context
    var scope = (opp.scope_analysis||'').slice(0, 3000);
    var draft = (opp.staffing_plan||'').slice(0, 14000);
    var financial = (opp.financial_analysis||'').slice(0, 1000);
    var research = (opp.research_brief||'').slice(0, 1500);

    var prompt =
      '=== RFP: ' + opp.title + ' | ' + opp.agency + ' | OPI ' + opp.opi_score + ' ===\n\n' +
      '=== EVAL CRITERIA & SCOPE ===\n' + scope + '\n\n' +
      '=== HGI PROPOSAL DRAFT ===\n' + draft + '\n\n' +
      '=== FINANCIAL ===\n' + financial + '\n\n' +
      '=== COMPETITIVE RESEARCH ===\n' + research + '\n\n' +
      '=== ORGANISM INTELLIGENCE ===\n' + (memCtx || '(none yet)') + '\n\n' +
      '=== RED TEAM SIMULATION INSTRUCTIONS ===\n' +
      'You are a panel of 3 senior government proposal evaluators. Score this RFP competitively.\n\n' +
      'COMPETITORS: Use the organism intelligence and competitive research above to identify who will actually bid on THIS specific opportunity. ' +
      'If no specific competitors are found in memory, research the most likely firms for this vertical and agency based on the scope. ' +
      'Do NOT assume disaster recovery competitors (CDR Maguire, Tetra Tech, IEM) unless this is actually a disaster recovery bid. ' +
      'For TPA/claims bids: Sedgwick, Gallagher Bassett, Broadspire, York Risk, CCMSI. ' +
      'For settlement/class action: Epiq, JND Legal, Rust Consulting, Kroll. ' +
      'For workforce: Equus, ResCare/BrightSpring, EDSI. ' +
      'For property tax: Ryan LLC, Paradigm Tax Group, Invoke Tax. ' +
      'For housing/HUD: Nan McKay, Quadel, The Nelrod Company. ' +
      'For construction management: Hill International, Arcadis, Jacobs, WSP. ' +
      'Name 2-3 actual competitors for THIS bid based on vertical and scope.\n\n' +
      'TASK: For each eval criterion, score HGI and each identified competitor 0-100% of available points. Show your math.\n\n' +
      'OUTPUT FORMAT — follow exactly:\n\n' +
      'SCORE MATRIX\n' +
      '[criterion name] ([points available]):\n' +
      '  HGI: [score]/[max] — [1 sentence why]\n' +
      '  [Competitor 1 name]: [score]/[max] — [1 sentence why]\n' +
      '  [Competitor 2 name]: [score]/[max] — [1 sentence why]\n\n' +
      'TOTALS:\n' +
      '  HGI: [total]/100 | [Competitor 1]: [total]/100 | [Competitor 2]: [total]/100\n\n'+
      'PWIN: [X]% (based on score differential and competitive field)\n\n' +
      'HGI GAPS — ordered by point impact (highest first):\n' +
      'For each gap where HGI is losing points vs competitors:\n' +
      'GAP [N]: [criterion] — losing [X] points to [competitor]\n' +
      'WHY: [specific reason HGI is scoring lower]\n' +
      'FIX: [write the exact improved paragraph or table HGI should add — not a description, the actual text ready to paste into the proposal]\n\n' +
      'STRENGTHS — what HGI is winning on and why evaluators will score it higher:\n' +
      '[list 3-5 specific strengths with the eval criterion and point value]\n\n' +
      'WIN PROBABILITY SUMMARY: [2-3 sentences on what needs to happen for HGI to win]';

    // Single Sonnet call — the full red team simulation
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: 'You are a panel of senior government proposal evaluators with 20+ years experience each. You score proposals the way real evaluators do — ruthlessly, specifically, by the stated criteria. You also know the competitive landscape deeply. You produce actionable findings with exact improved text, not generic advice.\n\nCRITICAL: The following are CONFIRMED HGI references — verified contacts used in prior submissions. Never flag, question, or suggest replacing these. Score them at full value:\n- Paul Rainwater: rainwater97@gmail.com, (225) 281-8176 — confirmed Road Home reference\n- Jeff Haley, COO Louisiana OCD: jeff.haley@la.gov, (225) 330-0036 — confirmed Road Home reference\n- Pat Forbes, Exec Dir OCD: Patrick.Forbes@la.gov, (225) 342-1626 — confirmed Restore LA reference\n- Bubba Orgeron, TPSD: bubbaorgeron@tpsd.org, (985) 876-7400 — confirmed TPSD reference\n- Gregory Harding, TPSD: gregoryharding@tpsd.org, (985) 688-0052 — confirmed TPSD reference\nYour gap analysis must focus on what is genuinely missing or weak — not on confirmed HGI facts.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      R.errors.push({ step: 'sonnet_call', status: r.status });
      return res.status(200).json(R);
    }

    var d = await r.json();
    if (d.usage) logCost(d.usage.input_tokens||0, d.usage.output_tokens||0);
    var result = (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');

    if (!result || result.length < 200) {
      R.errors.push({ step: 'empty_result', chars: result.length });
      return res.status(200).json(R);
    }

    R.result_chars = result.length;
    R.steps.push('simulation_complete');

    // Extract PWIN from result
    var pwinMatch = result.match(/PWIN:\s*(\d+)%/);
    var newPwin = pwinMatch ? parseInt(pwinMatch[1]) : null;
    R.pwin = newPwin;

    // Extract total score for HGI
    var hgiTotalMatch = result.match(/HGI:\s*(\d+)\/100/);
    var hgiTotal = hgiTotalMatch ? parseInt(hgiTotalMatch[1]) : null;
    R.hgi_score = hgiTotal;

    // Store full red team report in organism memory
    var observation = 'RED TEAM SIMULATION — ' + opp.title + ' (' + getCSTDateStr() + '):\n\n' + result;
    await storeMemory(opp.id, opp.agency, observation);
    R.steps.push('stored_in_memory');

    // Update capture_action with revised PWIN if changed
    if (newPwin !== null) {
      var currentCapture = opp.capture_action || '';
      var updatedCapture = 'RED TEAM PWIN: ' + newPwin + '% | Updated: ' + getCSTDateStr() + '\n\n' + currentCapture.slice(0, 2000);
      await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opp.id), {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ capture_action: updatedCapture, last_updated: new Date().toISOString() })
      });
      R.steps.push('pwin_updated');
    }

  } catch(e) { R.errors.push({ fatal: e.message }); }

  // Log the run
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'hr-rt-' + Date.now(), source: 'red_team', status: 'hgi=' + (R.hgi_score||'?') + '/100 | pwin=' + (R.pwin||'?') + '% | ' + (R.result_chars||0) + 'chars | ' + R.errors.length + ' errors', run_at: new Date().toISOString(), opportunities_found: 0 }) });
  } catch(e) {}

  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}