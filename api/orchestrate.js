export const config = { maxDuration: 300 };

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
      '0. SUB-VERTICAL CLASSIFICATION — Classify the SPECIFIC type of work within the vertical. For example: if tagged "tpa" — is this workers comp TPA (HGI core), health insurance TPA (NOT HGI), insurance brokerage (NOT HGI), property casualty claims (HGI core), or student accident insurance (NOT HGI)? If tagged "disaster" — is this FEMA PA administration (HGI core), physical construction/repair (NOT HGI), debris removal (NOT HGI), or grant management (HGI core)? If tagged "infrastructure" — is this program/construction management (HGI adjacent), or physical construction (NOT HGI)? Be precise. This classification determines whether HGI should even be looking at this opportunity.\n' +
      '1. SCOPE SUMMARY — What is actually being asked for, plain English, 3-5 sentences.\n' +
      '2. DETAILED DELIVERABLES — Every deliverable, task, and work product. If listing is thin, infer from similar contracts for this agency type and vertical.\n' +
      '3. EVALUATION CRITERIA — Extract the EXACT evaluation criteria and point values from the RFP text. Do NOT infer or estimate. Only infer if no criteria are stated.\n' +
      '4. HGI CAPABILITY ALIGNMENT — Map each deliverable to specific HGI past performance. Flag gaps with RED FLAG.\n' +
      '5. COMPLIANCE REQUIREMENTS — Licenses, certs, insurance, bonding, registrations.\n' +
      '6. CRITICAL QUESTIONS — What must HGI ask the agency before committing resources?',
      'You are a senior government contracting scope analyst specializing in Louisiana procurements. CRITICAL: Your first job is to determine the EXACT type of work being requested and whether it matches HGI capabilities. HGI does: workers comp TPA, property casualty TPA, insurance guaranty association administration, FEMA PA grant management, CDBG-DR program administration, disaster recovery program management, property tax appeals, workforce program administration, construction MANAGEMENT (not construction). HGI does NOT do: insurance brokerage, health insurance TPA, physical construction, debris removal, IT services, engineering, architecture, environmental remediation, medical services. Be exhaustive. When RFP text is thin, use knowledge of similar contracts to determine what type of work this actually is.', 2500
    );
    await patchOpp(opportunity_id, { scope_analysis: scopeAnalysis, description: (opp.description || '').split('--- SCOPE ANALYSIS ---')[0].trim().slice(0, 2000) });
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
      '\nCRITICAL: Use ACTUAL population and budget data from the RFP or scope analysis. Do NOT guess population figures.\n' +
      '\n\nHGI RATE CARD:\nPrincipal $180/hr, Program Director $165/hr, SME $155/hr, Sr Grant Mgr $150/hr, Grant Mgr $120/hr, Sr PM $150/hr, PM $140/hr, Grant Writer $105/hr, Architect/Engineer $135/hr, Cost Estimator $125/hr, Appeals Specialist $145/hr, Sr Damage Assessor $115/hr, Damage Assessor $95/hr, Admin Support $65/hr.\n\n' +
      'Provide ALL of the following with SPECIFIC NUMBERS and RATIONALE for each:\n\n' +
      '1. ESTIMATED CONTRACT VALUE — What will the agency pay? Show your math: comparable contracts, agency budget, scope complexity. Give a range with low/mid/high.\n\n' +
      '2. STAFFING PLAN — List every role HGI needs to staff this contract. For each role show: title, hourly rate (from HGI rate card), estimated hours per month, monthly cost, and justification for why this role is needed. Total the monthly and annual staffing cost.\n\n' +
      '3. HGI COST TO DELIVER — Staffing cost from above PLUS: overhead (estimate % and dollar amount), travel, technology/tools, insurance, subcontractor costs. Show every line item.\n\n' +
      '4. PRICE-TO-WIN — What price range wins this contract? Factor in: agency budget constraints, competitor pricing patterns, market rates for this work in this state. Show comparable contract values if known.\n\n' +
      '5. PROFIT MARGIN ANALYSIS — At price-to-win, what is HGI gross margin? What is net margin after overhead? Is this margin acceptable for HGI? Compare to HGI target margins.\n\n' +
      '6. REVENUE PROJECTION — Monthly revenue, annual revenue, total contract value over full period including option years.\n\n' +
      '7. PURSUIT COST — What will it cost HGI in staff time and expenses to prepare and submit this proposal? Is the pursuit investment justified by the expected return?\n\n' +
      '8. FINANCIAL RISKS — What could make this contract unprofitable? Scope creep, understaffing, travel costs, subcontractor overruns, delayed payments.\n\n' +
      '9. FINANCIAL RECOMMENDATION — PURSUE / CONDITIONAL / PASS with specific financial reasoning.',
      'You are HGI CFO-level financial analyst. Be specific with numbers. Use the HGI rate card provided. Every number must be justified.', 2000
    );
    await patchOpp(opportunity_id, { financial_analysis: financialAnalysis });
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
      'Opportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nState: ' + (opp.state || 'LA') + ' (IMPORTANT: Use the correct state. If agency is in Louisiana, research the Louisiana entity, NOT any same-named entity in another state.)' + '\nOriginal OPI: ' + opp.opi_score +
      '\nSCOPE:\n' + scopeAnalysis.slice(0, 1200) +
      '\nFINANCIAL:\n' + financialAnalysis.slice(0, 1200) +
      '\nHGI KB:\n' + kbContext.slice(0, 1500) +
      '\n\nProvide:\n1. AGENCY PROFILE — budget, leadership, procurement patterns\n2. COMPETITIVE LANDSCAPE — who will bid, their strengths/weaknesses relative to HGI, informed by the scope requirements\n3. HGI WIN STRATEGY — 3 differentiators mapped to evaluation criteria from scope analysis\n4. RED FLAGS — from scope, financial, and competitive angles\n5. 48-HOUR ACTION PLAN — exactly what to do, who to call' +
      '\n6. RISKS & CHALLENGES — What are the specific downsides, obstacles, and gaps? Include: relationship gaps, geographic challenges, capability gaps, competitive disadvantages, compliance risks, timeline risks. Do NOT sugarcoat — the President needs honest assessment of what could go wrong.',
      'HGI senior capture intelligence analyst. Every recommendation must reference specific scope requirements or financial data from the analysis.', 3000
    );
    await patchOpp(opportunity_id, { research_brief: researchBrief, hgi_fit: researchBrief.slice(0, 2000) });
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
      '\n\nSCORING RULES:\n- If the scope analysis found this is NOT HGI core work (insurance brokerage, health insurance TPA, physical construction, debris removal, IT, engineering, architecture, environmental, medical) — score BELOW 25 regardless of other factors.\n- If scope is HGI-adjacent but not core — score 25-50.\n- If scope is HGI core work — score based on: Past Performance Match (30pts), Technical Capability (20pts), Competitive Position (15pts), Relationship Strength (15pts), Strategic Value (10pts), Financial Attractiveness (10pts).\n\nThe sub-vertical classification from scope analysis is the MOST IMPORTANT input. If the work type does not match what HGI actually does, nothing else matters.\n\nReturn ONLY a single line: REVISED_OPI: [number]',
      'You are the OPI calibration engine. The sub-vertical classification from scope analysis overrides all other factors. If the work is not HGI core work, the score MUST be below 25. Return ONLY: REVISED_OPI: [number]', 100
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
  let winnability = '';
  try {
    winnability = await claudeCall(
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

    // Auto-filter NO-BID opportunities out of active views
    if (recommendation === 'NO-BID') {
      await patchOpp(opportunity_id, { status: 'no_bid' });
      results.auto_filtered = true;
    } else if (recommendation === 'CONDITIONAL GO') {
      await patchOpp(opportunity_id, { status: 'active' });
    }

    await logEvent('opportunity.winnability_scored', opportunity_id, opp.title, { pwin, recommendation });
    results.steps_completed.push('winnability');
    results.pwin = pwin;
    results.recommendation = recommendation;
  } catch(e) { results.winnability_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: AUTO-PROPOSAL PACKAGE — Generate complete proposal from RFP
  // ══════════════════════════════════════════════════════════════════════════
  if ((recommendation === 'GO' || recommendation === 'CONDITIONAL GO') && revisedOpi >= 75) {
    try {
      // Parse the RFP to extract evaluation criteria, required sections, and key personnel
      var rfpContext = (opp.rfp_text || '').slice(0, 6000);
      
      var proposalPackage = await claudeCall(
        'Generate a COMPLETE proposal package for HGI based on the RFP, scope analysis, financial analysis, and research.\n\n' +
        'RFP TEXT:\n' + rfpContext + '\n\n' +
        'SCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 1500) + '\n\n' +
        'FINANCIAL ANALYSIS:\n' + financialAnalysis.slice(0, 1500) + '\n\n' +
        'RESEARCH:\n' + researchBrief.slice(0, 1000) + '\n\n' +
        'HGI KB:\n' + kbContext.slice(0, 2000) + '\n\n' +
        'Generate ALL of the following sections:\n\n' +
        '## 1. COMPLIANCE MATRIX\n' +
        'Map every RFP requirement to where it is addressed in the proposal. Format: Requirement | Section | Status (Compliant/Partial/Gap)\n\n' +
        '## 2. KEY PERSONNEL ASSIGNMENTS\n' +
        'Map each RFP-required role to the HGI position title and rate that fills it. Do NOT assign specific people by name — leave all personnel as TBD. Format: RFP Role | HGI Title | HGI Rate | Personnel: TBD | Justification. Use the HGI rate card: Principal $180, Program Director $165, SME $155, Sr Grant Mgr $150, Grant Mgr $120, Sr PM $150, PM $140, Grant Writer $105, Cost Estimator $125, Appeals Specialist $145, Admin Support $65.\n\n' +
        '## 3. PRICING EXHIBIT\n' +
        'Build the pricing table matching the RFP format exactly. Show every position requested in the RFP with the proposed fully-burdened hourly rate from HGI rate card.\n\n' +
        '## 4. TECHNICAL APPROACH\n' +
        'Draft the technical approach section (600+ words) addressing the evaluation criteria. Reference specific scope requirements and how HGI addresses each one.\n\n' +
        '## 5. PAST PERFORMANCE MATRIX\n' +
        'List 3 relevant past performance references with: Program Name, Client, Contract Value, Period, HGI Role, Key Outcomes, Relevance to this RFP. Use real HGI past performance only.\n\n' +
        '## 6. STAFFING & CAPACITY\n' +
        'Describe HGI staffing approach, surge capacity, and current workload availability. Address the RFP requirement to demonstrate available capacity.\n\n' +
        '## 7. QUESTIONS FOR THE AGENCY\n' +
        'List the formal written questions to submit before the question deadline. Each question should reference the specific RFP section it relates to.\n\n' +
        '## 8. SUBMISSION TIMELINE\n' +
        'Create a day-by-day timeline from today through submission deadline showing every milestone: question submission, team assignments, draft sections, internal review, red team, final assembly, submission.',
        'You are HGI senior proposal manager. Generate a COMPLETE submission-ready proposal package. Use real HGI past performance only: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years, Orleans Parish School Board 22 years, City of New Orleans WC TPA. Every section must directly address the RFP evaluation criteria.', 4000
      );

      await patchOpp(opportunity_id, { rfp_text: proposalPackage });
      await logEvent('proposal.package_generated', opportunity_id, opp.title, { sections: 8, auto: true });
      results.steps_completed.push('proposal_package');
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