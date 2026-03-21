export const config = { maxDuration: 300 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
const BASE = 'https://hgi-capture-system.vercel.app';

function makeId() { return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

async function sbGet(path) {
  try { const r = await fetch(SB + path, { headers: H }); if (!r.ok) return []; return await r.json(); } catch(e) { return []; }
}

async function storeMemory(agent, oppId, tags, observation, memType) {
  try {
    await fetch(SB + '/rest/v1/organism_memory', {
      method: 'POST',
      headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: observation, memory_type: memType || 'analysis', created_at: new Date().toISOString() })
    });
  } catch(e) {}
}

async function webSearch(query) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: 'You are an intelligence analyst. Search the web and return specific verified findings. Always cite what you found and where.',
        messages: [{ role: 'user', content: query }]
      })
    });
    if (!r.ok) return '';
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  } catch(e) { return ''; }
}

async function claudeAnalyze(system, prompt, maxTokens) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens || 1500, system: system, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) return '';
    const d = await r.json();
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return ''; }
}

// ═══ THE 20 AGENT WORK FUNCTIONS ═══
// Each agent does its actual job — reads web + memory + stores, writes findings back

async function runIntelligenceEngine(opp, memory) {
  // Searches web for real competitor data, agency intel, award history — stores permanently
  var query = 'Louisiana government contract awards for ' + (opp.agency || '') + ' ' + (opp.vertical || 'disaster recovery') + ' consultant services. Who won recent contracts? What was the award amount? Who are the competing firms?';
  var webFindings = await webSearch(query);
  if (!webFindings || webFindings.length < 100) return null;
  var analysis = await claudeAnalyze(
    'You are HGI competitive intelligence analyst. Extract and store specific verified findings only. HGI has NEVER had a direct federal contract — all work is through state/local agencies.',
    'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + ' | ' + (opp.vertical || '') + '\n\nWEB FINDINGS:\n' + webFindings.slice(0, 3000) + '\n\nPRIOR MEMORY:\n' + memory.slice(0, 1500) + '\n\nExtract: (1) Named competitors likely to bid and their strengths, (2) Recent award amounts for similar contracts at this agency or similar agencies, (3) Incumbent contractor if any, (4) Agency budget and procurement patterns, (5) Any red flags or opportunities unique to this agency. Be specific — cite dollar amounts, names, dates. Flag anything that contradicts prior assumptions.',
    1200
  );
  if (analysis && analysis.length > 100) {
    await storeMemory('intelligence_engine', opp.id, opp.agency + ',' + (opp.vertical || '') + ',competitive_intel,web_research', 'INTELLIGENCE ENGINE — ' + opp.agency + ' (' + opp.title + '):\n' + analysis, 'competitive_intel');
    // Also write to competitive_intelligence store
    try {
      await fetch(SB + '/rest/v1/competitive_intelligence', {
        method: 'POST',
        headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ id: 'ci-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), competitor_name: 'market_research', agency: opp.agency || '', vertical: opp.vertical || '', strategic_notes: analysis.slice(0, 2000), opportunity_id: opp.id, source_agent: 'intelligence_engine', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      });
    } catch(e) {}
    return analysis;
  }
  return null;
}

async function runCrmAgent(opp, memory) {
  // Researches and builds contact list for this agency — who are the decision makers?
  var query = 'Who is the procurement director or purchasing manager at ' + (opp.agency || '') + ' Louisiana? Who signs contracts? Who are the key decision makers for professional services?';
  var webFindings = await webSearch(query);
  if (!webFindings || webFindings.length < 100) return null;
  var analysis = await claudeAnalyze(
    'You are HGI relationship intelligence agent. Find and store real verified contact information for decision makers at government agencies.',
    'AGENCY: ' + (opp.agency || '') + ' | STATE: ' + (opp.state || 'LA') + '\n\nWEB FINDINGS:\n' + webFindings.slice(0, 2000) + '\n\nPRIOR MEMORY:\n' + memory.slice(0, 1000) + '\n\nExtract: Named contacts with titles, emails if found, phone numbers if found. Flag relationship strength as cold/unknown. Note any HGI connections or mutual contacts. Note best outreach approach based on agency culture.',
    800
  );
  if (analysis && analysis.length > 80) {
    await storeMemory('crm_agent', opp.id, opp.agency + ',contacts,relationship_graph', 'CRM AGENT — ' + opp.agency + ' contacts:\n' + analysis, 'relationship');
    return analysis;
  }
  return null;
}

async function runFinancialAgent(opp, memory) {
  // Searches for real comparable contract award amounts to benchmark pricing
  var query = 'Louisiana parish or city disaster recovery consulting contract award amounts 2022 2023 2024 2025. FEMA PA program management MSA pricing. What do similar contracts pay?';
  var webFindings = await webSearch(query);
  if (!webFindings || webFindings.length < 100) return null;
  var analysis = await claudeAnalyze(
    'You are HGI financial analyst. Find and store real verified contract award amounts to calibrate our pricing. Only cite verified numbers with sources.',
    'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + '\n\nWEB AWARD DATA:\n' + webFindings.slice(0, 2000) + '\n\nPRIOR MEMORY:\n' + memory.slice(0, 1000) + '\n\nExtract: Real contract award amounts for comparable work. Name the agency, amount, period, and scope. Calculate what this implies for our estimate on this opportunity. Flag if our current estimate seems high or low.',
    800
  );
  if (analysis && analysis.length > 80) {
    await storeMemory('financial_agent', opp.id, opp.agency + ',' + (opp.vertical || '') + ',pricing_benchmark,financial', 'FINANCIAL AGENT — pricing benchmarks for ' + opp.title + ':\n' + analysis, 'pricing_benchmark');
    return analysis;
  }
  return null;
}

async function runSelfAwarenessEngine(opps, memories, workResults) {
  // Surveys everything the organism did today and identifies improvements
  var analysis = await claudeAnalyze(
    'You are the HGI self-awareness engine. You monitor every agent, identify limitations, and recommend improvements. You see everything.',
    'ORGANISM DAILY WORK SUMMARY:\n\n' +
    'Opportunities worked on: ' + opps.length + '\n' +
    'Memories in brain: ' + memories.length + '\n\n' +
    'WORK COMPLETED TODAY:\n' + JSON.stringify(workResults).slice(0, 2000) + '\n\n' +
    'CURRENT MEMORY STATE:\n' + memories.slice(0, 20).map(function(m) { return '[' + m.agent + ' | ' + m.memory_type + ']:\n' + (m.observation || '').slice(0, 200); }).join('\n\n') + '\n\n' +
    'Analyze: (1) What patterns are emerging across opportunities? (2) Which agents are producing the most valuable intelligence? (3) What data gaps are costing HGI the most? (4) What single improvement would have the highest impact on win rate? (5) Are there any anomalies, contradictions, or things that dont add up in the data?',
    1200
  );
  if (analysis && analysis.length > 100) {
    await storeMemory('self_awareness', null, 'system_health,self_assessment,patterns', 'SELF-AWARENESS DAILY DIGEST:\n' + analysis, 'pattern');
  }
  return analysis;
}

async function runProposalAgent(opp, memory) {
  // Continuously improves proposal patterns based on what it knows — no outcome needed
  if ((opp.staffing_plan || '').length < 200) return null; // No draft to improve
  var analysis = await claudeAnalyze(
    'You are HGI proposal strategy agent. Analyze the existing proposal draft and identify specific improvements based on what you know about the evaluation criteria, competitors, and HGI capabilities.',
    'OPPORTUNITY: ' + opp.title + ' | ' + opp.agency + '\nEVAL CRITERIA: Technical 30 / Experience 25 / Past Performance 20 / Staffing 15 / Price 10\n\nORGANISM INTELLIGENCE:\n' + memory.slice(0, 2000) + '\n\nProposal exists. Identify: (1) Which sections are weakest against the eval criteria? (2) What specific content is missing that would score higher? (3) Are there any compliance gaps? (4) Is the competitive positioning strong enough against CDR Maguire, Tetra Tech, IEM? (5) What is the single most impactful edit to make?',
    1000
  );
  if (analysis && analysis.length > 100) {
    await storeMemory('proposal_agent', opp.id, opp.agency + ',' + (opp.vertical || '') + ',proposal_improvement', 'PROPOSAL AGENT analysis for ' + opp.title + ':\n' + analysis, 'pattern');
    return analysis;
  }
  return null;
}

async function runContentEngine(memory) {
  // Analyzes all organism output for voice consistency and patterns
  var analysis = await claudeAnalyze(
    'You are HGI institutional voice agent. Analyze patterns in HGI communications and proposals to maintain and improve voice consistency.',
    'ORGANISM MEMORY (recent outputs):\n' + memory.slice(0, 2000) + '\n\nAnalyze: (1) What voice patterns are emerging — active vs passive, preferred phrases, sentence structures? (2) What phrases or structures should be added to the blocked list? (3) What makes HGI writing distinctive and authoritative? (4) What specific style improvements would most strengthen the next proposal?',
    800
  );
  if (analysis && analysis.length > 80) {
    await storeMemory('content_engine', null, 'voice,style,content_standards', 'CONTENT ENGINE voice analysis:\n' + analysis, 'pattern');
  }
  return analysis;
}

async function runScannerOpi(opps, memory) {
  // Re-evaluates OPI scores based on all accumulated intelligence
  var analysis = await claudeAnalyze(
    'You are HGI OPI calibration engine. You continuously refine scoring accuracy based on everything the organism knows.',
    'ACTIVE OPPORTUNITIES:\n' + opps.map(function(o) { return o.title + ' | ' + o.agency + ' | OPI: ' + o.opi + ' | Vertical: ' + o.vertical; }).join('\n') + '\n\nORGANISM INTELLIGENCE:\n' + memory.slice(0, 2000) + '\n\nFor each opportunity: (1) Does the current OPI reflect what the organism now knows about competition, agency relationships, and HGI fit? (2) Which scores should be adjusted and why? (3) What scoring factors are consistently over or underweighted? Be specific with recommended adjustments.',
    1000
  );
  if (analysis && analysis.length > 80) {
    await storeMemory('scanner_opi', null, 'opi_calibration,scoring,pattern', 'OPI CALIBRATION analysis:\n' + analysis, 'pattern');
  }
  return analysis;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const trigger = (req.body || {}).trigger || (req.method === 'GET' ? 'manual-browser' : 'cron');
  const results = { trigger, started_at: new Date().toISOString(), work_completed: [], errors: [] };

  // Load everything the organism needs
  const [activeOpps, allMemories, competitiveStore] = await Promise.all([
    sbGet('/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.65&select=id,title,agency,vertical,state,opi_score,due_date,stage,scope_analysis,financial_analysis,research_brief,staffing_plan,estimated_value&order=opi_score.desc&limit=10'),
    sbGet('/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=60'),
    sbGet('/rest/v1/competitive_intelligence?order=created_at.desc&limit=20')
  ]);

  results.opps_loaded = activeOpps.length;
  results.memories_loaded = allMemories.length;

  // Build memory injection for each agent
  const memoryText = allMemories.slice(0, 40).map(function(m) {
    return '[' + (m.agent || '') + ' | ' + (m.memory_type || '') + ' | ' + (m.created_at || '').slice(0, 10) + ']:\n' + (m.observation || '').slice(0, 400);
  }).join('\n\n---\n\n');

  // Run agents on each active opportunity
  for (var i = 0; i < activeOpps.length; i++) {
    var opp = activeOpps[i];
    var oppMemory = allMemories.filter(function(m) {
      return (m.opportunity_id === opp.id) || (m.entity_tags || '').includes(opp.agency || '');
    }).map(function(m) { return (m.observation || '').slice(0, 300); }).join('\n\n');
    var combinedMemory = oppMemory + '\n\n' + memoryText.slice(0, 2000);

    // Intelligence Engine — web research for EVERY active opportunity, every day
    try {
      var intel = await runIntelligenceEngine(opp, combinedMemory);
      if (intel) results.work_completed.push({ agent: 'intelligence_engine', opp: opp.title, chars: intel.length });
    } catch(e) { results.errors.push('intel_engine:' + opp.id + ':' + e.message); }

    // CRM Agent — build contact lists proactively
    try {
      var crm = await runCrmAgent(opp, combinedMemory);
      if (crm) results.work_completed.push({ agent: 'crm_agent', opp: opp.title, chars: crm.length });
    } catch(e) { results.errors.push('crm_agent:' + opp.id + ':' + e.message); }

    // Financial Agent — benchmark pricing from web data
    try {
      var fin = await runFinancialAgent(opp, combinedMemory);
      if (fin) results.work_completed.push({ agent: 'financial_agent', opp: opp.title, chars: fin.length });
    } catch(e) { results.errors.push('financial_agent:' + opp.id + ':' + e.message); }

    // Proposal Agent — continuous improvement, no outcome needed
    try {
      var prop = await runProposalAgent(opp, combinedMemory);
      if (prop) results.work_completed.push({ agent: 'proposal_agent', opp: opp.title, chars: prop.length });
    } catch(e) { results.errors.push('proposal_agent:' + opp.id + ':' + e.message); }
  }

  // System-wide agents — run once across everything, not per opportunity
  try {
    var content = await runContentEngine(memoryText);
    if (content) results.work_completed.push({ agent: 'content_engine', chars: content.length });
  } catch(e) { results.errors.push('content_engine:' + e.message); }

  try {
    var opi = await runScannerOpi(activeOpps, memoryText);
    if (opi) results.work_completed.push({ agent: 'scanner_opi', chars: opi.length });
  } catch(e) { results.errors.push('scanner_opi:' + e.message); }

  // Self-Awareness Engine — runs last, sees everything done today
  try {
    var selfAware = await runSelfAwarenessEngine(activeOpps, allMemories, results.work_completed);
    if (selfAware) results.work_completed.push({ agent: 'self_awareness', chars: selfAware.length });
  } catch(e) { results.errors.push('self_awareness:' + e.message); }

  // Log to hunt_runs
  try {
    await fetch(SB + '/rest/v1/hunt_runs', {
      method: 'POST',
      headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        id: 'hr-work-' + Date.now(),
        source: 'organism_work',
        status: results.work_completed.length + ' work items completed | ' + activeOpps.length + ' opps | ' + allMemories.length + ' memories | ' + results.errors.length + ' errors',
        run_at: new Date().toISOString(),
        opportunities_found: 0
      })
    });
  } catch(e) {}

  results.completed_at = new Date().toISOString();
  results.total_work_items = results.work_completed.length;
  return res.status(200).json(results);
}