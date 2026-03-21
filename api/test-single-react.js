export const config = { maxDuration: 120 };
var BASE = 'https://hgi-capture-system.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var agent = (req.query && req.query.agent) || 'self_awareness';
  try {
    var r = await fetch(BASE + '/api/agent-react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agent,
        event_type: 'opportunity.outcome_recorded',
        action: 'Comprehensive outcome analysis. Connect dots across all stores. Identify single highest-leverage improvement.',
        opportunity_id: 'manualtest-manual-htha-2026-03-04-001',
        data: { outcome: 'won', winner_name: 'HGI Global', hgi_bid_amount: '283000', opi_at_decision: 78 }
      })
    });
    var result = await r.json();
    return res.status(200).json({ agent: agent, result: result });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}