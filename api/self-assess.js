export const config = { maxDuration: 60 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (req.query && req.query.ping === '1') return res.status(200).json({ status: 'ok', message: 'self-assess endpoint live' });

  try {
    var now = new Date();
    var sevenDaysAgo = new Date(now - 7*24*60*60*1000).toISOString();
    var thirtyDaysAgo = new Date(now - 30*24*60*60*1000).toISOString();

    // Pull all data in parallel
    var [activeOpps, allOutcomes, recentHunts, qualityGateRuns, kbDocs] = await Promise.all([
      fetch(SB + '/rest/v1/opportunities?status=eq.active&select=id,title,agency,vertical,opi_score,stage,kb_coverage_gaps,discovered_at,last_updated&order=opi_score.desc&limit=50', { headers: H }).then(r => r.json()).catch(() => []),
      fetch(SB + '/rest/v1/opportunities?outcome=not.is.null&select=id,title,agency,vertical,opi_score,outcome,outcome_notes&limit=100', { headers: H }).then(r => r.json()).catch(() => []),
      fetch(SB + '/rest/v1/hunt_runs?order=run_at.desc&limit=200', { headers: H }).then(r => r.json()).catch(() => []),
      fetch(SB + '/rest/v1/hunt_runs?source=eq.quality_gate&order=run_at.desc&limit=20', { headers: H }).then(r => r.json()).catch(() => []),
      fetch(SB + '/rest/v1/knowledge_docs?select=id,title,vertical,extracted&limit=50', { headers: H }).then(r => r.json()).catch(() => [])
    ]);

    // SCRAPER HEALTH
    var scraperHealth = {};
    var sources = ['apify_central_bidding', 'lapac', 'grants_gov', 'web_research', 'quality_gate', 'outcome', 'orchestrator'];
    sources.forEach(function(src) {
      var runs = recentHunts.filter(function(h) { return (h.source||'').includes(src); });
      var last7 = runs.filter(function(h) { return h.run_at > sevenDaysAgo; });
      scraperHealth[src] = { total_runs: runs.length, runs_last_7d: last7.length, last_run: runs[0] ? runs[0].run_at : null };
    });

    // PIPELINE HEALTH
    var verticalCounts = {};
    var stageCounts = {};
    var staleHighOpi = [];
    activeOpps.forEach(function(o) {
      verticalCounts[o.vertical||'unknown'] = (verticalCounts[o.vertical||'unknown']||0) + 1;
      stageCounts[o.stage||'identified'] = (stageCounts[o.stage||'identified']||0) + 1;
      var daysSince = Math.floor((now - new Date(o.last_updated)) / (1000*60*60*24));
      if ((o.opi_score||0) >= 70 && daysSince > 5) staleHighOpi.push({ title: o.title, opi: o.opi_score, days_stale: daysSince });
    });

    // OPI CALIBRATION (from recorded outcomes)
    var opiAccuracy = { total_with_outcomes: allOutcomes.length, wins: 0, losses: 0, avg_opi_wins: null, avg_opi_losses: null, calibration_note: 'Insufficient data — need more recorded outcomes' };
    if (allOutcomes.length > 0) {
      var wins = allOutcomes.filter(function(o) { return o.outcome === 'won'; });
      var losses = allOutcomes.filter(function(o) { return o.outcome === 'lost'; });
      opiAccuracy.wins = wins.length;
      opiAccuracy.losses = losses.length;
      if (wins.length > 0) opiAccuracy.avg_opi_wins = Math.round(wins.reduce(function(s,o) { return s+(o.opi_score||0); }, 0) / wins.length);
      if (losses.length > 0) opiAccuracy.avg_opi_losses = Math.round(losses.reduce(function(s,o) { return s+(o.opi_score||0); }, 0) / losses.length);
      if (wins.length + losses.length >= 3) opiAccuracy.calibration_note = 'Some data available — patterns emerging';
      if (wins.length + losses.length >= 10) opiAccuracy.calibration_note = 'Sufficient data for reliable calibration';
    }

    // KB GAPS (from active opps that have gap reports)
    var kbGaps = activeOpps.filter(function(o) { return o.kb_coverage_gaps && o.kb_coverage_gaps.includes('GAPS:'); }).map(function(o) { return { title: o.title, gap: o.kb_coverage_gaps }; });

    // QUALITY GATE SUMMARY
    var qgSummary = { runs: qualityGateRuns.length, fails: 0, conditionals: 0, passes: 0 };
    qualityGateRuns.forEach(function(r) {
      var s = (r.status||'').toLowerCase();
      if (s.includes('fail')) qgSummary.fails++;
      else if (s.includes('conditional')) qgSummary.conditionals++;
      else if (s.includes('pass')) qgSummary.passes++;
    });

    // BUILD PROMPT FOR SELF-ASSESSMENT
    var prompt = 'Generate a weekly self-assessment digest for the HGI Capture System. Be honest, specific, and directive. This is for Christopher Oney (President, HGI) to understand what the system is doing well and where it needs improvement.\n\nDATA AS OF ' + now.toISOString() + ':\n\n' +
      'PIPELINE: ' + activeOpps.length + ' active opportunities. Vertical mix: ' + JSON.stringify(verticalCounts) + '. Stage mix: ' + JSON.stringify(stageCounts) + '.\n\n' +
      'STALE HIGH-OPI (70+, no activity 5+ days): ' + JSON.stringify(staleHighOpi) + '\n\n' +
      'SCRAPER HEALTH: ' + JSON.stringify(scraperHealth) + '\n\n' +
      'OPI CALIBRATION: ' + JSON.stringify(opiAccuracy) + '\n\n' +
      'QUALITY GATE RUNS: ' + JSON.stringify(qgSummary) + '\n\n' +
      'KB GAP REPORTS: ' + kbGaps.length + ' active opps have KB gaps. Examples: ' + JSON.stringify(kbGaps.slice(0,3)) + '\n\n' +
      'KB DOCUMENTS: ' + kbDocs.length + ' total. Extracted: ' + kbDocs.filter(function(d){return d.extracted;}).length + '\n\n' +
      'Provide a structured self-assessment with these exact sections:\n\n' +
      '## SYSTEM HEALTH SCORE\nGive the system an overall score 1-10 with one sentence justification.\n\n' +
      '## WHAT IS WORKING\n3-5 specific things the system is doing well based on the data above.\n\n' +
      '## WHAT IS FAILING OR WEAK\n3-5 specific gaps, errors, or underperforming components. Be direct — do not sugarcoat.\n\n' +
      '## OPI CALIBRATION STATUS\nAssess whether OPI scores are likely to be accurate based on available data. What would improve calibration?\n\n' +
      '## KB COVERAGE ASSESSMENT\nWhat is the KB missing? What documents should be added? Which verticals are weak?\n\n' +
      '## TOP 3 IMPROVEMENT RECOMMENDATIONS\nThe 3 highest-leverage actions to improve system performance this week. Be specific and actionable.\n\n' +
      '## CHRISTOPHER ACTION ITEMS\nWhat does Christopher need to do that the system cannot do itself? (e.g. data call, API keys, outcome recording)';

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        system: 'You are the HGI Capture System self-awareness module. Your job is to honestly assess your own performance. Use the live data provided. Be specific — cite actual numbers from the data. Do not be generic. Flag real problems. The President needs accurate system intelligence, not flattery.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    var d = await r.json();
    var assessment = (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');

    // Log the run
    try {
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ source: 'self_assess', status: 'completed', run_at: new Date().toISOString(), opportunities_found: 0 })
      });
    } catch(e) {}

    return res.status(200).json({
      success: true,
      generated_at: now.toISOString(),
      data: { pipeline_active: activeOpps.length, outcomes_recorded: allOutcomes.length, stale_high_opi: staleHighOpi.length, kb_gaps: kbGaps.length, scraper_health: scraperHealth, opi_calibration: opiAccuracy, quality_gate_summary: qgSummary },
      assessment
    });

  } catch(e) { return res.status(500).json({ error: e.message }); }
}