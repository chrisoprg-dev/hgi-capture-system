import { HGI_CONTEXT, HGI_CLASSIFICATION_GUIDE } from './hgi-master-context.js';
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

async function claudeCall(prompt, system, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens || 2000, system: system || 'You are HGI senior capture strategist.', messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) throw new Error('Claude API returned ' + r.status);
  const d = await r.json();
  var result = d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  if (!result || result.length < 20) throw new Error('Claude returned empty or too-short response');
  return result;
}

// SAFEGUARD: Never overwrite non-empty fields with empty values
async function safePatchOpp(id, data) {
  var cleanData = {};
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = data[k];
    if (v === '' || v === null || v === undefined) continue;
    cleanData[k] = v;
  }
  if (Object.keys(cleanData).length === 0) return;
  await patchOpp(id, cleanData);
}

async function webResearch(agency, title, state, description, opportunity_id) {
  try {
    var prompt = 'Research this government procurement opportunity using live web search. OPPORTUNITY: ' + title + ' | AGENCY: ' + agency + ' | STATE: ' + (state || 'Louisiana') + ' | DESCRIPTION: ' + (description || '').slice(0, 400) + '\n\nSearch and provide: 1. AGENCY PROFILE — budget, leadership, when established/incorporated (use verified current data, not assumptions). 2. INCUMBENT CONTRACTOR — who currently holds this or a similar contract? Search award notices. 3. RECENT NEWS — last 12 months relevant to this procurement. 4. BUDGET & FUNDING — annual budget, recent FEMA/HUD/CDBG-DR grants received. 5. VERIFIED FACTS — 3-5 specific facts with sources. Flag anything contradicting common assumptions about this agency.';
    var wr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: 'You are a government contracting intelligence analyst. Always search the web before answering. Never rely on training data for specific agency facts, incumbents, incorporation dates, or budgets. Be precise and cite what you found.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!wr.ok) return '';
    var wd = await wr.json();
    return (wd.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}

async function patchOpp(id, data) {
  await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', headers: H, body: JSON.stringify({ ...data, last_updated: new Date().toISOString() })
  });
}

async function logEvent(eventType, oppId, title, data) {
  try {
    await fetch('https://hgi-capture-system.vercel.app/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, opportunity_id: oppId, opportunity_title: title, source_module: 'orchestrator', data })
    });
  } catch(e) {}
}

