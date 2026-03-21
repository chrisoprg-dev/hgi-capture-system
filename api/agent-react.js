export const config = { maxDuration: 120 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
var DOLLAR = String.fromCharCode(36);

var AGENTS = {
  scanner_opi: {
    identity: 'OPI scoring calibration engine for HGI. You compare predicted OPI scores against actual outcomes and recommend model adjustments.',
    reads: ['outcomes'],
    writes: ['system_performance_log']
  },
  financial_pricing: {
    identity: 'HGI CFO-level financial analyst. You track pricing accuracy, benchmark actual contract values against estimates, and refine estimation models.',
    reads: ['outcomes', 'competitive_intelligence'],
    writes: ['competitive_intelligence', 'system_performance_log']
  },
  intelligence_engine: {
    identity: 'HGI competitive intelligence analyst. You extract and store strategic competitor data permanently. Every finding you store helps future bids.',
    reads: ['competitive_intelligence'],
    writes: ['competitive_intelligence']
  },
  research_analysis: {
    identity: 'HGI strategic research and analysis agent. You produce competitive analysis from verified findings.',
    reads: ['competitive_intelligence'],
    writes: ['system_performance_log']
  },
  crm_relationship: {
    identity: 'HGI relationship intelligence agent. You assess contacts, relationship strength, cross-agency connections, and outreach timing.',
    reads: ['relationship_graph'],
    writes: ['relationship_graph']
  },
  recruiting_bench: {
    identity: 'HGI staffing and bench intelligence agent. You track who fills roles, identify gaps, and flag recurring qualification shortfalls.',
    reads: ['outcomes'],
    writes: ['system_performance_log']
  },
  proposal_agent: {
    identity: 'HGI proposal strategy agent. You identify what made proposals win or lose and encode patterns for future bids.',
    reads: ['outcomes', 'system_performance_log'],
    writes: ['system_performance_log']
  },
  content_engine: {
    identity: 'HGI institutional voice agent. You track writing patterns, blocked phrases, preferred structures, and active voice targets.',
    reads: ['system_performance_log'],
    writes: ['system_performance_log']
  },
  design_visual: {
    identity: 'HGI visual design and brand standards agent. You track which visual formats correlate with wins.',
    reads: ['system_performance_log'],
    writes: ['system_performance_log']
  },
  self_awareness: {
    identity: 'HGI system self-awareness engine. You monitor ALL agents, detect patterns across the entire organism, identify limitations, and recommend improvements. You see everything.',
    reads: ['outcomes', 'competitive_intelligence', 'relationship_graph', 'system_performance_log'],
    writes: ['system_performance_log']
  },
  executive_brief: {
    identity: 'HGI executive briefing agent for Lou Resweber (CEO) and Larry Oney (Chairman). Concise, actionable, no noise.',
    reads: ['outcomes'],
    writes: ['system_performance_log']
  },
  brief_agent: {
    identity: 'HGI team briefing generator. You synthesize all intelligence into decision-ready briefing packages.',
    reads: ['competitive_intelligence', 'relationship_graph'],
    writes: []
  },
  pipeline_scanner: {
    identity: 'HGI pipeline health monitor. You watch deadlines, stale pursuits, and anomalies.',
    reads: [],
    writes: ['system_performance_log']
  },
  quality_gate: {
    identity: 'HGI submission quality gate. You check compliance, content quality, and completeness.',
    reads: ['system_performance_log'],
    writes: ['system_performance_log']
  },
  knowledge_base: {
    identity: 'HGI knowledge base agent. You manage chunk updates, tag winning content, assess coverage gaps.',
    reads: [],
    writes: ['system_performance_log']
  },
  scraper_insights: {
    identity: 'HGI scraper health and data quality monitor. You track source yield, detect degradation, report ROI.',
    reads: [],
    writes: ['system_performance_log']
  },
  discovery: {
    identity: 'HGI opportunity discovery agent. You manage source coverage, keyword effectiveness, and missing source identification.',
    reads: ['competitive_intelligence'],
    writes: []
  }
};

async function claudeReact(agentConfig, eventType, action, opportunity, storeData, extraPayload) {
  var oppSummary = {
    id: opportunity.id || null,
    title: opportunity.title || null,
    agency: opportunity.agency || null,
    vertical: opportunity.vertical || null,
    opi_score: opportunity.opi_score || null,
    outcome: opportunity.outcome || null,
    outcome_notes: opportunity.outcome_notes || null,
    stage: opportunity.stage || null,
    estimated_value: opportunity.estimated_value || null,
    due_date: opportunity.due_date || null
  };

  var prompt = 'EVENT: ' + eventType + '\nACTION REQUESTED: ' + action + '\n\nOPPORTUNITY:\n' + JSON.stringify(oppSummary, null, 2) + '\n\n';

  if (opportunity.scope_analysis) prompt += 'SCOPE ANALYSIS (excerpt):\n' + (opportunity.scope_analysis || '').slice(0, 800) + '\n\n';
  if (opportunity.financial_analysis) prompt += 'FINANCIAL ANALYSIS (excerpt):\n' + (opportunity.financial_analysis || '').slice(0, 800) + '\n\n';
  if (opportunity.research_brief) prompt += 'RESEARCH BRIEF (excerpt):\n' + (opportunity.research_brief || '').slice(0, 800) + '\n\n';
  if (opportunity.capture_action) prompt += 'CAPTURE ACTION:\n' + (opportunity.capture_action || '').slice(0, 400) + '\n\n';

  if (extraPayload) prompt += 'EVENT PAYLOAD:\n' + JSON.stringify(extraPayload, null, 2) + '\n\n';

  var priorInsights = extraPayload && extraPayload._prior_insights ? extraPayload._prior_insights : null;
  if (priorInsights && Array.isArray(priorInsights) && priorInsights.length > 0) {
    prompt += 'TIER 1 AGENT INSIGHTS (these agents already analyzed this event and wrote to the stores — use their findings, do not repeat their work, build on it):\n';
    for (var pi = 0; pi < priorInsights.length; pi++) {
      prompt += '- ' + priorInsights[pi].agent + ': ' + priorInsights[pi].insight + '\n';
    }
    prompt += '\n';
  }

  if (storeData.outcomes && storeData.outcomes.length > 0) {
    prompt += 'OUTCOME HISTORY (' + storeData.outcomes.length + ' records):\n' + JSON.stringify(storeData.outcomes.slice(0, 10).map(function(o) { return { title: o.title, agency: o.agency, vertical: o.vertical, opi: o.opi_score, outcome: o.outcome, notes: o.outcome_notes }; }), null, 2) + '\n\n';
  }
  if (storeData.competitive_intelligence && storeData.competitive_intelligence.length > 0) {
    prompt += 'COMPETITIVE INTELLIGENCE STORE (' + storeData.competitive_intelligence.length + ' entries):\n' + JSON.stringify(storeData.competitive_intelligence.slice(0, 15), null, 2) + '\n\n';
  }
  if (storeData.relationship_graph && storeData.relationship_graph.length > 0) {
    prompt += 'RELATIONSHIP GRAPH (' + storeData.relationship_graph.length + ' contacts):\n' + JSON.stringify(storeData.relationship_graph.slice(0, 15), null, 2) + '\n\n';
  }
  if (storeData.system_performance_log && storeData.system_performance_log.length > 0) {
    prompt += 'RECENT PERFORMANCE LOG (' + storeData.system_performance_log.length + ' entries):\n' + JSON.stringify(storeData.system_performance_log.slice(0, 10), null, 2) + '\n\n';
  }

  prompt += 'Respond in JSON only. No markdown backticks. No preamble.\n{\n  "analysis": "Your reasoning. 3-8 sentences. Be specific, cite data, make connections.",\n  "store_updates": [\n    { "store": "TABLE_NAME", "data": { ONLY use these exact field names per store... } }\n  ],\n  "downstream_insights": "What other agents should know. 1-3 sentences."\n}\n\nSTORE FIELD NAMES (use ONLY these):\n- competitive_intelligence: competitor_name, agency, contract_value, outcome, bid_price, strengths, weaknesses, strategic_notes, vertical\n- relationship_graph: contact_name, title, organization, email, phone, relationship_strength (none/cold/warm/hot/strong), last_contact, notes, connected_orgs\n- system_performance_log: agent, event_type, metric_type, metric_value, details\nAll values must be strings. Do not invent field names.';

  var system = 'You are the ' + agentConfig.identity + ' You are one of 20 agents in a living organism. Your analysis compounds — what you write today will be read by other agents on future opportunities. The 50th opportunity must be smarter than the 1st because of what you contribute. Be specific. Cite data. Make connections across opportunities and agencies. Never fabricate facts about HGI. HGI confirmed past performance: Road Home ' + DOLLAR + '67M/' + DOLLAR + '13B+ zero misappropriation, Restore LA ' + DOLLAR + '42.3M, TPSD ' + DOLLAR + '2.96M (completed 2022-2025), St. John Sheriff ' + DOLLAR + '788K, Rebuild NJ ' + DOLLAR + '67.7M, BP GCCF ' + DOLLAR + '1.65M, City of NOLA WC TPA ' + DOLLAR + '283K/mo (active), SWBNO ' + DOLLAR + '200K/mo (active). HGI has NEVER had a direct federal contract — all work flows through state/local agencies.';

  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system: system, messages: [{ role: 'user', content: prompt }] })
  });

  if (!r.ok) {
    var errText = await r.text();
    throw new Error('Claude API ' + r.status + ': ' + errText.slice(0, 200));
  }

  var data = await r.json();
  var text = (data.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  var clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function loadStores(agentConfig, opportunityId) {
  var storeData = {};
  for (var i = 0; i < agentConfig.reads.length; i++) {
    var store = agentConfig.reads[i];
    try {
      if (store === 'outcomes') {
        var r = await fetch(SB + '/rest/v1/opportunities?outcome=not.is.null&select=id,title,agency,vertical,opi_score,outcome,outcome_notes&order=last_updated.desc&limit=20', { headers: H });
        if (r.ok) storeData.outcomes = await r.json(); else storeData.outcomes = [];
      } else if (store === 'competitive_intelligence') {
        var r2 = await fetch(SB + '/rest/v1/competitive_intelligence?order=created_at.desc&limit=30', { headers: H });
        if (r2.ok) storeData.competitive_intelligence = await r2.json(); else storeData.competitive_intelligence = [];
      } else if (store === 'relationship_graph') {
        var r3 = await fetch(SB + '/rest/v1/relationship_graph?order=updated_at.desc&limit=30', { headers: H });
        if (r3.ok) storeData.relationship_graph = await r3.json(); else storeData.relationship_graph = [];
      } else if (store === 'system_performance_log') {
        var r4 = await fetch(SB + '/rest/v1/system_performance_log?order=created_at.desc&limit=20', { headers: H });
        if (r4.ok) storeData.system_performance_log = await r4.json(); else storeData.system_performance_log = [];
      }
    } catch(e) { storeData[store] = []; }
  }
  return storeData;
}

var STORE_COLUMNS = {
  competitive_intelligence: ['competitor_name', 'agency', 'opportunity_id', 'contract_value', 'outcome', 'bid_price', 'strengths', 'weaknesses', 'strategic_notes', 'vertical'],
  relationship_graph: ['contact_name', 'title', 'organization', 'email', 'phone', 'relationship_strength', 'last_contact', 'notes', 'connected_orgs'],
  system_performance_log: ['agent', 'event_type', 'metric_type', 'metric_value', 'details']
};

async function writeStores(updates, agentName, opportunityId) {
  var results = [];
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    if (!u.store || !u.data) { results.push({ store: u.store, status: 'skipped_invalid' }); continue; }
    var validCols = STORE_COLUMNS[u.store];
    if (!validCols) { results.push({ store: u.store, status: 'unknown_store' }); continue; }
    try {
      var record = {};
      var dataKeys = Object.keys(u.data);
      for (var k = 0; k < dataKeys.length; k++) {
        var key = dataKeys[k];
        if (validCols.indexOf(key) !== -1) {
          var val = u.data[key];
          record[key] = (typeof val === 'object') ? JSON.stringify(val) : String(val || '');
        }
      }
      if (u.store === 'system_performance_log') {
        record.agent = record.agent || agentName;
        record.event_type = record.event_type || '';
        if (!record.metric_type) record.metric_type = 'observation';
        if (!record.details) {
          var allVals = dataKeys.map(function(dk) { return dk + ': ' + String(u.data[dk] || '').slice(0, 200); }).join('; ');
          record.details = allVals.slice(0, 2000);
        }
      }
      if (u.store === 'competitive_intelligence' && !record.competitor_name) {
        record.competitor_name = 'unknown';
      }
      record.id = u.store.slice(0, 2) + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      record.source_agent = agentName;
      record.opportunity_id = opportunityId || null;
      record.created_at = new Date().toISOString();
      record.updated_at = new Date().toISOString();
      var wr = await fetch(SB + '/rest/v1/' + u.store, {
        method: 'POST',
        headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(record)
      });
      results.push({ store: u.store, status: wr.ok ? 'written' : 'failed_' + wr.status, id: record.id });
    } catch(e) { results.push({ store: u.store, status: 'error', error: e.message }); }
  }
  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ agents: Object.keys(AGENTS).length, agent_list: Object.keys(AGENTS), status: 'reaction engine online' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var agentName = body.agent;
  var eventType = body.event_type;
  var action = body.action || '';
  var opportunityId = body.opportunity_id;

  if (!agentName || !eventType) return res.status(400).json({ error: 'agent and event_type required' });
  var agentConfig = AGENTS[agentName];
  if (!agentConfig) return res.status(400).json({ error: 'Unknown agent: ' + agentName });

  var opportunity = {};
  if (opportunityId) {
    try {
      var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunityId) + '&limit=1', { headers: H });
      var opps = await oppR.json();
      if (opps && opps.length) opportunity = opps[0];
    } catch(e) {}
  }

  var storeData = await loadStores(agentConfig, opportunityId);

  var reaction;
  try {
    var extraData = body.data || null;
    if (body.prior_insights && Array.isArray(body.prior_insights)) {
      if (!extraData) extraData = {};
      extraData._prior_insights = body.prior_insights;
    }
    reaction = await claudeReact(agentConfig, eventType, action, opportunity, storeData, extraData);
  } catch(e) {
    return res.status(500).json({ error: 'Reaction failed', agent: agentName, event: eventType, details: e.message });
  }

  var writeResults = [];
  if (reaction.store_updates && Array.isArray(reaction.store_updates) && reaction.store_updates.length > 0) {
    writeResults = await writeStores(reaction.store_updates, agentName, opportunityId);
  }

  // DUAL-WRITE: Store full analysis in organism_memory — no truncation, no schema constraint
  if (reaction.analysis && reaction.analysis.length > 30) {
    try {
      var memTags = agentName + ',' + eventType;
      if (opportunity && opportunity.agency) memTags += ',' + opportunity.agency;
      if (opportunity && opportunity.vertical) memTags += ',' + opportunity.vertical;
      await fetch('https://hgi-capture-system.vercel.app/api/memory-store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'react_' + agentName,
          opportunity_id: opportunityId || null,
          entity_tags: memTags,
          observation: agentName + ' reacting to ' + eventType + ': ' + reaction.analysis + (reaction.downstream_insights ? ' DOWNSTREAM: ' + reaction.downstream_insights : ''),
          memory_type: 'agent_reaction'
        })
      });
    } catch(e) {}
  }

  try {
    await fetch(SB + '/rest/v1/hunt_runs', {
      method: 'POST',
      headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        source: 'react:' + agentName,
        status: eventType + '|' + (reaction.analysis || '').slice(0, 80),
        run_at: new Date().toISOString(),
        opportunities_found: 0,
        notes: JSON.stringify({ agent: agentName, event: eventType, analysis: (reaction.analysis || '').slice(0, 400), writes: writeResults, downstream: (reaction.downstream_insights || '').slice(0, 200) }).slice(0, 2000)
      })
    });
  } catch(e) {}

  return res.status(200).json({
    agent: agentName,
    event_type: eventType,
    opportunity_id: opportunityId,
    analysis: reaction.analysis,
    store_updates: writeResults,
    downstream_insights: reaction.downstream_insights
  });
}