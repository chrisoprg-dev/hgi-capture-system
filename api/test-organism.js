export const config = { maxDuration: 60 };
var BASE = 'https://hgi-capture-system.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var OPP_ID = 'manualtest-manual-htha-2026-03-04-001';
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
    return res.status(200).json({ test: 'outcome_cascade_v2', fired_at: new Date().toISOString(), cascade: result, next: 'Wait 90 sec then check stores' });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}