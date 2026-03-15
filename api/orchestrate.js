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

  // Fetch source page for more detail
  let sourceContent = '';
  if (opp.source_url) {
    try {
      const srcR = await fetch('https://hgi-capture-system.vercel.app/api/fetch-rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: opp.source_url })
      });
      if (srcR.ok) { const srcD = await srcR.json(); sourceContent = (srcD.textContent || '').slice(0, 8000); }
    } catch(e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: DEEP SCOPE ANALYSIS — What is actually being asked for?
  // ══════════════════════════════════════════════════════════════════════════
  let scopeAnalysis = '';
  try {
    scopeAnalysis = await claudeCall(
      'Deep scope analysis for HGI go/no-go decision.\n\nOPPORTUNITY: ' + opp.title +
      '\nAGENCY: ' + opp.agency +
      '\nVERTICAL: ' + (opp.vertical || 'general') +
      '\nDESCRIPTION: ' + (opp.description || '').slice(0, 1500) +
      '\nRFP TEXT: ' + (opp.rfp_text || '').slice(0, 3000) +
      (sourceContent ? '\nSOURCE PAGE:\n' + sourceContent.slice(0, 4000) : '') +
      '\nHGI KB:\n' + kbContext.slice(0, 2000) +
      '\n\nProvide:\n' +
      '1. SCOPE SUMMARY — What is actually being asked for, plain English, 3-5 sentences.\n' +
      '2. DETAILED DELIVERABLES — Every deliverable, task, and work product. If listing is thin, infer from similar contracts for this agency type and vertical.\n' +
      '3. EVALUATION CRITERIA — How will this be scored? Infer from similar Louisiana procurements if not stated.\n' +
      '4. HGI CAPABILITY ALIGNMENT — Map each deliverable to specific HGI past performance. Flag gaps with RED FLAG.\n' +
      '5. COMPLIANCE REQUIREMENTS — Licenses, certs, insurance, bonding, registrations.\n' +
      '6. CRITICAL QUESTIONS — What must HGI ask the agency before committing resources?',
      'You are a senior government contracting scope analyst specializing in Louisiana procurements. Be exhaustive. When RFP text is thin, use knowledge of similar contracts to build the complete picture.', 2500
    );
    await patchOpp(opportunity_id, { description: (opp.description + '\n\n--- SCOPE ANALYSIS ---\n' + scopeAnalysis).slice(0, 2000) });
    await logEvent('opportunity.scope_analyzed', opportunity_id, opp.title, { step: 'scope' });
    results.steps_completed.push('scope_analysis');
  } catch(e) { results.scope_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: FINANCIAL ANALYSIS — What does this cost and what is it worth?
  // ══════════════════════════════════════════════════════════════════════════
  let financialAnalysis = '';
  try {
    financialAnalysis = await claudeCall(
      'Financial analysis for HGI pursuit decision.\n\nOPPORTUNITY: ' + opp.title +
      '\nAGENCY: ' + opp.agency +
      '\nESTIMATED VALUE: ' + (opp.estimated_value || 'Unknown') +
      '\nVERTICAL: ' + (opp.vertical || 'general') +
      '\nSCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 2000) +
      '\n\nHGI RATE CARD:\nPrincipal $180/hr, Program Director $165/hr, SME $155/hr, Sr Grant Mgr $150/hr, Grant Mgr $120/hr, Sr PM $150/hr, PM $140/hr, Grant Writer $105/hr, Architect/Engineer $135/hr, Cost Estimator $125/hr, Appeals Specialist $145/hr, Sr Damage Assessor $115/hr, Damage Assessor $95/hr, Admin Support $65/hr.\n\n' +
      'Provide:\n' +
      '1. ESTIMATED CONTRACT VALUE — Best estimate of what the agency will pay, with reasoning.\n' +
      '2. HGI COST TO DELIVER — Staffing plan with roles, hours per month, loaded cost. Include overhead estimate.\n' +
      '3. PRICE-TO-WIN — What price range wins this? Factor in competition and agency budget.\n' +
      '4. PROFIT MARGIN ANALYSIS — At price-to-win, what margin does HGI make? Is it worth pursuing?\n' +
      '5. REVENUE PROJECTION — Monthly, annual, and total contract value for HGI.\n' +
      '6. PURSUIT COST — What will it cost HGI to prepare and submit this proposal?\n' +
      '7. ROI ASSESSMENT — Pursuit cost vs. expected revenue. Worth the investment?\n' +
      '8. FINANCIAL RECOMMENDATION — PURSUE / CONDITIONAL / PASS with clear reasoning.',
      'You are HGI CFO-level financial analyst. Be specific with numbers. Use the HGI rate card provided. Every number must be justified.', 2000
    );
    const currentRfp = opp.rfp_text || '';
    await patchOpp(opportunity_id, { rfp_text: (currentRfp + '\n\n=== FINANCIAL ANALYSIS ===\n' + financialAnalysis).slice(0, 10000) });
    await logEvent('opportunity.financial_analyzed', opportunity_id, opp.title, { step: 'financial' });
    results.steps_completed.push('financial_analysis');
  } catch(e) { results.financial_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: RESEARCH — Competitive intel informed by real scope
  // ══════════════════════════════════════════════════════════════════════════
  let researchBrief = '';
  try {
    researchBrief = await claudeCall(
      'Capture intelligence brief for HGI. You have the scope and financial analysis — use them.\n\n' +
      'Opportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nOriginal OPI: ' + opp.opi_score +
      '\nSCOPE:\n' + scopeAnalysis.slice(0, 1200) +
      '\nFINANCIAL:\n' + financialAnalysis.slice(0, 1200) +
      '\nHGI KB:\n' + kbContext.slice(0, 1500) +
      '\n\nProvide:\n1. AGENCY PROFILE — budget, leadership, procurement patterns\n2. COMPETITIVE LANDSCAPE — who will bid, their strengths/weaknesses relative to HGI, informed by the scope requirements\n3. HGI WIN STRATEGY — 3 differentiators mapped to evaluation criteria from scope analysis\n4. RED FLAGS — from scope, financial, and competitive angles\n5. 48-HOUR ACTION PLAN — exactly what to do, who to call',
      'HGI senior capture intelligence analyst. Every recommendation must reference specific scope requirements or financial data from the analysis.', 2000
    );
    await patchOpp(opportunity_id, { hgi_fit: researchBrief.slice(0, 2000) });
    await logEvent('opportunity.researched', opportunity_id, opp.title, { step: 'research' });
    results.steps_completed.push('research');
  } catch(e) { results.research_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4: REVISED OPI SCORE — Now score with real scope and financial data
  // ══════════════════════════════════════════════════════════════════════════
  let revisedOpi = opp.opi_score;
  try {
    const scoreResponse = await claudeCall(
      'Re-score this opportunity for HGI using FULL scope and financial analysis.\n\n' +
      'Title: ' + opp.title + '\nAgency: ' + opp.agency + '\nOriginal OPI: ' + opp.opi_score +
      '\n\nSCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 1500) +
      '\n\nFINANCIAL ANALYSIS:\n' + financialAnalysis.slice(0, 1500) +
      '\n\nRESEARCH:\n' + researchBrief.slice(0, 1000) +
      '\n\nHGI KB:\n' + kbContext.slice(0, 1000) +
      '\n\nScore 0-100 based on: Past Performance Match (30pts), Technical Capability (20pts), Competitive Position (15pts), Relationship Strength (15pts), Strategic Value (10pts), Financial Attractiveness (10pts).\n\nReturn ONLY a single line: REVISED_OPI: [number]',
      'Return ONLY: REVISED_OPI: [number]. Nothing else.', 100
    );
    const opiMatch = scoreResponse.match(/REVISED_OPI:\s*(\d+)/i);
    if (opiMatch) {
      revisedOpi = parseInt(opiMatch[1]);
      await patchOpp(opportunity_id, { opi_score: revisedOpi });
      results.revised_opi = revisedOpi;
      results.original_opi = opp.opi_score;
    }
    results.steps_completed.push('revised_scoring');
  } catch(e) { results.scoring_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5: WINNABILITY — GO/NO-GO with full intelligence package
  // ══════════════════════════════════════════════════════════════════════════
  let pwin = 0;
  let recommendation = 'UNDETERMINED';
  try {
    const winnability = await claudeCall(
      'Final GO/NO-GO winnability assessment. You have scope, financial, and competitive intelligence.\n\n' +
      'Opportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nRevised OPI: ' + revisedOpi +
      '\nSCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 1000) +
      '\nFINANCIAL ANALYSIS:\n' + financialAnalysis.slice(0, 1000) +
      '\nRESEARCH:\n' + researchBrief.slice(0, 1000) +
      '\n\nFirst line MUST be: PWIN: [number]% | RECOMMENDATION: [GO|CONDITIONAL GO|NO-BID]\n\n' +
      'Then:\n1. Decision justification — 3 sentences citing scope, financial, and competitive factors\n2. Top 3 win factors\n3. Top 3 risk factors\n4. Conditions for GO (if CONDITIONAL)\n5. Teaming recommendation',
      'HGI chief capture officer making the final bid decision. Your first line MUST follow the format exactly.', 1500
    );

    const firstLine = winnability.split('\n')[0] || '';
    const pwinMatch = firstLine.match(/PWIN:\s*(\d+)/i);
    const recMatch = firstLine.match(/RECOMMENDATION:\s*(GO|CONDITIONAL GO|NO-BID)/i);
    pwin = pwinMatch ? parseInt(pwinMatch[1]) : 0;
    recommendation = recMatch ? recMatch[1] : 'UNDETERMINED';

    await patchOpp(opportunity_id, { capture_action: ('PWIN: ' + pwin + '% | ' + recommendation + '\n\n' + winnability).slice(0, 2000) });
    await logEvent('opportunity.winnability_scored', opportunity_id, opp.title, { pwin, recommendation });
    results.steps_completed.push('winnability');
    results.pwin = pwin;
    results.recommendation = recommendation;
  } catch(e) { results.winnability_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: AUTO-PROPOSAL — Only if GO and revised OPI >= 80
  // ══════════════════════════════════════════════════════════════════════════
  if ((recommendation === 'GO' || recommendation === 'CONDITIONAL GO') && revisedOpi >= 80) {
    try {
      const execSummary = await claudeCall(
        'Write Executive Summary for HGI proposal. Use ALL intelligence gathered:\n\n' +
        'Opportunity: ' + opp.title + '\nAgency: ' + opp.agency +
        '\nScope: ' + scopeAnalysis.slice(0, 800) +
        '\nFinancial: ' + financialAnalysis.slice(0, 600) +
        '\nWin Strategy: ' + researchBrief.slice(0, 600) +
        '\nPwin: ' + pwin + '% | ' + recommendation +
        '\nHGI KB:\n' + kbContext.slice(0, 1500) +
        '\n\n600+ words. Address evaluation criteria from scope analysis. Reference financial value proposition. Cite specific HGI past performance.',
        'HGI senior proposal writer. Every claim must trace back to scope requirements, financial analysis, or verified past performance.', 3000
      );
      const currentRfp = opp.rfp_text || '';
      await patchOpp(opportunity_id, { rfp_text: (currentRfp + '\n\n=== AUTO-GENERATED EXECUTIVE SUMMARY ===\n' + execSummary).slice(0, 10000) });
      await logEvent('proposal.auto_drafted', opportunity_id, opp.title, { section: 'executive_summary', pwin });
      results.steps_completed.push('proposal_executive_summary');
    } catch(e) { results.proposal_error = e.message; }
  }

  results.completed_at = new Date().toISOString();
  results.duration_ms = new Date(results.completed_at) - new Date(results.started_at);

  try {
    await fetch(SUPABASE_URL + '/rest/v1/hunt_runs', {
      method: 'POST', headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ source: 'orchestrator', status: results.steps_completed.join('+') + '|opi:' + revisedOpi + '|pwin:' + pwin + '|' + recommendation, run_at: new Date().toISOString(), opportunities_found: 0 })
    });
  } catch(e) {}

  return res.status(200).json(results);
}