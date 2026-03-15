export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

// Event types that modules broadcast:
// opportunity.discovered, opportunity.scored, opportunity.researched, 
// opportunity.winnability_run, workflow.completed, proposal.section_drafted,
// proposal.compliance_scanned, proposal.exported, opportunity.stage_changed,
// opportunity.submitted, opportunity.won, opportunity.lost,
// contact.logged, disaster.declared, batch.completed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    // Broadcast an event from any module
    const { event_type, opportunity_id, opportunity_title, agency, data, source_module } = req.body || {};
    if (!event_type) return res.status(400).json({ error: 'event_type required' });

    try {
      // Store event in hunt_runs table (reusing existing infrastructure)
      // source = event type, status = source module, opportunities_found = 0
      // We use the notes concept via a JSON payload in a text field if available
      const record = {
        source: 'event:' + event_type,
        status: source_module || 'system',
        run_at: new Date().toISOString(),
        opportunities_found: 0
      };

      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify(record)
      });

      // Also update the opportunity record with the event timestamp if opportunity_id provided
      if (opportunity_id) {
        const updateMap = {
          'workflow.completed': { status: 'active', last_updated: new Date().toISOString() },
          'proposal.section_drafted': { last_updated: new Date().toISOString() },
          'opportunity.stage_changed': { last_updated: new Date().toISOString() },
          'opportunity.won': { status: 'won', last_updated: new Date().toISOString() },
          'opportunity.lost': { status: 'lost', last_updated: new Date().toISOString() },
          'proposal.exported': { last_updated: new Date().toISOString() }
        };
        const update = updateMap[event_type];
        if (update) {
          await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id), {
            method: 'PATCH',
            headers: H,
            body: JSON.stringify(update)
          });
        }
      }

      return res.status(200).json({ success: true, event_type });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    // Return recent events for the intelligence engine to read
    const { limit = 50 } = req.query;
    try {
      const r = await fetch(SB + '/rest/v1/hunt_runs?source=like.event:*&order=run_at.desc&limit=' + limit, { headers: H });
      const data = await r.json();
      return res.status(200).json(data.map(e => ({
        event_type: (e.source || '').replace('event:', ''),
        source_module: e.status,
        timestamp: e.run_at
      })));
    } catch(e) {
      return res.status(200).json([]);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}