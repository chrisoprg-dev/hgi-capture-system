export const config = { maxDuration: 300 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

async function sbGet(path) {
  try {
    const r = await fetch(SB + path, { headers: H });
    if (!r.ok) return [];
    return await r.json();
  } catch(e) { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'GET' ? {} : (req.body || {});
  const trigger = body.trigger || (req.method === 'GET' ? 'manual-browser' : 'manual');
  const results = { trigger, started_at: new Date().toISOString(), decision_points: [], errors: [] };

  const [rawOpps, memories, pipelineAll, recentRuns] = await Promise.all([
    sbGet('/rest/v1/opportunities?opi_score=gte.65&status=in.(active,pursuing,proposal)&select=id,title,agency,vertical,state,opi_score,due_date,stage,scope_analysis,financial_analysis,research_brief,capture_action,staffing_plan,estimated_value,source_url&order=opi_score.desc&limit=25'),
    sbGet('/rest/v1/organism_memory?order=created_at.desc&limit=60'),
    sbGet('/rest/v1/opportunities?select=status,opi_score,vertical,stage&limit=200'),
    sbGet('/rest/v1/hunt_runs?order=run_at.desc&limit=20')
  ]);

  results.opps_surveyed = rawOpps.length;
  results.memories_loaded = memories.length;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const oppProfiles = rawOpps.map(function(opp) {
    const daysUntilDue = opp.due_date ? Math.ceil((new Date(opp.due_date) - today) / 86400000) : null;
    const gaps = [];
    if ((opp.scope_analysis || '').length < 100) gaps.push('NO_SCOPE');
    if ((opp.financial_analysis || '').length < 100) gaps.push('NO_FINANCIAL');
    if ((opp.research_brief || '').length < 100) gaps.push('NO_RESEARCH');
    if ((opp.capture_action || '').length < 50) gaps.push('NO_WINNABILITY');
    if ((opp.staffing_plan || '').length < 200) gaps.push('NO_BRIEFING');
    return {
      id: opp.id,
      title: opp.title,
      agency: opp.agency,
      vertical: opp.vertical || 'unknown',
      state: opp.state || 'LA',
      opi: opp.opi_score,
      stage: opp.stage || 'identified',
      due_date: opp.due_date || null,
      days_until_due: daysUntilDue,
      estimated_value: opp.estimated_value || null,
      gaps: gaps,
      analysis_complete: gaps.length === 0
    };
  });

  const stats = {
    total: pipelineAll.length,
    active: pipelineAll.filter(function(o) { return o.status === 'active'; }).length,
    tier1: pipelineAll.filter(function(o) { return (o.opi_score || 0) >= 75; }).length,
    no_bid: pipelineAll.filter(function(o) { return o.status === 'no_bid'; }).length
  };

  const regularMemories = memories.filter(function(m) { return m.memory_type !== 'decision_point'; });
  const priorDecisions = memories.filter(function(m) { return m.memory_type === 'decision_point'; }).slice(0, 6);

  const memoryDigest = regularMemories.slice(0, 35).map(function(m) {
    return '[' + (m.agent || 'unknown') + ' | ' + (m.memory_type || 'obs') + ' | ' + (m.created_at || '').slice(0, 10) + ']:\n' + (m.observation || '').slice(0, 500);
  }).join('\n\n---\n\n');

  const priorDecisionDigest = priorDecisions.map(function(m) {
    return '[PRIOR DECISION | ' + (m.created_at || '').slice(0, 10) + ']:\n' + (m.observation || '').slice(0, 300);
  }).join('\n\n---\n\n');

  const scraperRuns = recentRuns.filter(function(r) { return r.source === 'hunt' || r.source === 'apify'; });
  const orchRuns = recentRuns.filter(function(r) { return r.source === 'orchestrator'; });
  const thinkRuns = recentRuns.filter(function(r) { return r.source === 'organism_think'; });

  const urgentOpps = oppProfiles.filter(function(o) { return o.days_until_due !== null && o.days_until_due <= 21; });
  const unanalyzed = oppProfiles.filter(function(o) { return o.gaps.length > 0; });
  const fullyDone = oppProfiles.filter(function(o) { return o.analysis_complete; });

  const prompt =
    'You are the HGI Autonomous Intelligence Engine. You have full situational awareness of HGI Global\'s entire capture system.\n\n' +
    'TODAY: ' + todayStr + ' | TRIGGER: ' + trigger + '\n\n' +
    '======= PIPELINE SURVEY (' + oppProfiles.length + ' opportunities OPI 65+) =======\n\n' +
    'URGENT — DEADLINE WITHIN 21 DAYS (' + urgentOpps.length + '):\n' +
    (urgentOpps.length ? urgentOpps.map(function(o) {
      return '* [ID:' + o.id + '] ' + o.title + ' | ' + o.agency + ' | Due: ' + (o.due_date || 'TBD') + ' (' + o.days_until_due + ' days) | OPI: ' + o.opi + ' | Missing: ' + (o.gaps.join(', ') || 'NONE — fully analyzed');
    }).join('\n') : '(none)') + '\n\n' +
    'NEEDS ANALYSIS (' + unanalyzed.length + ' with gaps):\n' +
    (unanalyzed.length ? unanalyzed.map(function(o) {
      return '* [ID:' + o.id + '] ' + o.title + ' | ' + o.agency + ' | OPI: ' + o.opi + ' | Due: ' + (o.days_until_due !== null ? o.days_until_due + 'd' : 'TBD') + ' | Missing: ' + o.gaps.join(', ');
    }).join('\n') : '(none)') + '\n\n' +
    'FULLY ANALYZED (' + fullyDone.length + '):\n' +
    (fullyDone.length ? fullyDone.map(function(o) {
      return '* ' + o.title + ' | OPI: ' + o.opi + ' | Stage: ' + o.stage + ' | Due: ' + (o.days_until_due !== null ? o.days_until_due + 'd' : 'TBD');
    }).join('\n') : '(none)') + '\n\n' +
    '======= SYSTEM HEALTH =======\n' +
    'Pipeline: ' + stats.total + ' total | ' + stats.active + ' active | ' + stats.tier1 + ' Tier 1 | ' + stats.no_bid + ' no-bid\n' +
    'Scraper runs (recent): ' + scraperRuns.length + '\n' +
    'Orchestrator runs (recent): ' + orchRuns.length + '\n' +
    'Organism-think runs: ' + thinkRuns.length + ' | Last: ' + (thinkRuns[0] ? thinkRuns[0].run_at.slice(0, 16).replace('T', ' ') + ' UTC' : 'never') + '\n\n' +
    '======= ORGANISM INTELLIGENCE (' + regularMemories.length + ' accumulated memories) =======\n' +
    (memoryDigest || '(no intelligence recorded yet)') + '\n\n' +
    (priorDecisionDigest ? '======= PRIOR DECISIONS (avoid duplicating) =======\n' + priorDecisionDigest + '\n\n' : '') +
    '======= YOUR TASK =======\n\n' +
    'HGI CONTEXT: ~95-year-old minority-owned government program management firm. 8 verticals: Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management. NEVER a direct federal contract — all work through state/local agencies. Confirmed past performance: Road Home $67M direct/$13B+ program, Restore LA $42.3M, TPSD $2.96M (completed 2022-2025), BP GCCF $1.65M. HTHA submitted Mar 19 awaiting award result. St. George disaster MSA due April 24 (OPI 85, PWIN 75%). Data Call with Lou Resweber week of March 24 (win/loss history, rate card, KB docs, agency contacts).\n\n' +
    'Think like HGI\'s most senior strategist. Produce 6-10 DECISION POINTS. Prioritize what will most improve HGI\'s probability of winning contracts.\n\n' +
    'Types: URGENT_ACTION (24-72hr window), STRATEGIC (changes approach), GAP_FOUND (missing capability/data costing wins), SYSTEM_IMPROVEMENT (capture system upgrade), INTELLIGENCE (pattern/insight to know)\n\n' +
    'Rules: Cite opportunity IDs, agencies, dollar amounts, deadlines. No generic advice. Avoid repeating recent prior decisions unless still critical and unaddressed.\n\n' +
    'Return ONLY a valid JSON array:\n' +
    '[\n  {\n    "priority": "critical|high|medium|low",\n    "type": "URGENT_ACTION|STRATEGIC|GAP_FOUND|SYSTEM_IMPROVEMENT|INTELLIGENCE",\n    "title": "concise title max 10 words",\n    "detail": "2-3 sentences citing specific evidence",\n    "recommended_action": "one specific action Christopher should approve or do",\n    "expected_impact": "what changes if acted on",\n    "opportunity_id": "uuid or null"\n  }\n]';

  let rawDecisions = [];
  try {
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: 'You are the HGI autonomous intelligence engine. Produce specific, evidence-based decisions citing opportunity names, dollar amounts, and deadlines. Never generic. Return ONLY valid JSON array.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (cr.ok) {
      const cd = await cr.json();
      const text = (cd.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
      const match = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (match) {
        try {
          rawDecisions = JSON.parse(match[0]);
          results.claude_parsed = rawDecisions.length;
        } catch(pe) {
          results.errors.push('JSON parse failed: ' + pe.message);
          results.raw_preview = text.slice(0, 400);
        }
      } else {
        results.errors.push('No JSON array in Claude response');
        results.raw_preview = text.slice(0, 400);
      }
    } else {
      results.errors.push('Claude API status: ' + cr.status);
    }
  } catch(e) {
    results.errors.push('Claude call failed: ' + e.message);
  }

  for (var i = 0; i < rawDecisions.length; i++) {
    const dp = rawDecisions[i];
    const observation =
      'PRIORITY: ' + (dp.priority || 'medium') + '\n\n' +
      'TYPE: ' + (dp.type || 'INTELLIGENCE') + '\n\n' +
      'TITLE: ' + (dp.title || '') + '\n\n' +
      'DETAIL: ' + (dp.detail || '') + '\n\n' +
      'RECOMMENDED_ACTION: ' + (dp.recommended_action || '') + '\n\n' +
      'EXPECTED_IMPACT: ' + (dp.expected_impact || '');
    try {
      await fetch(SB + '/rest/v1/organism_memory', {
        method: 'POST',
        headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({
          id: 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          agent: 'organism_think',
          opportunity_id: dp.opportunity_id || null,
          entity_tags: 'decision_point,' + (dp.priority || 'medium') + ',' + (dp.type || 'INTELLIGENCE'),
          observation: observation,
          memory_type: 'decision_point',
          created_at: new Date().toISOString()
        })
      });
      results.decision_points.push({
        priority: dp.priority || 'medium',
        type: dp.type || 'INTELLIGENCE',
        title: dp.title || 'Decision ' + (i + 1),
        recommended_action: (dp.recommended_action || '').slice(0, 200)
      });
    } catch(e) {
      results.errors.push('Store failed for decision ' + i + ': ' + e.message);
    }
  }

  try {
    await fetch(SB + '/rest/v1/hunt_runs', {
      method: 'POST',
      headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        source: 'organism_think',
        status: 'completed | ' + results.decision_points.length + ' decisions stored | ' + results.opps_surveyed + ' opps surveyed | ' + results.memories_loaded + ' memories read',
        run_at: new Date().toISOString(),
        opportunities_found: 0
      })
    });
  } catch(e) {}

  results.completed_at = new Date().toISOString();
  results.total_stored = results.decision_points.length;
  return res.status(200).json(results);
}