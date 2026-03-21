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

      // ── EVENT SUBSCRIBERS ────────────────────────────────────────────
      // When specific events fire, trigger downstream actions automatically
      const BASE = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://hgi-capture-system.vercel.app';

      const subscribers = {
        'opportunity.tier1_discovered': async (payload) => {
          // Tier 1 discovered → send notification
          try {
            await fetch(BASE + '/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'tier1_alert',
                title: payload.opportunity_title || 'New Tier 1 Opportunity',
                agency: payload.agency || '',
                opportunity_id: payload.opportunity_id || '',
                opi_score: payload.data?.opi_score || 0,
                vertical: payload.data?.vertical || '',
                urgency: payload.data?.urgency || ''
              })
            });
          } catch(e) { console.warn('Notify subscriber failed:', e.message); }
        },
        'opportunity.winnability_scored': async (payload) => {
          // Winnability scored with GO recommendation → notify
          if (payload.data?.recommendation === 'GO' || payload.data?.recommendation === 'CONDITIONAL GO') {
            try {
              await fetch(BASE + '/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'go_decision',
                  title: payload.opportunity_title || 'GO Decision',
                  agency: payload.agency || '',
                  opportunity_id: payload.opportunity_id || '',
                  pwin: payload.data?.pwin || 0,
                  recommendation: payload.data?.recommendation || ''
                })
              });
            } catch(e) { console.warn('GO notify failed:', e.message); }
          }
        },
        'opportunity.stage_changed': async (payload) => {
          // Stage change → notify if moving to proposal or submitted
          const stage = payload.data?.new_stage;
          if (stage === 'proposal' || stage === 'submitted') {
            try {
              await fetch(BASE + '/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'stage_change',
                  title: payload.opportunity_title || 'Stage Change',
                  agency: payload.agency || '',
                  stage: stage,
                  opportunity_id: payload.opportunity_id || ''
                })
              });
            } catch(e) { console.warn('Stage notify failed:', e.message); }
          }
        },
        'batch.completed': async (payload) => {
          // Batch of opportunities completed → send summary notification
          const count = payload.data?.new_count || 0;
          const tier1Count = payload.data?.tier1_count || 0;
          if (tier1Count > 0) {
            try {
              await fetch(BASE + '/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'batch_summary',
                  title: 'Scraper Batch Complete',
                  new_count: count,
                  tier1_count: tier1Count
                })
              });
            } catch(e) { console.warn('Batch notify failed:', e.message); }
          }
        }
      };

      // After storing the event, dispatch to subscribers
      const subscriber = subscribers[event_type];
      if (subscriber) {
        // Fire and forget — don't block the response
        subscriber({ event_type, opportunity_id, opportunity_title, agency, data, source_module }).catch(e => console.warn('Subscriber error:', e.message));
      }

      try { await fetch(BASE + '/api/cascade', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({event_type:event_type, opportunity_id:opportunity_id||null, opportunity_title:opportunity_title||null, agency:agency||null, data:data||null, source_module:source_module||null}) }).catch(function(){}); } catch(ce) {}
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