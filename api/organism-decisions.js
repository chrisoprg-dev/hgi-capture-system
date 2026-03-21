export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE — dismiss a single decision
  if (req.method === 'DELETE') {
    var decId = (req.body || {}).id;
    if (!decId) return res.status(400).json({ error: 'id required' });
    try {
      await fetch(SB + '/rest/v1/organism_memory?id=eq.' + encodeURIComponent(decId), { method: 'DELETE', headers: H });
      return res.status(200).json({ dismissed: true, id: decId });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'GET or DELETE only' });

  try {
    const r = await fetch(SB + '/rest/v1/organism_memory?memory_type=eq.decision_point&order=created_at.desc&limit=20', { headers: H });
    if (!r.ok) return res.status(500).json({ error: 'DB error', status: r.status });
    const rows = await r.json();

    const decisions = rows.map(function(row) {
      const obs = row.observation || '';
      const get = function(key) {
        var regex = new RegExp(key + ':\\s*([\\s\\S]*?)(?=\\n\\n[A-Z_]+:|$)', 'i');
        var match = obs.match(regex);
        return match ? match[1].trim() : '';
      };
      var actionPayload = null;
      try { actionPayload = JSON.parse(get('ACTION_PAYLOAD')); } catch(e) {}
      return {
        id: row.id,
        priority: get('PRIORITY') || 'medium',
        type: get('TYPE') || 'OWNER_ACTION',
        title: get('TITLE') || 'Decision',
        detail: get('DETAIL') || '',
        recommended_action: get('RECOMMENDED_ACTION') || '',
        expected_impact: get('EXPECTED_IMPACT') || '',
        executable: get('EXECUTABLE') === 'true',
        action_endpoint: get('ACTION_ENDPOINT') !== 'null' ? get('ACTION_ENDPOINT') : null,
        action_payload: actionPayload,
        opportunity_id: row.opportunity_id || null,
        created_at: row.created_at,
        entity_tags: row.entity_tags || ''
      };
    });

    const lastThinkRun = rows.length > 0 ? rows[0].created_at : null;
    return res.status(200).json({ decisions: decisions, count: decisions.length, last_think_run: lastThinkRun });
  } catch(e) {
    return res.status(500).json({ error: e.message, decisions: [] });
  }
}