export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return all recorded outcomes for calibration
  if (req.method === 'GET') {
    try {
      var r = await fetch(SB + '/rest/v1/opportunities?outcome=not.is.null&select=id,title,agency,vertical,opi_score,outcome,outcome_notes,stage,capture_action,discovered_at,last_updated&order=last_updated.desc&limit=100', { headers: H });
      var data = await r.json();
      return res.status(200).json({ success: true, count: data.length, outcomes: data });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // POST — record an outcome
  if (req.method === 'POST') {
    var body = req.body || {};
    var opportunity_id = body.opportunity_id;
    var outcome = body.outcome; // 'won', 'lost', 'no_bid', 'cancelled'
    if (!opportunity_id || !outcome) return res.status(400).json({ error: 'opportunity_id and outcome required' });
    var validOutcomes = ['won', 'lost', 'no_bid', 'cancelled'];
    if (!validOutcomes.includes(outcome)) return res.status(400).json({ error: 'outcome must be: won, lost, no_bid, or cancelled' });

    try {
      // Load opportunity for context
      var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id) + '&limit=1', { headers: H });
      var opps = await oppR.json();
      if (!opps || !opps.length) return res.status(404).json({ error: 'Opportunity not found' });
      var opp = opps[0];

      // Build outcome record
      var outcomeNotes = {
        outcome: outcome,
        recorded_at: new Date().toISOString(),
        winner_name: body.winner_name || null,
        winner_amount: body.winner_amount || null,
        hgi_bid_amount: body.hgi_bid_amount || null,
        price_gap: (body.winner_amount && body.hgi_bid_amount) ? (Number(body.hgi_bid_amount) - Number(body.winner_amount)) : null,
        notes: body.notes || null,
        opi_at_decision: opp.opi_score || null,
        pwin_at_decision: body.pwin_at_decision || null
      };

      // Status map
      var statusMap = { won: 'won', lost: 'lost', no_bid: 'no_bid', cancelled: 'filtered' };
      var stageMap = { won: 'won', lost: 'lost', no_bid: 'no_bid', cancelled: 'cancelled' };

      // Update opportunity record
      await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id), {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          outcome: outcome,
          outcome_notes: JSON.stringify(outcomeNotes),
          status: statusMap[outcome],
          stage: stageMap[outcome],
          last_updated: new Date().toISOString()
        })
      });

      // Fire event
      var eventType = outcome === 'won' ? 'opportunity.won' : 'opportunity.lost';
      try {
        await fetch('https://hgi-capture-system.vercel.app/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: eventType,
            opportunity_id: opportunity_id,
            opportunity_title: opp.title,
            agency: opp.agency,
            source_module: 'outcome',
            data: outcomeNotes
          })
        });
      } catch(e) {}

      // Log to hunt_runs
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          source: 'outcome',
          status: outcome + '|opi:' + (opp.opi_score||0) + '|agency:' + (opp.agency||'').slice(0,30),
          run_at: new Date().toISOString(),
          opportunities_found: 0,
          notes: JSON.stringify({ opportunity_id, title: opp.title.slice(0,80), outcome, winner: body.winner_name||null })
        })
      });

      return res.status(200).json({
        success: true,
        opportunity_id,
        title: opp.title,
        agency: opp.agency,
        outcome,
        opi_at_decision: opp.opi_score,
        recorded_at: outcomeNotes.recorded_at
      });

    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}