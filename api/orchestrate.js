export const config = { maxDuration: 120 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

async function claudeCall(prompt, system, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens || 2000, system: system || 'You are HGI senior capture strategist.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
}

async function patchOpp(id, data) {
  await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', headers: H, body: JSON.stringify({ ...data, last_updated: new Date().toISOString() })
  });
}

async function logEvent(eventType, oppId, title, data) {
  fetch('https://hgi-capture-system.vercel.app/api/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, opportunity_id: oppId, opportunity_title: title, source_module: 'orchestrator', data })
  }).catch(() => {});
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { opportunity_id, trigger } = req.body || {};
  if (!opportunity_id) return res.status(400).json({ error: 'opportunity_id required' });

  // Load opportunity from DB
  const oppR = await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id) + '&limit=1', { headers: H });
  const opps = await oppR.json();
  if (!opps || !opps.length) return res.status(404).json({ error: 'Opportunity not found' });
  const opp = opps[0];

  const results = { opportunity_id, steps_completed: [], started_at: new Date().toISOString() };

  // Load KB for this vertical
  let kbContext = '';
  try {
    const kbR = await fetch('https://hgi-capture-system.vercel.app/api/knowledge-query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertical: opp.vertical || 'disaster', max_chunks: 6 })
    });
    if (kbR.ok) { const kbData = await kbR.json(); kbContext = kbData.prompt_injection || ''; }
  } catch(e) {}

  // ── STEP 1: RESEARCH ──────────────────────────────────────────────────────
  let researchBrief = '';
  try {
    researchBrief = await claudeCall(
      'Full capture intelligence brief for HGI:\nOpportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nVertical: ' + (opp.vertical || 'general') + '\nOPI: ' + opp.opi_score + '\nDescription: ' + (opp.description || '').slice(0, 1500) + '\nScope: ' + (opp.scope_of_work || []).join('; ') + '\nWhy HGI Wins: ' + (opp.why_hgi_wins || []).join('; ') + '\nDue: ' + (opp.due_date || 'TBD') + '\n\nHGI KB:\n' + kbContext.slice(0, 3000) + '\n\nProvide:\n1. AGENCY PROFILE — key facts, budget, leadership\n2. DECISION-MAKER INTEL — who to contact, who influences\n3. COMPETITIVE LANDSCAPE — name real competitors in this space\n4. HGI WIN STRATEGY — 3 specific differentiators with past performance proof\n5. RED FLAGS — risks and obstacles\n6. 48-HOUR ACTION PLAN — exactly what to do right now\n7. RELATIONSHIP GAPS — what relationships are missing',
      'You are HGI senior capture intelligence analyst. Be specific. Name real firms. Use real HGI past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years, Orleans Parish School Board 22 years, City of New Orleans WC TPA.', 2500
    );
    await patchOpp(opportunity_id, { hgi_fit: researchBrief.slice(0, 2000) });
    await logEvent('opportunity.researched', opportunity_id, opp.title, { step: 'research' });
    results.steps_completed.push('research');
    results.research_length = researchBrief.length;
  } catch(e) { results.research_error = e.message; }

  // ── STEP 2: WINNABILITY (uses research output) ────────────────────────────
  let winnability = '';
  let pwin = 0;
  let recommendation = 'UNDETERMINED';
  try {
    winnability = await claudeCall(
      'Winnability assessment for HGI. Use the research brief below to inform your analysis.\n\nOpportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nOPI: ' + opp.opi_score + '\nDescription: ' + (opp.description || '').slice(0, 800) + '\nWhy HGI Wins: ' + (opp.why_hgi_wins || []).join('; ') + '\nKey Requirements: ' + (opp.key_requirements || []).join('; ') + '\nIncumbent: ' + (opp.incumbent || 'Unknown') + '\nRecompete: ' + (opp.recompete ? 'Yes' : 'No') + '\n\nRESEARCH BRIEF:\n' + researchBrief.slice(0, 1500) + '\n\nHGI KB:\n' + kbContext.slice(0, 1500) + '\n\nReturn your assessment starting with exactly this format on the first line:\nPWIN: [number]% | RECOMMENDATION: [GO|CONDITIONAL GO|NO-BID]\n\nThen provide:\n1. Top 3 win factors\n2. Top 3 risk factors\n3. Price-to-Win estimate\n4. Teaming recommendation — prime or sub, specific partner suggestions\n5. Capture strategy summary',
      'You are HGI chief capture strategist. Your first line MUST be: PWIN: XX% | RECOMMENDATION: GO or CONDITIONAL GO or NO-BID', 2000
    );

    // Extract Pwin and recommendation from first line
    const firstLine = winnability.split('\n')[0] || '';
    const pwinMatch = firstLine.match(/PWIN:\s*(\d+)/i);
    const recMatch = firstLine.match(/RECOMMENDATION:\s*(GO|CONDITIONAL GO|NO-BID)/i);
    pwin = pwinMatch ? parseInt(pwinMatch[1]) : 0;
    recommendation = recMatch ? recMatch[1] : 'UNDETERMINED';

    // Store winnability in capture_action (the action-oriented field)
    await patchOpp(opportunity_id, { capture_action: ('PWIN: ' + pwin + '% | ' + recommendation + '\n\n' + winnability).slice(0, 2000) });
    await logEvent('opportunity.winnability_scored', opportunity_id, opp.title, { pwin, recommendation });
    results.steps_completed.push('winnability');
    results.pwin = pwin;
    results.recommendation = recommendation;
  } catch(e) { results.winnability_error = e.message; }

  // ── STEP 3: AUTO-PROPOSAL (only if GO and OPI >= 85) ──────────────────────
  if (recommendation === 'GO' && opp.opi_score >= 85) {
    try {
      const execSummary = await claudeCall(
        'Write a complete Executive Summary proposal section for HGI.\n\nOpportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nVertical: ' + (opp.vertical || 'disaster') + '\nScope: ' + (opp.scope_of_work || []).join('; ') + '\nWhy HGI Wins: ' + (opp.why_hgi_wins || []).join('; ') + '\nKey Requirements: ' + (opp.key_requirements || []).join('; ') + '\n\nRESEARCH CONTEXT:\n' + researchBrief.slice(0, 1000) + '\nWINNABILITY: Pwin ' + pwin + '%, ' + recommendation + '\n\nHGI KB:\n' + kbContext.slice(0, 2000) + '\n\nWrite 600+ words. Use real HGI past performance. Be specific, compelling, evaluator-aligned. Reference the competitive intelligence from the research.',
        'You are HGI senior proposal writer. Use ONLY verified past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years. ' + kbContext.slice(0, 1500), 3000
      );
      // Store in rfp_text field as the auto-generated proposal draft
      const currentRfp = opp.rfp_text || '';
      await patchOpp(opportunity_id, { rfp_text: (currentRfp + '\n\n=== AUTO-GENERATED EXECUTIVE SUMMARY ===\n' + execSummary).slice(0, 10000) });
      await logEvent('proposal.section_drafted', opportunity_id, opp.title, { section: 'executive_summary', auto: true });
      results.steps_completed.push('proposal_executive_summary');
      results.proposal_length = execSummary.length;
    } catch(e) { results.proposal_error = e.message; }
  }

  results.completed_at = new Date().toISOString();
  results.duration_ms = new Date(results.completed_at) - new Date(results.started_at);

  // Log orchestration completion
  try {
    await fetch(SUPABASE_URL + '/rest/v1/hunt_runs', {
      method: 'POST', headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ source: 'orchestrator', status: results.steps_completed.join('+') + '|pwin:' + pwin + '|' + recommendation, run_at: new Date().toISOString(), opportunities_found: 0 })
    });
  } catch(e) {}

  return res.status(200).json(results);
}