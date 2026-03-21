export const config = { maxDuration: 300 };
var BASE = 'https://hgi-capture-system.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var OPP_ID = 'manualtest-manual-htha-2026-03-04-001';
  var startTime = Date.now();
  try {
    var r = await fetch(BASE + '/api/cascade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'opportunity.outcome_recorded',
        opportunity_id: OPP_ID,
        opportunity_title: 'Houma Terrebonne Housing Authority Grant and Project Management Services',
        agency: 'Houma Terrebonne Housing Authority',
        data: { outcome: 'won', winner_name: 'HGI Global', hgi_bid_amount: '283000', opi_at_decision: 78 }
      })
    });
    var result = await r.json();
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return res.status(200).json({ test: 'tiered_cascade_v3', elapsed_seconds: elapsed, tier1_count: result.tier1_count, tier2_count: result.tier2_count, insights_passed: result.prior_insights_passed, total_reactions: result.cascades, results: result.results });
  } catch(e) { return res.status(500).json({ error: e.message, elapsed: ((Date.now() - startTime) / 1000).toFixed(1) }); }
}