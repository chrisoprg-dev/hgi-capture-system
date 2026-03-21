export const config = { maxDuration: 300 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
const BASE = 'https://hgi-capture-system.vercel.app';

// THE CASCADE MAP — the organism's nervous system
// Every event type maps to an array of reactions
// Each reaction: { agent, action, type, condition? }
// type: 'api_call' (hits an endpoint), 'data_update' (writes to Supabase), 'signal' (logs for agent to read)
// condition: optional function(payload) => bool — only fires if true
//
// TO ADD A NEW CASCADE: add an entry here. Every downstream agent reacts automatically.
// TO ADD A NEW AGENT: add its reactions to the relevant event types.

var CASCADE_MAP = {

  // ═══ DISCOVERY CASCADES ═══
  'opportunity.discovered': [
    { agent: 'scanner_opi', action: 'Score new opportunity', type: 'signal', notes: 'OPI scoring happens inline in intake.js — already wired' },
    { agent: 'pipeline_scanner', action: 'Add to monitoring watchlist', type: 'signal' }
  ],

  'opportunity.tier1_discovered': [
    { agent: 'orchestrator', action: 'Run full analysis', type: 'api_call', endpoint: '/api/orchestrate', method: 'POST', bodyKey: 'opportunity_id' },
    { agent: 'crm_relationship', action: 'Search relationship graph for any contacts at this agency or connected agencies. Assess relationship strength. Flag if no contacts exist. Recommend immediate outreach if warm contacts found.', type: 'react' },
    { agent: 'dashboard', action: 'Refresh pipeline stats', type: 'signal' }
  ],

  // ═══ ORCHESTRATOR CASCADES ═══
  'opportunity.scope_analyzed': [
    { agent: 'financial_pricing', action: 'Scope feeds financial analysis', type: 'signal', notes: 'Already chained in orchestrator — cascade logs it' }
  ],

  'opportunity.financial_analyzed': [
    { agent: 'research_analysis', action: 'Financial feeds research', type: 'signal' }
  ],

  'opportunity.researched': [
    { agent: 'winnability', action: 'Research feeds GO/NO-GO', type: 'signal' }
  ],

  'opportunity.winnability_scored': [
    { agent: 'quality_gate', action: 'Run submission quality check', type: 'api_call', endpoint: '/api/quality-gate', method: 'GET', queryKey: 'opportunity_id', condition: function(p) { return p.data && (p.data.recommendation === 'GO' || p.data.recommendation === 'CONDITIONAL GO'); } },
    { agent: 'recruiting_bench', action: 'Check staffing availability against required roles from scope analysis. Identify gaps. Flag recurring qualification shortfalls. Recommend teaming vs hiring for each gap.', type: 'react', condition: function(p) { return p.data && (p.data.recommendation === 'GO' || p.data.recommendation === 'CONDITIONAL GO'); } },
    { agent: 'crm_relationship', action: 'Search relationship graph for contacts at this agency. Assess relationship strength. Identify cross-agency connections from other contacts. Recommend outreach strategy.', type: 'react', condition: function(p) { return p.data && (p.data.recommendation === 'GO' || p.data.recommendation === 'CONDITIONAL GO'); } },
    { agent: 'brief_agent', action: 'Generate team briefing', type: 'signal', notes: 'Already chained in orchestrator for GO decisions' },
    { agent: 'proposal_agent', action: 'Generate proposal if RFP exists', type: 'signal', notes: 'Already chained in orchestrator for GO+RFP' },
    { agent: 'content_engine', action: 'Review all generated content for this opportunity against HGI voice standards. Check active voice ratio, blocked phrases, preferred terminology. Flag issues and suggest corrections.', type: 'react', tier: 2 },
    { agent: 'design_visual', action: 'Format briefing/proposal with brand standards', type: 'signal' }
  ],

  // ═══ PROPOSAL CASCADES ═══
  'proposal.section_drafted': [
    { agent: 'content_engine', action: 'Check this section against HGI voice standards: active voice target, blocked phrases, preferred structures. Flag deviations and suggest fixes.', type: 'react' },
    { agent: 'design_visual', action: 'Apply visual formatting', type: 'signal' },
    { agent: 'quality_gate', action: 'Check this section against RFP eval criteria. Identify missing requirements. Flag compliance gaps with point values at risk.', type: 'react' }
  ],

  'proposal.edited': [
    { agent: 'knowledge_base', action: 'Understand what changed semantically. Find source KB chunks. Decide whether to replace, supplement, or flag for review. The correction must propagate to future proposals.', type: 'react' },
    { agent: 'content_engine', action: 'Analyze the semantic editing pattern — not just text diff. Identify structural changes, blocked phrases, preferred voice. Update writing standards for this section type and vertical.', type: 'react' },
    { agent: 'proposal_agent', action: 'Calculate edit distance for this section type. Analyze whether the organism is improving over time. Identify which section types still need the most work.', type: 'react' },
    { agent: 'design_visual', action: 'Update layout if structure changed', type: 'signal' },
    { agent: 'self_awareness', action: 'Aggregate correction patterns across all proposals. Identify recurring edits that indicate a systemic issue. Recommend the single most impactful change to reduce future edit distance.', type: 'react', tier: 2 }
  ],

  'proposal.exported': [
    { agent: 'quality_gate', action: 'Final pre-submission check', type: 'api_call', endpoint: '/api/quality-gate', method: 'GET', queryKey: 'opportunity_id' }
  ],

  'proposal.briefing_generated': [
    { agent: 'design_visual', action: 'Generate branded Word doc', type: 'signal' },
    { agent: 'executive_brief', action: 'Include in weekly digest for Lou/Larry', type: 'signal' }
  ],

  // ═══ OUTCOME CASCADES — the learning loop ═══
  'opportunity.outcome_recorded': [
    // TIER 1 — fire in parallel, each reads stores, writes findings back
    { agent: 'scanner_opi', action: 'Compare predicted OPI vs actual outcome. What factors were over/underweighted? Recommend specific model adjustments with expected impact. Update scoring weights in system_performance_log.', type: 'react' },
    { agent: 'financial_pricing', action: 'Compare estimated contract value vs actual award. Analyze pricing accuracy by method (staffing math vs comparable vs % federal). Store benchmark. What should the estimate have been and why?', type: 'react' },
    { agent: 'intelligence_engine', action: 'Extract and permanently store all competitor data: who bid, at what price, who won, why. What does this reveal about their strategy, pricing floor, strengths? Store in competitive_intelligence for every future bid against them.', type: 'react' },
    { agent: 'crm_relationship', action: 'What does this outcome mean for the agency relationship? Update contact strength to hot (won) or analyze gaps (lost). Which contacts helped or were missing? Recommend next outreach timing and approach.', type: 'react' },
    { agent: 'recruiting_bench', action: 'Who was on this bid? If won, flag as proven performers for this vertical. What staffing gaps hurt us if lost? Track recurring gaps across all outcomes — flag when same gap appears twice.', type: 'react' },
    { agent: 'research_analysis', action: 'How accurate was the competitive analysis? Did the identified competitors actually bid? Were the red flags real? What intelligence gaps caused surprises? Update research methodology for this agency/vertical type.', type: 'react' },
    { agent: 'winnability', action: 'How accurate was the GO/PWIN decision? What factors were overweighted or underweighted? If PWIN was 75% and we lost, what changed? Recommend specific PWIN model adjustments for this vertical.', type: 'react' },
    { agent: 'quality_gate', action: 'Review what the winning proposal likely had that ours lacked. What compliance items or evaluation criteria points were at risk? Update quality checklist for this RFP type and agency size.', type: 'react' },
    { agent: 'discovery', action: 'Which source produced this opportunity? Track win rate by source. If this was a win, increase keyword weight for similar terms. If loss with strong fit, analyze whether we found it early enough to build relationships.', type: 'react' },
    { agent: 'pipeline_scanner', action: 'Update monitoring rules based on this outcome. How long did this opportunity spend in each stage? Was the timeline realistic? Recommend stage duration benchmarks for this opportunity type.', type: 'react' },
    // TIER 2 — fire after tier 1, receive all tier 1 insights before thinking
    { agent: 'proposal_agent', action: 'Using all tier 1 findings: analyze what made this proposal win or lose at the section level. Which sections scored well, which were weak? Encode specific lessons — not generic advice — for future proposals in this vertical and agency type.', type: 'react', tier: 2 },
    { agent: 'content_engine', action: 'Using tier 1 findings: analyze language patterns in this outcome. If won, identify voice characteristics to reinforce. If lost, identify patterns to adjust. Update blocked phrases, preferred structures, active voice targets.', type: 'react', tier: 2 },
    { agent: 'brief_agent', action: 'Using all findings: what should the next briefing package for a similar opportunity include that this one lacked? Update briefing template for this agency type and vertical. What open items were never resolved?', type: 'react', tier: 2 },
    { agent: 'scraper_insights', action: 'Track this outcome against its source. What is the win rate from this source? Is this source producing quality opportunities or noise? Recommend keyword adjustments and source priority changes.', type: 'react', tier: 2 },
    { agent: 'knowledge_base', action: 'Which KB chunks were most relevant to this proposal? If won, elevate their relevance scores. Tag winning content patterns by vertical and agency type. What KB gaps hurt this bid?', type: 'react', tier: 2 },
    { agent: 'design_visual', action: 'Record which visual format and template was used. If won, tag as effective for this vertical/agency type. If lost, flag for review. Update visual format recommendations.', type: 'react', tier: 2 },
    { agent: 'self_awareness', action: 'Using ALL tier 1 and tier 2 findings: connect every dot. OPI accuracy trend, pricing accuracy trend, competitive pattern, relationship impact, proposal quality correlation, source ROI. Identify the single highest-leverage system improvement. Write it as a specific recommendation with expected impact.', type: 'react', tier: 2 },
    { agent: 'executive_brief', action: 'Include outcome in next weekly digest for Lou and Larry. One paragraph: what happened, financial impact, what we learned, what changes as a result.', type: 'signal' },
    { agent: 'dashboard', action: 'Refresh win/loss record and pipeline stats', type: 'signal' }
  ],

  'opportunity.won': [
    { agent: 'crm_relationship', action: 'Upgrade agency relationship to hot', type: 'data_update', table: 'opportunities', field: 'stage', value: 'won' },
    { agent: 'knowledge_base', action: 'Identify which KB chunks were used in this winning proposal. Elevate their relevance scores. Tag winning content patterns by vertical.', type: 'react' },
    { agent: 'executive_brief', action: 'Win alert to Lou/Larry', type: 'signal' }
  ],

  'opportunity.lost': [
    { agent: 'intelligence_engine', action: 'Research who won, at what price, and why. Store competitor win data permanently. Identify what HGI lacked and what would change the outcome next time.', type: 'react' },
    { agent: 'self_awareness', action: 'Analyze loss across all dimensions: proposal quality, pricing competitiveness, relationship gaps, staffing gaps, competitive positioning. Identify whether this is a one-time miss or a structural pattern. Recommend the single highest-leverage fix.', type: 'react', tier: 2 }
  ],

  // ═══ STAGE CHANGE CASCADES ═══
  'opportunity.stage_changed': [
    { agent: 'pipeline_scanner', action: 'Update monitoring priority', type: 'signal' },
    { agent: 'dashboard', action: 'Refresh pipeline visualization', type: 'signal' },
    { agent: 'executive_brief', action: 'Include stage changes in digest', type: 'signal' }
  ],

  // ═══ DISASTER CASCADES ═══
  'disaster.declared': [
    { agent: 'discovery', action: 'Monitor LaPAC and Central Bidding for related procurements', type: 'signal' },
    { agent: 'intelligence_engine', action: 'Research affected jurisdiction: existing contracts, incumbent contractors, audit findings, budget capacity, prior disaster history. Check competitive intelligence store for known competitors in this area. Produce strategic assessment.', type: 'react' },
    { agent: 'crm_relationship', action: 'Search relationship graph by geography for contacts in affected area. Assess which are decision-makers for disaster response. Recommend outreach priority and approach for each contact.', type: 'react' },
    { agent: 'content_engine', action: 'Draft personalized outreach letter for each affected jurisdiction. Reference specific HGI experience relevant to that jurisdiction. Use relationship context and competitive positioning from stores.', type: 'react', tier: 2 },
    { agent: 'executive_brief', action: 'Disaster alert to Lou/Larry', type: 'signal' }
  ],

  // ═══ KB CASCADES ═══
  'kb.document_processed': [
    { agent: 'self_awareness', action: 'Assess what this new document covers, what gaps it fills, what gaps remain across all 8 verticals. Report KB coverage status.', type: 'react', tier: 2 },
    { agent: 'proposal_agent', action: 'New content available for proposals', type: 'signal' },
    { agent: 'content_engine', action: 'Read the new document. Extract voice characteristics: active/passive ratio, sentence length, terminology patterns. Compare to existing HGI voice standards. Flag deviations and extract useful patterns.', type: 'react' }
  ],

  // ═══ SELF-AWARENESS CASCADES ═══
  'self_assess.completed': [
    { agent: 'dashboard', action: 'Update organism status panel', type: 'signal' },
    { agent: 'executive_brief', action: 'Include health score in weekly digest', type: 'signal' }
  ],

  'self_assess.recommendation_approved': [
    { agent: 'self_awareness', action: 'Record what was approved. Set monitoring criteria. Define what improvement looks like and the timeframe to check. If improvement does not materialize, flag that the root cause may be elsewhere.', type: 'react' }
  ],

  // ═══ SCRAPER CASCADES ═══
  'batch.completed': [
    { agent: 'scraper_insights', action: 'Update source health metrics', type: 'signal' },
    { agent: 'self_awareness', action: 'Analyze scraper yield trends over time. Detect degradation. Compare source ROI: GO-quality opportunities per source per month. Flag if any source health is declining.', type: 'react', tier: 2 }
  ],

  // ═══ QUALITY GATE CASCADES ═══
  'quality_gate.completed': [
    { agent: 'proposal_agent', action: 'Read the deficiency list. Determine how to fix each deficiency. Identify which are critical vs minor. Recommend specific rewrites or flag for Christopher.', type: 'react' },
    { agent: 'self_awareness', action: 'Analyze quality gate pass/fail patterns across all proposals. Identify most common failure types. Recommend systemic fix to reduce failures.', type: 'react', tier: 2 },
    { agent: 'pipeline_scanner', action: 'Block submission if FAIL status', type: 'signal' }
  ]
};


async function fireReact(r, eventType, payload, priorInsights) {
  var body = { agent: r.agent, event_type: eventType, action: r.action, opportunity_id: payload.opportunity_id || null, data: payload.data || null };
  if (priorInsights && priorInsights.length > 0) body.prior_insights = priorInsights;
  try {
    var resp = await fetch(BASE + '/api/agent-react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (resp.ok) {
      var result = await resp.json();
      return { agent: r.agent, action: r.action, status: 'completed', type: 'react', tier: r.tier || 1, analysis: result.analysis || '', downstream: result.downstream_insights || '', writes: result.store_updates || [] };
    }
    return { agent: r.agent, action: r.action, status: 'failed_' + resp.status, type: 'react', tier: r.tier || 1 };
  } catch(e) {
    return { agent: r.agent, action: r.action, status: 'error', type: 'react', tier: r.tier || 1, error: e.message };
  }
}

async function executeCascade(eventType, payload) {
  var reactions = CASCADE_MAP[eventType];
  if (!reactions || reactions.length === 0) return { event: eventType, cascades: 0, results: [] };

  var results = [];
  var immediate = [];
  var tier1 = [];
  var tier2 = [];

  // Sort reactions into buckets
  for (var i = 0; i < reactions.length; i++) {
    var r = reactions[i];
    if (r.condition && !r.condition(payload)) {
      results.push({ agent: r.agent, action: r.action, status: 'skipped_condition' });
      continue;
    }
    if (r.type === 'react') {
      if (r.tier === 2) { tier2.push(r); } else { tier1.push(r); }
    } else {
      immediate.push(r);
    }
  }

  // Phase 0: Execute immediate reactions (api_call, data_update, signal)
  for (var j = 0; j < immediate.length; j++) {
    var im = immediate[j];
    try {
      if (im.type === 'api_call' && im.endpoint) {
        var url = BASE + im.endpoint;
        if (im.method === 'GET' && im.queryKey && payload.opportunity_id) {
          url += '?' + im.queryKey + '=' + encodeURIComponent(payload.opportunity_id);
          fetch(url).catch(function() {});
        } else if (im.method === 'POST') {
          var body = {};
          if (im.bodyKey && payload.opportunity_id) body[im.bodyKey] = payload.opportunity_id;
          if (payload.data) body.data = payload.data;
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function() {});
        }
        results.push({ agent: im.agent, action: im.action, status: 'triggered', type: 'api_call' });
      } else if (im.type === 'data_update' && im.table && im.field && payload.opportunity_id) {
        var ub = {}; ub[im.field] = im.value; ub.last_updated = new Date().toISOString();
        await fetch(SB + '/rest/v1/' + im.table + '?id=eq.' + encodeURIComponent(payload.opportunity_id), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(ub) });
        results.push({ agent: im.agent, action: im.action, status: 'updated', type: 'data_update' });
      } else {
        results.push({ agent: im.agent, action: im.action, status: 'signaled', type: 'signal' });
      }
    } catch(e) { results.push({ agent: im.agent, action: im.action, status: 'error', error: e.message }); }
  }

  // Phase 1: Fire all tier 1 react agents in parallel, AWAIT all
  var tier1Results = [];
  if (tier1.length > 0) {
    var tier1Promises = tier1.map(function(r) { return fireReact(r, eventType, payload, null); });
    tier1Results = await Promise.all(tier1Promises);
    for (var k = 0; k < tier1Results.length; k++) { results.push(tier1Results[k]); }
  }

  // Collect downstream insights from tier 1 for tier 2
  var priorInsights = [];
  for (var m = 0; m < tier1Results.length; m++) {
    if (tier1Results[m].downstream && tier1Results[m].status === 'completed') {
      priorInsights.push({ agent: tier1Results[m].agent, insight: tier1Results[m].downstream });
    }
  }

  // Phase 2: Fire all tier 2 react agents with prior insights, AWAIT all
  if (tier2.length > 0) {
    var tier2Promises = tier2.map(function(r) { return fireReact(r, eventType, payload, priorInsights); });
    var tier2Results = await Promise.all(tier2Promises);
    for (var n = 0; n < tier2Results.length; n++) { results.push(tier2Results[n]); }
  }

  return { event: eventType, cascades: results.length, tier1_count: tier1.length, tier2_count: tier2.length, prior_insights_passed: priorInsights.length, results: results };
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return the cascade map (for self-assess and dashboard to read)
  if (req.method === 'GET') {
    var mapSummary = {};
    Object.keys(CASCADE_MAP).forEach(function(evt) {
      mapSummary[evt] = CASCADE_MAP[evt].map(function(r) {
        return { agent: r.agent, action: r.action, type: r.type, has_condition: !!r.condition };
      });
    });
    return res.status(200).json({
      total_event_types: Object.keys(CASCADE_MAP).length,
      total_reactions: Object.keys(CASCADE_MAP).reduce(function(s, k) { return s + CASCADE_MAP[k].length; }, 0),
      map: mapSummary
    });
  }

  // POST — execute cascade for an event
  if (req.method === 'POST') {
    var body = req.body || {};
    if (!body.event_type) return res.status(400).json({ error: 'event_type required' });

    var result = await executeCascade(body.event_type, body);

    // Log cascade execution to hunt_runs
    try {
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          source: 'cascade',
          status: body.event_type + '|' + result.cascades + ' reactions',
          run_at: new Date().toISOString(),
          opportunities_found: 0,
          notes: JSON.stringify(result).slice(0, 2000)
        })
      });
    } catch(e) {}

    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'GET or POST only' });
}
