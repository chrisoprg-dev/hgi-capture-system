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

function makeId() {
  return 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
function getCSTDate() {
  // CST = UTC-6. Vercel runs UTC — offset so Claude sees Christopher's local date.
  return new Date(Date.now() - 6 * 3600000);
}
function getCSTDateStr() {
  return getCSTDate().toISOString().slice(0, 10);
}
function logCost(agent, model, inTok, outTok, endpoint) {
  var p = model.indexOf('sonnet') !== -1 ? { in: 0.000003, out: 0.000015 } : { in: 0.00000025, out: 0.00000125 };
  var cost = inTok * p.in + outTok * p.out;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), source: 'api_cost', status: JSON.stringify({ agent: agent, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: endpoint || 'organism-think' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE — dismiss a single decision
  if (req.method === 'DELETE') {
    var decId = (req.body || {}).id || (req.query && req.query.id);
    if (!decId) return res.status(400).json({ error: 'id required' });
    try {
      await fetch(SB + '/rest/v1/organism_memory?id=eq.' + encodeURIComponent(decId), { method: 'DELETE', headers: H });
      return res.status(200).json({ dismissed: true, id: decId });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  const body = req.method === 'GET' ? {} : (req.body || {});
  const trigger = body.trigger || (req.method === 'GET' ? 'manual-browser' : 'manual');
  const results = { trigger, started_at: new Date().toISOString(), decision_points: [], errors: [], skipped_dupes: 0 };

  // Load all existing undismissed decisions FIRST — dedup before generating
  const existingDecisions = await sbGet('/rest/v1/organism_memory?memory_type=eq.decision_point&order=created_at.desc&limit=30');
  const existingTitles = new Set(existingDecisions.map(function(m) {
    var titleMatch = (m.observation || '').match(/TITLE:\s*([^\n]+)/);
    return titleMatch ? titleMatch[1].trim().toLowerCase() : '';
  }).filter(Boolean));
  const existingTypes = new Set(existingDecisions.map(function(m) {
    var typeMatch = (m.observation || '').match(/TYPE:\s*([^\n]+)/);
    var titleMatch = (m.observation || '').match(/TITLE:\s*([^\n]+)/);
    return (typeMatch ? typeMatch[1].trim() : '') + '|' + (titleMatch ? titleMatch[1].trim().slice(0, 30).toLowerCase() : '');
  }).filter(Boolean));

  const [rawOpps, memories, pipelineAll, recentRuns] = await Promise.all([
    sbGet('/rest/v1/opportunities?opi_score=gte.65&status=in.(active,pursuing,proposal)&select=id,title,agency,vertical,state,opi_score,due_date,stage,scope_analysis,financial_analysis,research_brief,capture_action,staffing_plan,estimated_value,source_url&order=opi_score.desc&limit=25'),
    sbGet('/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=40'),
    sbGet('/rest/v1/opportunities?select=status,opi_score,vertical,stage&limit=200'),
    sbGet('/rest/v1/hunt_runs?order=run_at.desc&limit=20')
  ]);

  results.opps_surveyed = rawOpps.length;
  results.memories_loaded = memories.length;
  results.existing_decisions = existingDecisions.length;

  const today = getCSTDate();
  const todayStr = getCSTDateStr();

  const oppProfiles = rawOpps.map(function(opp) {
    const daysUntilDue = opp.due_date ? Math.ceil((new Date(opp.due_date) - today) / 86400000) : null;
    const gaps = [];
    if ((opp.scope_analysis || '').length < 100) gaps.push('NO_SCOPE');
    if ((opp.financial_analysis || '').length < 100) gaps.push('NO_FINANCIAL');
    if ((opp.research_brief || '').length < 100) gaps.push('NO_RESEARCH');
    if ((opp.capture_action || '').length < 50) gaps.push('NO_WINNABILITY');
    if ((opp.staffing_plan || '').length < 200) gaps.push('NO_BRIEFING');
    return { id: opp.id, title: opp.title, agency: opp.agency, vertical: opp.vertical || 'unknown', state: opp.state || 'LA', opi: opp.opi_score, stage: opp.stage || 'identified', due_date: opp.due_date || null, days_until_due: daysUntilDue, estimated_value: opp.estimated_value || null, gaps: gaps, analysis_complete: gaps.length === 0 };
  });

  const stats = {
    total: pipelineAll.length,
    active: pipelineAll.filter(function(o) { return o.status === 'active'; }).length,
    tier1: pipelineAll.filter(function(o) { return (o.opi_score || 0) >= 75; }).length,
    no_bid: pipelineAll.filter(function(o) { return o.status === 'no_bid'; }).length
  };

  const memoryDigest = memories.slice(0, 30).map(function(m) {
    return '[' + (m.agent || 'unknown') + ' | ' + (m.memory_type || 'obs') + ' | ' + (m.created_at || '').slice(0, 10) + ']:\n' + (m.observation || '').slice(0, 400);
  }).join('\n\n---\n\n');

  const scraperRuns = recentRuns.filter(function(r) { return r.source === 'hunt' || r.source === 'apify'; });
  const orchRuns = recentRuns.filter(function(r) { return r.source === 'orchestrator'; });

  const urgentOpps = oppProfiles.filter(function(o) { return o.days_until_due !== null && o.days_until_due <= 21; });
  const unanalyzed = oppProfiles.filter(function(o) { return o.gaps.length > 0; });
  const fullyDone = oppProfiles.filter(function(o) { return o.analysis_complete; });

  // Build an explicit ID lookup table so Claude can use real IDs in action_payload
  const oppIdTable = oppProfiles.map(function(o) {
    return 'ID: ' + o.id + ' | ' + o.title + ' | ' + o.agency;
  }).join('\n');

  const alreadyHave = existingDecisions.length > 0
    ? 'ALREADY PENDING (do NOT duplicate these — only add NEW decisions not already covered):\n' + existingDecisions.map(function(m) {
        var t = (m.observation || '').match(/TITLE:\s*([^\n]+)/);
        var tp = (m.observation || '').match(/TYPE:\s*([^\n]+)/);
        return '- [' + (tp ? tp[1].trim() : '?') + '] ' + (t ? t[1].trim() : '?');
      }).join('\n') + '\n\n'
    : '';

  const prompt =
    'You are the HGI Autonomous Intelligence Engine. Produce DECISION POINTS — not observations or suggestions. Each decision point must be something Christopher can ACT ON RIGHT NOW: approve a system action, make a call, or explicitly dismiss.\n\n' +
    'TODAY: ' + todayStr + ' | TRIGGER: ' + trigger + '\n\n' +
    alreadyHave +
    '======= PIPELINE (' + oppProfiles.length + ' active opps OPI 65+) =======\n\n' +
    'URGENT (<21 days):' + (urgentOpps.length ? '\n' + urgentOpps.map(function(o) { return '[ID:' + o.id + '] ' + o.title + ' | ' + o.agency + ' | Due: ' + o.due_date + ' (' + o.days_until_due + 'd) | OPI:' + o.opi + ' | Missing: ' + (o.gaps.join(',') || 'none'); }).join('\n') : ' none') + '\n\n' +
    'NEEDS ANALYSIS:' + (unanalyzed.length ? '\n' + unanalyzed.map(function(o) { return '[ID:' + o.id + '] ' + o.title + ' | OPI:' + o.opi + ' | Due:' + (o.days_until_due !== null ? o.days_until_due + 'd' : 'TBD') + ' | Missing:' + o.gaps.join(','); }).join('\n') : ' none') + '\n\n' +
    'ANALYZED:' + (fullyDone.length ? '\n' + fullyDone.map(function(o) { return o.title + ' | OPI:' + o.opi + ' | Stage:' + o.stage + ' | Due:' + (o.days_until_due !== null ? o.days_until_due + 'd' : 'TBD'); }).join('\n') : ' none') + '\n\n' +
    'Pipeline: ' + stats.total + ' total | ' + stats.active + ' active | ' + stats.tier1 + ' Tier 1 | Scraper runs: ' + scraperRuns.length + ' | Orchestrator runs: ' + orchRuns.length + '\n\n' +
    '======= ORGANISM INTELLIGENCE =======\n' + (memoryDigest || '(none yet)') + '\n\n' +
    '======= DECISION POINT RULES =======\n' +
    'HGI: 95yr minority-owned program management. Verticals: Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce/WIOA, Construction Mgmt, Program Admin, Housing/HUD, Grant Mgmt. NEVER a direct federal contract. Past performance: Road Home $67M/$13B+, Restore LA $42.3M, TPSD $2.96M (done 2022-2025), BP GCCF $1.65M. HTHA submitted Mar 19 awaiting award. St. George due Apr 24 (OPI 85, 75% PWIN). Jefferson Parish SOQ due Apr 9 (OPI 72). Data Call with Lou week of Mar 24.\n\n' +
    'DECISION TYPES and what they mean:\n' +
    '- APPROVE_ACTION: Christopher approves and the system executes (run orchestrator, trigger scraper, generate doc). Include executable=true and the action_endpoint to call.\n' +
    '- OWNER_ACTION: Requires a human to do something specific outside the system (call someone, send email, attend meeting). Include who and what exactly.\n' +
    '- APPROVE_BUILD: New system capability to approve building. Include estimated build time.\n\n' +
    'QUALITY RULES:\n' +
    '1. Every decision must name specific opportunity, agency, dollar amount, or deadline — never generic\n' +
    '2. APPROVE_ACTION decisions must have a real executable action (not just advice)\n' +
    '3. OWNER_ACTION must say exactly who does what and by when\n' +
    '4. Do NOT duplicate anything in the ALREADY PENDING list above\n' +
    '5. Produce only 4-6 decisions — quality over quantity\n\n' +
    'REAL OPPORTUNITY IDs — USE THESE EXACTLY in action_payload, do not guess or shorten:\n' + oppIdTable + '\n\n' +
    'Return ONLY valid JSON array:\n' +
    '[{\n  "priority": "critical|high|medium|low",\n  "type": "APPROVE_ACTION|OWNER_ACTION|APPROVE_BUILD",\n  "title": "max 10 words, specific",\n  "detail": "2 sentences, cite specific evidence (opp name, deadline, dollar amount)",\n  "recommended_action": "exact action — who does what, what system call, by when",\n  "expected_impact": "specific outcome if acted on",\n  "executable": true or false,\n  "action_endpoint": "/api/orchestrate or null",\n  "action_payload": {"opportunity_id": "uuid"} or null,\n  "opportunity_id": "uuid or null"\n}]';

  let rawDecisions = [];
  try {
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 3000, system: 'You are the HGI autonomous intelligence engine. Return ONLY valid JSON array. No markdown. Be ruthlessly specific — name people, opportunities, deadlines, dollar amounts. Never generic advice.', messages: [{ role: 'user', content: prompt }] })
    });
    if (cr.ok) {
      const cd = await cr.json();
      const text = (cd.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
      const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        try { rawDecisions = JSON.parse(match[0]); results.claude_parsed = rawDecisions.length; }
        catch(pe) { results.errors.push('JSON parse: ' + pe.message); results.raw_preview = text.slice(0, 400); }
      } else { results.errors.push('No JSON array found'); results.raw_preview = text.slice(0, 400); }
    } else { results.errors.push('Claude API: ' + cr.status); }
  } catch(e) { results.errors.push('Claude call: ' + e.message); }

  for (var i = 0; i < rawDecisions.length; i++) {
    const dp = rawDecisions[i];
    const titleKey = (dp.title || '').toLowerCase().slice(0, 40);
    const typeKey = (dp.type || '') + '|' + titleKey;
    // Dedup check — skip if title or type+title already pending
    if (existingTitles.has(titleKey) || existingTypes.has(typeKey)) {
      results.skipped_dupes++;
      continue;
    }
    const observation =
      'PRIORITY: ' + (dp.priority || 'medium') + '\n\n' +
      'TYPE: ' + (dp.type || 'OWNER_ACTION') + '\n\n' +
      'TITLE: ' + (dp.title || '') + '\n\n' +
      'DETAIL: ' + (dp.detail || '') + '\n\n' +
      'RECOMMENDED_ACTION: ' + (dp.recommended_action || '') + '\n\n' +
      'EXPECTED_IMPACT: ' + (dp.expected_impact || '') + '\n\n' +
      'EXECUTABLE: ' + (dp.executable ? 'true' : 'false') + '\n\n' +
      'ACTION_ENDPOINT: ' + (dp.action_endpoint || 'null') + '\n\n' +
      'ACTION_PAYLOAD: ' + JSON.stringify(dp.action_payload || null);
    try {
      const wr = await fetch(SB + '/rest/v1/organism_memory', {
        method: 'POST',
        headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ id: makeId(), agent: 'organism_think', opportunity_id: dp.opportunity_id || null, entity_tags: 'decision_point,' + (dp.priority || 'medium') + ',' + (dp.type || 'OWNER_ACTION'), observation: observation, memory_type: 'decision_point', created_at: new Date().toISOString() })
      });
      if (wr.ok) {
        results.decision_points.push({ priority: dp.priority, type: dp.type, title: dp.title, executable: dp.executable || false });
      } else {
        var errText = await wr.text();
        results.errors.push('DB write ' + i + ' failed ' + wr.status + ': ' + errText.slice(0, 150));
      }
    } catch(e) { results.errors.push('Store ' + i + ': ' + e.message); }
  }

  try {
    await fetch(SB + '/rest/v1/hunt_runs', {
      method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ id: 'hr-think-' + Date.now(), source: 'organism_think', status: results.decision_points.length + ' new decisions | ' + results.skipped_dupes + ' dupes skipped | ' + results.opps_surveyed + ' opps | ' + results.memories_loaded + ' memories', run_at: new Date().toISOString(), opportunities_found: 0 })
    });
  } catch(e) {}

  results.completed_at = new Date().toISOString();
  results.total_stored = results.decision_points.length;
  return res.status(200).json(results);
}