async function storeMemory(agent, oppId, tags, observation, memType) {
  try {
    await fetch('https://hgi-capture-system.vercel.app/api/memory-store', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agent, opportunity_id: oppId, entity_tags: tags, observation: observation, memory_type: memType || 'analysis' })
    });
  } catch(e) {}
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

  // Load KB with intelligent reranking — passes opportunity context for smart chunk selection
  let kbContext = '';
  let kbGapReport = '';
  try {
    var kbBody = {
      vertical: opp.vertical || 'disaster',
      max_chunks: 10,
      opportunity_text: (opp.title || '') + ' | ' + (opp.agency || '') + ' | ' + (opp.description || '').slice(0, 1500) + ' | ' + (opp.rfp_text || '').slice(0, 2000),
      eval_criteria: (opp.description || '').slice(0, 500),
      step: 'scope'
    };
    const kbR = await fetch('https://hgi-capture-system.vercel.app/api/knowledge-query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kbBody)
    });
    if (kbR.ok) {
      const kbData = await kbR.json();
      kbContext = kbData.prompt_injection || '';
      kbGapReport = kbData.gap_report || '';
      results.kb_smart_mode = kbData.smart_mode || false;
      results.kb_chunks_used = kbData.chunk_count || 0;
    }
  } catch(e) { results.kb_error = e.message; }

  // Fetch source page for more detail — use authenticated fetcher for Central Bidding
  let sourceContent = '';
  if (opp.source_url) {
    try {
      var fetchEndpoint = 'https://hgi-capture-system.vercel.app/api/fetch-rfp';
      if (opp.source_url.includes('centralauctionhouse.com') || opp.source_url.includes('centralbidding.com')) {
        fetchEndpoint = 'https://hgi-capture-system.vercel.app/api/fetch-central-bidding';
      }
      const srcR = await fetch(fetchEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: opp.source_url })
      });
      if (srcR.ok) { const srcD = await srcR.json(); sourceContent = (srcD.textContent || '').slice(0, 8000); }
    } catch(e) {}
  }

  // Detect if we have actual RFP document content vs login wall / thin listing
  var hasRfpDocument = false;
  var rfpContentForAnalysis = (opp.rfp_text || '');
  var sourceLen = (sourceContent || '').length;

  // If source fetch returned substantial content (not a login page), that is real RFP content
  if (sourceLen > 1000) {
    hasRfpDocument = true;
    // Save the real source content as rfp_text if current rfp_text is thin
    if (rfpContentForAnalysis.length < 1000) {
      rfpContentForAnalysis = sourceContent;
      await patchOpp(opportunity_id, { rfp_text: sourceContent.slice(0, 10000) });
    }
  }
  // If rfp_text already has substantial content from intake, check if it looks like real RFP vs generated proposal
  if (rfpContentForAnalysis.length > 2000) {
    // If it contains "COMPLIANCE MATRIX" or "COMPLETE PROPOSAL PACKAGE" it is a generated proposal, not real RFP
    if (rfpContentForAnalysis.includes('COMPLIANCE MATRIX') || rfpContentForAnalysis.includes('COMPLETE PROPOSAL PACKAGE') || rfpContentForAnalysis.includes('SUBMISSION TIMELINE')) {
      hasRfpDocument = false;
    } else {
      hasRfpDocument = true;
    }
  }

  var dataQualityWarning = hasRfpDocument ? '' : '\n\nWARNING: The system does NOT have the actual RFP document. Analysis below is based on a listing SUMMARY only. All deliverables, evaluation criteria, position requirements, and financial estimates are INFERRED and may not match the actual solicitation. Flag this clearly in your output.';

  results.has_rfp_document = hasRfpDocument;

  // ══════════════════════════════════════════════════════════════════════════
  // ORGANISM MEMORY RETRIEVAL — inject accumulated intelligence into every step
  let memoryContext = '';
  try {
    var memR = await fetch('https://hgi-capture-system.vercel.app/api/memory-retrieve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: opportunity_id, agency: opp.agency || '', vertical: opp.vertical || '', step: 'orchestrator', context: (opp.title || '') + ' | ' + (opp.agency || '') + ' | ' + (opp.description || '').slice(0, 500) })
    });
    if (memR.ok) {
      var memData = await memR.json();
      memoryContext = memData.injection || '';
      results.memory_loaded = true;
      results.memory_candidates = memData.candidates_loaded || 0;
      results.memory_selected = memData.memories_selected || 0;
      results.memory_injection_length = memoryContext.length;
    }
  } catch(e) { results.memory_error = e.message; }
  // Memory stays SEPARATE from KB — injected independently so slice limits don't cut it

  // STEP 1: DEEP SCOPE ANALYSIS — What is actually being asked for?
  // ══════════════════════════════════════════════════════════════════════════
  let scopeAnalysis = '';
  try {
    scopeAnalysis = await claudeCall(
      'Deep scope analysis for HGI go/no-go decision.\n\nOPPORTUNITY: ' + opp.title +
      '\nAGENCY: ' + opp.agency +
      '\nSTATE: ' + (opp.state || 'LA') + ' (IMPORTANT: This agency is in this state. Do NOT confuse with same-named entities in other states.)' +
      '\nVERTICAL: ' + (opp.vertical || 'general') +
      '\nDESCRIPTION: ' + (opp.description || '').slice(0, 500) +
      '\nRFP TEXT: ' + (opp.rfp_text || '').slice(0, 10000) +
      (sourceContent ? '\nSOURCE PAGE:\n' + sourceContent.slice(0, 4000) : '') +
      '\nHGI KB:\n' + kbContext.slice(0, 2000) +
      (memoryContext ? '\n' + memoryContext.slice(0, 4000) : '') +
      '\n\nProvide:\n' +
      '0. SUB-VERTICAL CLASSIFICATION — Classify the SPECIFIC type of work within the vertical. For example: if tagged "tpa" — is this workers comp TPA (HGI core), health insurance TPA (NOT HGI), insurance brokerage (NOT HGI), property casualty claims (HGI core), or student accident insurance (NOT HGI)? If tagged "disaster" — is this FEMA PA administration (HGI core), physical construction/repair (NOT HGI), debris removal (NOT HGI), or grant management (HGI core)? If tagged "infrastructure" — is this program/construction management (HGI adjacent), or physical construction (NOT HGI)? Be precise. This classification determines whether HGI should even be looking at this opportunity.\n' +
      '1. SCOPE SUMMARY — What is actually being asked for, plain English, 3-5 sentences.\n' +
      '2. DETAILED DELIVERABLES — Every deliverable, task, and work product. If listing is thin, infer from similar contracts for this agency type and vertical.\n' +
      '3. EVALUATION CRITERIA — Extract the EXACT evaluation criteria and point values from the RFP text. Do NOT infer or estimate. Only infer if no criteria are stated.\n' +
      '4. HGI CAPABILITY ALIGNMENT — Map each deliverable to specific HGI past performance. Flag gaps with RED FLAG.\n' +
      '5. COMPLIANCE REQUIREMENTS — Licenses, certs, insurance, bonding, registrations.\n' +
      '6. CRITICAL QUESTIONS — What must HGI ask the agency before committing resources?' + dataQualityWarning,
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
      'CONTRACT VALUE ESTIMATION AND FINANCIAL ANALYSIS for HGI.\n\nOPPORTUNITY: ' + opp.title + '\nAGENCY: ' + opp.agency + '\nESTIMATED VALUE FROM RFP: ' + (opp.estimated_value || 'Not stated in RFP') + '\nVERTICAL: ' + (opp.vertical || 'general') + '\nSCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 2000) +
      (memoryContext ? '\n' + memoryContext.slice(0, 4000) : '') +
      '\n\nHGI RATE CARD: Principal ' + String.fromCharCode(36) + '220/hr, Program Director ' + String.fromCharCode(36) + '210/hr, SME ' + String.fromCharCode(36) + '200/hr, Sr Grant Mgr ' + String.fromCharCode(36) + '180/hr, Grant Mgr ' + String.fromCharCode(36) + '175/hr, Sr PM ' + String.fromCharCode(36) + '180/hr, PM ' + String.fromCharCode(36) + '155/hr, Grant Writer ' + String.fromCharCode(36) + '145/hr, Architect/Engineer ' + String.fromCharCode(36) + '135/hr, Cost Estimator ' + String.fromCharCode(36) + '125/hr, Appeals Specialist ' + String.fromCharCode(36) + '145/hr, Sr Damage Assessor ' + String.fromCharCode(36) + '115/hr, Damage Assessor ' + String.fromCharCode(36) + '105/hr, Admin Support ' + String.fromCharCode(36) + '65/hr.\n\nESTIMATE THE CONTRACT VALUE USING ALL THREE METHODS BELOW. Show your math for each. Then provide a consolidated range.\n\nMETHOD 1 — STAFFING MATH FROM THE RFP:\nList every position the RFP requests. For each position, estimate realistic monthly hours for a task-order MSA (NOT full-time — most positions on an MSA bill 20-80 hours/month, not 160). Multiply hours by the HGI rate. Sum all positions for monthly total. Multiply by the BASE CONTRACT PERIOD ONLY. Do NOT include option years in the base calculation. If the contract has option years, show them separately as POTENTIAL UPSIDE — option years are not guaranteed and must not be treated as part of the base contract value. Show the math for each position.\n\nMETHOD 2 — COMPARABLE CONTRACTS:\nIdentify 2-3 similar contracts in the same state and vertical. What did those agencies pay for similar scope? Name the comparable if known, or describe it (e.g. "typical Louisiana parish FEMA PA administration contract"). Show how you derived the comparable value.\n\nMETHOD 3 — PERCENTAGE OF FEDERAL FUNDING (disaster/grant contracts only):\nIf this involves FEMA PA, CDBG-DR, HMGP, or other federal grant administration, estimate the total federal funding flowing to this agency. Administration fees typically run 5-12% of grant value. Show: estimated federal allocation, fee percentage range, resulting contract value range. If this method does not apply to this contract type, state that and skip it.\n\nCONSOLIDATED ESTIMATE:\nPresent a final range: LOW / MID / HIGH based on the BASE CONTRACT PERIOD ONLY (do not include option years). If option years exist, show them as a separate line labeled POTENTIAL UPSIDE. One sentence explaining which method you weight most heavily and why. Label clearly as ESTIMATED — not from the RFP.\n\nThen provide:\n4. STAFFING PLAN — Using the RFP-specified positions at realistic MSA utilization rates.\n5. HGI COST TO DELIVER — Direct labor + overhead + travel + technology + insurance + subs.\n6. PROFIT MARGIN ANALYSIS — At the mid-range estimate, what is HGI margin?\n7. FINANCIAL RISKS — What could make this unprofitable?\n8. FINANCIAL RECOMMENDATION — PURSUE / CONDITIONAL / PASS with reasoning.',
      'You are HGI CFO-level financial analyst. CRITICAL RULES: (1) Never present an estimate as an RFP fact. (2) All three estimation methods must show their math. (3) If population or budget data is not in the RFP, say so and do not guess. (4) For staffing estimates on task-order MSAs, base hours on what the RFP describes — a small municipal MSA might generate 20-40 hours/month per position, an active disaster recovery program 60-100. Do not assume full-time unless the RFP requires dedicated staff. (5) This agency is in STATE: ' + (opp.state || 'LA') + '. Use ONLY this state for comparables and geographic references. Do NOT confuse with same-named entities in other states.', 2000
    );
    await patchOpp(opportunity_id, { financial_analysis: financialAnalysis });
    await logEvent('opportunity.financial_analyzed', opportunity_id, opp.title, { step: 'financial' });
    // Extract consolidated estimate from financial analysis and update estimated_value
    var estimateMatch = financialAnalysis.match(/CONSOLIDATED ESTIMATE[:\s]*[\s\S]*?(LOW[:\s]*[^\n]*)/i);
    var midMatch = financialAnalysis.match(/MID[:\s]*\$?([\d,.]+[KMkm]?)/i);
    if (midMatch) {
      var estLabel = 'Estimated: ' + midMatch[0].trim() + ' (system estimate — not from RFP)';
      await patchOpp(opportunity_id, { estimated_value: estLabel.slice(0, 100) });
    }

    results.steps_completed.push('financial_analysis');
    // Write financial findings to organism memory
    var finSummary = (financialAnalysis.match(/CONSOLIDATED ESTIMATE[\s\S]{0,500}/i) || [''])[0];
    if (finSummary.length > 50) {
      await storeMemory('orchestrator_financial', opportunity_id, (opp.agency||'')+','+(opp.vertical||'')+',financial,pricing,estimate', 'FINANCIAL FINDINGS for '+opp.title+' ('+opp.agency+'): '+finSummary, 'pricing_benchmark');
    }
  } catch(e) { results.financial_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // INTELLIGENCE ENGINE: Live web research — agency profile, incumbent, verified facts
  // ══════════════════════════════════════════════════════════════════════════
  let webIntel = '';
  try {
    webIntel = await webResearch(opp.agency, opp.title, opp.state || 'Louisiana', (opp.description || '').slice(0, 400), opportunity_id);
    if (webIntel && webIntel.length > 100) {
      results.web_intel_loaded = true;
      results.web_intel_length = webIntel.length;
    }
  } catch(e) { results.web_intel_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: RESEARCH — Competitive intel informed by real scope + live web data
  // ══════════════════════════════════════════════════════════════════════════
  let researchBrief = '';
  try {
    researchBrief = await claudeCall(
      'Capture intelligence brief for HGI. You have the scope and financial analysis — use them.\n\n' +
      'Opportunity: ' + opp.title + '\nAgency: ' + opp.agency + '\nState: ' + (opp.state || 'LA') + ' (IMPORTANT: Use the correct state. If agency is in Louisiana, research the Louisiana entity, NOT any same-named entity in another state.)' + '\nOriginal OPI: ' + opp.opi_score +
      (webIntel ? '\n\nLIVE WEB INTELLIGENCE (verified via real-time web search — use this over training data for agency facts, incumbent, budget, incorporation dates):\n' + webIntel.slice(0, 2000) : '') +
      '\nSCOPE:\n' + scopeAnalysis.slice(0, 1200) +
      '\nFINANCIAL:\n' + financialAnalysis.slice(0, 1200) +
      '\nHGI KB:\n' + kbContext.slice(0, 1500) +
      (memoryContext ? '\n' + memoryContext.slice(0, 4000) : '') +
      '\n\nProvide:\n1. AGENCY PROFILE — budget, leadership, procurement patterns\n2. COMPETITIVE LANDSCAPE — who will bid, their strengths/weaknesses relative to HGI, informed by the scope requirements\n3. HGI WIN STRATEGY — 3 differentiators mapped to evaluation criteria from scope analysis\n4. RED FLAGS — from scope, financial, and competitive angles\n5. 48-HOUR ACTION PLAN — exactly what to do. For each action, suggest the functional role best suited to own it (e.g. Business Development, Contracts/Compliance, Finance, Technical Lead, Business Intelligence). Do NOT use any specific person names.' +
      '\n6. RISKS & CHALLENGES — What are the specific downsides, obstacles, and gaps? Include: relationship gaps, geographic challenges, capability gaps, competitive disadvantages, compliance risks, timeline risks. Do NOT sugarcoat — the President needs honest assessment of what could go wrong.',
      'HGI senior capture intelligence analyst. Every recommendation must reference specific scope requirements or financial data from the analysis.', 3000
    );
    await patchOpp(opportunity_id, { research_brief: researchBrief, hgi_fit: researchBrief.slice(0, 2000) });
    await logEvent('opportunity.researched', opportunity_id, opp.title, { step: 'research' });
    results.steps_completed.push('research');
    // Write research findings to organism memory — competitive landscape is highest value
    var compSection = (researchBrief.match(/COMPETITIVE LANDSCAPE[\s\S]{0,800}/i) || [''])[0];
    var agencySection = (researchBrief.match(/AGENCY PROFILE[\s\S]{0,500}/i) || [''])[0];
    if (compSection.length > 50) {
      await storeMemory('orchestrator_research', opportunity_id, (opp.agency||'')+','+(opp.vertical||'')+','+(opp.state||'LA')+',competitive_landscape', 'COMPETITIVE INTEL for '+opp.title+' ('+opp.agency+'): '+compSection, 'competitive_intel');
    }
    if (agencySection.length > 50) {
      await storeMemory('orchestrator_research', opportunity_id, (opp.agency||'')+','+(opp.vertical||'')+','+(opp.state||'LA')+',agency_profile', 'AGENCY INTEL for '+opp.agency+': '+agencySection, 'agency_intel');
    }
  } catch(e) { results.research_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4: REVISED OPI SCORE — Now score with real scope and financial data
  // ══════════════════════════════════════════════════════════════════════════
  let revisedOpi = opp.opi_score;

  // CONTENT QUALITY GUARD: Detect blank questionnaire/form templates in rfp_text
  var skipOpiRescore = false;
  var rfpCheck = (opp.rfp_text || '').toLowerCase();
  if (rfpCheck.length > 500) {
    var adminIndicators = ['disqualification', 'notarized', 'affidavit', 'authorized signature', 'campaign contribution', 'complete this section', 'fill in the', 'check one', 'choice a', 'choice b', 'attach hereto', 'sworn to', 'subscribed'];
    var scopeIndicators = ['scope of work', 'scope of services', 'deliverables', 'services shall', 'contractor shall', 'consultant shall', 'tasks include', 'evaluation criteria', 'technical approach', 'work plan', 'statement of work'];
    var adminHits = adminIndicators.filter(function(t) { return rfpCheck.includes(t); }).length;
    var scopeHits = scopeIndicators.filter(function(t) { return rfpCheck.includes(t); }).length;
    if (adminHits >= 3 && scopeHits <= 1) {
      skipOpiRescore = true;
      results.opi_guard = 'Form template detected (admin:' + adminHits + ' scope:' + scopeHits + '). Preserving OPI ' + opp.opi_score + '.';
    }
  }

  try {
    if (skipOpiRescore) {
      revisedOpi = opp.opi_score;
      results.steps_completed.push('revised_scoring_skipped');
    } else {
    const scoreResponse = await claudeCall(
      'Re-score this opportunity for HGI using FULL scope and financial analysis.\n\n' +
      'Title: ' + opp.title + '\nAgency: ' + opp.agency + '\nOriginal OPI: ' + opp.opi_score +
      '\n\nSCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 1500) +
      '\n\nFINANCIAL ANALYSIS:\n' + financialAnalysis.slice(0, 1500) +
      '\n\nRESEARCH:\n' + researchBrief.slice(0, 1000) +
      '\n\nHGI KB:\n' + kbContext.slice(0, 1000) +
      (memoryContext ? '\n' + memoryContext.slice(0, 3000) : '') +
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
    } // end else (not skipOpiRescore)
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
      '\n\nIMPORTANT: If the financial analysis above recommended PASS but you are recommending GO, you MUST explain the disagreement in your justification.\n\nFirst line MUST be: PWIN: [number]% | RECOMMENDATION: [GO|CONDITIONAL GO|NO-BID]\n\n' +
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
    // Write winnability decision to organism memory
    await storeMemory('orchestrator_winnability', opportunity_id, (opp.agency||'')+','+(opp.vertical||'')+',winnability,'+recommendation, 'WINNABILITY DECISION for '+opp.title+' ('+opp.agency+'): OPI '+revisedOpi+', PWIN '+pwin+'%, '+recommendation+'. '+(winnability||'').slice(0,400), 'winnability');
  } catch(e) { results.winnability_error = e.message; }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: AUTO-PROPOSAL PACKAGE — Full proposal if RFP present, team briefing if not
  // ══════════════════════════════════════════════════════════════════════════
  if ((recommendation === 'GO' || recommendation === 'CONDITIONAL GO') && revisedOpi >= 70 && !hasRfpDocument) {
    // NO RFP DOCUMENT — Generate team briefing package instead
    try {
      var briefingPackage = await claudeCall(
        'Generate a COMPLETE team briefing package for HGI leadership to evaluate and act on this opportunity.\n\n' +
        'OPPORTUNITY: ' + opp.title + '\nAGENCY: ' + opp.agency + '\nDEADLINE: ' + (opp.due_date || 'TBD') + '\nOPI: ' + revisedOpi + ' | PWIN: ' + pwin + '% | ' + recommendation + '\nSOURCE: ' + (opp.source_url || 'N/A') + '\n\n' +
        'SCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 2000) + '\n\n' +
        'FINANCIAL ANALYSIS:\n' + financialAnalysis.slice(0, 2000) + '\n\n' +
        'COMPETITIVE INTELLIGENCE:\n' + researchBrief.slice(0, 2000) + '\n\n' +
        'HGI KB:\n' + kbContext.slice(0, 1000) + '\n\n' +
        (memoryContext ? memoryContext.slice(0, 3000) + '\n\n' : '') +
        'FINAL DECISION (use exactly as stated — do not re-derive): PWIN: ' + pwin + '% | RECOMMENDATION: ' + recommendation + '\n\n' +
        'KNOWN EVALUATION CRITERIA (extracted from opportunity description — use these exactly, do not invent different criteria):\n' + (opp.description || '').slice(0, 500) + '\n\n' +
        'FINANCIAL CONSOLIDATED ESTIMATE (from financial analysis — use these numbers, do not re-estimate):\n' + financialAnalysis.slice(0, 600) + '\n\n' +
        'Generate the following sections for the team briefing:\n\n' +
        '## OPPORTUNITY SNAPSHOT\n' +
        'One paragraph: what this is, why it matters, deadline, OPI ' + revisedOpi + ', PWIN ' + pwin + '%, recommendation ' + recommendation + '. Use these exact values. Plain English. No hedging language — this is the final decision.\n\n' +
        '## EVALUATION CRITERIA SUMMARY\n' +
        'CRITICAL: Use ONLY the evaluation criteria extracted from the opportunity description above. Do NOT invent criteria. Format each row as a pipe-delimited table row: Criterion | Points | HGI Projected Score | Notes. Start with a header row: CRITERION | POINTS | HGI SCORE | NOTES. Base projected scores on HGI capability vs. each criterion — flag honestly where gaps exist. If criteria are unknown, say so and do not fabricate a table.\n\n' +
        '## WHY HGI WINS\n' +
        'Top 3 differentiators mapped to the KNOWN evaluation criteria above. Be concrete — cite real HGI past performance by name and dollar value.\n\n' +
        '## COMPETITIVE THREATS\n' +
        'Who will submit and why they are dangerous. Format each competitor as: Competitor Name | Threat Level | Why Dangerous | HGI Advantage. Start with header row: COMPETITOR | THREAT | WHY DANGEROUS | HGI ADVANTAGE.\n\n' +
        '## FINANCIAL SUMMARY\n' +
        'Use the consolidated estimate from the financial analysis provided above — do not re-estimate. Show LOW/MID/HIGH base period only. Show option years as separate POTENTIAL UPSIDE line. Flag margin concerns honestly.\n\n' +
        '## OPEN ITEMS — TEAM MUST CONFIRM\n' +
        'Numbered list of every item that must be confirmed before submission. Format each as: [number]. [ITEM TITLE] | Suggested owner: [functional role] | [detail]. Flag GPC certification specifically if mentioned in the solicitation. Flag incumbent research. Flag any document gaps. Do NOT assign any specific person by name — use role labels only.\n\n' +
        '## REQUIRED ACTIONS THIS WEEK\n' +
        'Day-by-day action plan from today through submission deadline. Format each day as a subheader (e.g. MONDAY, TUESDAY). Under each day, list actions as bullets. For each action suggest the functional role — do NOT use any individual names. Use: Business Development, Contracts & Compliance, Finance, Technical Lead, Program Director, Business Intelligence.\n\n' +
        '## SUBMISSION REQUIREMENTS\n' +
        'How to submit, where, what format, what exhibits are required. Only state what is known from the solicitation. Note anything unusual or that requires confirmation.',
        'You are HGI senior capture manager preparing a briefing for the President and leadership team. Be direct and honest. Flag risks clearly. Use real HGI past performance: Road Home $13B zero misappropriation, Restore Louisiana $42.3M, BP GCCF 1M+ claims, TPSD $2.96M completed 2022-2025, St. John Sheriff $788K, City of New Orleans WC TPA $283K/month active, SWBNO $200K/month active. Do not fabricate past performance. Do not sugarcoat risks. CRITICAL: Never assign actions or items to specific people by name. Always use functional role labels (Business Development, Contracts/Compliance, Finance, Technical Lead, Program Director, Business Intelligence). The system does not know who holds each role.', 4000
      );
      await patchOpp(opportunity_id, { staffing_plan: briefingPackage });
      await logEvent('proposal.briefing_generated', opportunity_id, opp.title, { type: 'team_briefing', auto: true });
      results.steps_completed.push('team_briefing');

      // Auto-generate Word doc and store download URL
      try {
        const docR = await fetch('https://hgi-capture-system.vercel.app/api/generate-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunity_id })
        });
        if (docR.ok) {
          const docData = await docR.json();
          results.briefing_doc_url = docData.download_url;
          results.steps_completed.push('doc_generated');
        }
      } catch(e) { results.doc_error = e.message; }
    } catch(e) { results.briefing_error = e.message; }
  }

  if ((recommendation === 'GO' || recommendation === 'CONDITIONAL GO') && revisedOpi >= 75 && hasRfpDocument) {
    try {
      // Parse the RFP to extract evaluation criteria, required sections, and key personnel
      var rfpContext = (opp.rfp_text || '').slice(0, 12000);
      
      var proposalPackage = await claudeCall(
        'Generate a COMPLETE proposal package for HGI based on the RFP, scope analysis, financial analysis, and research.\n\n' +
        'RFP TEXT:\n' + rfpContext + '\n\n' +
        'SCOPE ANALYSIS:\n' + scopeAnalysis.slice(0, 1500) + '\n\n' +
        'FINANCIAL ANALYSIS:\n' + financialAnalysis.slice(0, 1500) + '\n\n' +
        'RESEARCH:\n' + researchBrief.slice(0, 1000) + '\n\n' +
        'HGI KB:\n' + kbContext.slice(0, 2000) + '\n\n' +
        (memoryContext ? memoryContext.slice(0, 4000) + '\n\n' : '') +
        'Generate ALL of the following sections:\n\n' +
        '## 1. COMPLIANCE MATRIX\n' +
        'Map every RFP requirement to where it is addressed in the proposal. Format: Requirement | Section | Status (Compliant/Partial/Gap)\n\n' +
        '## 2. KEY PERSONNEL ASSIGNMENTS\n' +
        'Map each RFP-required role to the HGI position title that fills it. Do NOT assign specific people by name — leave all personnel as TBD. Format: RFP Role | HGI Title | Proposed Rate | Personnel: TBD | Justification. CRITICAL PRICING RULE: Do NOT use a fixed rate card. Build rates specific to THIS RFP by starting from the RFP required positions, referencing the HGI KB rate card as ONE data point, and adjusting based on: (1) the evaluation weight of pricing in this specific RFP, (2) comparable contract rates for this agency/vertical, (3) competitive positioning. Every rate must be justified for THIS opportunity.\n\n' +
        '## 3. PRICING EXHIBIT\n' +
        'Build the pricing table matching the RFP format exactly. Use the RFP position titles — do not rename them. For each position, propose a fully-burdened hourly rate built specifically for this opportunity. Reference the HGI KB rate card as a starting point but adjust based on competitive landscape, agency budget expectations, and evaluation criteria weight of pricing. Show your reasoning for rate selection.\n\n' +
        '## 4. TECHNICAL APPROACH\n' +
        'Draft the technical approach section (600+ words) addressing the evaluation criteria. Reference specific scope requirements and how HGI addresses each one.\n\n' +
        '## 5. PAST PERFORMANCE MATRIX\n' +
        'List 3 relevant past performance references with: Program Name, Client, Contract Value, Period, HGI Role, Key Outcomes, Relevance to this RFP. Use real HGI past performance only.\n\n' +
        '## 6. STAFFING & CAPACITY\n' +
        'Build the staffing plan from THIS RFP required positions — do not use a generic template. For each position the RFP requests: identify the HGI role that fills it, describe the qualifications required, and explain how HGI sources that talent. Then address surge capacity and current workload availability. All personnel TBD — names are assigned by the team, not the system.\n\n' +
        '## 7. QUESTIONS FOR THE AGENCY\n' +
        'List the formal written questions to submit before the question deadline. Each question should reference the specific RFP section it relates to.\n\n' +
        '## 8. SUBMISSION TIMELINE\n' +
        'Create a day-by-day timeline from today through submission deadline showing every milestone: question submission, team assignments, draft sections, internal review, red team, final assembly, submission.',
        'You are HGI senior proposal manager. Generate a COMPLETE submission-ready proposal package. CONFIRMED PAST PERFORMANCE ONLY: Road Home Program $67M direct/$13B+ program zero misappropriation, HAP $950M, Restore Louisiana $42.3M CDBG-DR, TPSD $2.96M construction mgmt 2022-2025 (completed), St. John Sheriff $788K, Rebuild NJ $67.7M, BP GCCF $1.65M 1M+ claims Kenneth Feinberg, City of New Orleans WC TPA $283K/month (active), SWBNO billing appeals $200K/month (active). Do NOT list PBGC, Orleans Parish School Board, LIGA, or TPCIGA without explicit confirmation. Do NOT fabricate past performance. PRICING: Build all rates specific to this RFP — do not copy a rate card. STAFFING: Build staffing plan from this RFP required positions — do not use generic templates. Every section must directly address the RFP evaluation criteria.', 4000
      );

      var existingDraft = (opp.staffing_plan || '');
      var hasRealDraft = existingDraft.includes('[WORKING DRAFT') || existingDraft.length > 10000;
      if (hasRealDraft) {
        results.steps_completed.push('proposal_package_skipped_real_draft_exists');
        results.proposal_note = 'Real working draft detected in staffing_plan (' + existingDraft.length + ' chars). Orchestrator will NOT overwrite. Proposal improvements stored in organism memory instead.';
        await storeMemory('orchestrator_proposal', opportunity_id, (opp.agency||'')+','+(opp.vertical||'')+',proposal_improvements', 'PROPOSAL IMPROVEMENTS (not overwriting real draft): ' + proposalPackage.slice(0, 3000), 'recommendation');
      } else {
        await patchOpp(opportunity_id, { staffing_plan: proposalPackage });
        await logEvent('proposal.package_generated', opportunity_id, opp.title, { sections: 8, auto: true });
        results.steps_completed.push('proposal_package');
      }
    } catch(e) { results.proposal_error = e.message; }
  }

  // Store KB coverage gaps on opportunity record for visibility
  if (kbGapReport) {
    try { await patchOpp(opportunity_id, { kb_coverage_gaps: kbGapReport }); } catch(e) {}
    results.kb_gap_report = kbGapReport;
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