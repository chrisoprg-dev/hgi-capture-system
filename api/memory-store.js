export const config = { maxDuration: 30 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
var DOLLAR = String.fromCharCode(36);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — check table status and return setup SQL if needed
  if (req.method === 'GET') {
    try {
      var check = await fetch(SB + '/rest/v1/organism_memory?select=id&limit=1', { headers: { apikey: SK, Authorization: 'Bearer ' + SK } });
      if (check.ok) {
        var rows = await check.json();
        // Count total
        var countR = await fetch(SB + '/rest/v1/organism_memory?select=id', { headers: { apikey: SK, Authorization: 'Bearer ' + SK, Prefer: 'count=exact', Range: '0-0' } });
        var total = countR.headers.get('content-range');
        return res.status(200).json({ status: 'ready', table: 'organism_memory', total_memories: total || 'unknown' });
      }
      return res.status(200).json({
        status: 'table_not_found',
        setup_sql: 'CREATE TABLE organism_memory (id text PRIMARY KEY, agent text NOT NULL, opportunity_id text, entity_tags text, observation text NOT NULL, memory_type text DEFAULT \'observation\', created_at timestamptz DEFAULT now()); ALTER TABLE organism_memory ENABLE ROW LEVEL SECURITY; CREATE POLICY "Allow all" ON organism_memory FOR ALL USING (true) WITH CHECK (true); CREATE INDEX idx_om_agent ON organism_memory(agent); CREATE INDEX idx_om_opp ON organism_memory(opportunity_id); CREATE INDEX idx_om_type ON organism_memory(memory_type); CREATE INDEX idx_om_created ON organism_memory(created_at DESC);',
        instructions: 'Go to Supabase Dashboard > SQL Editor > paste the SQL above > Run. Then hit this endpoint again to verify.'
      });
    } catch(e) {
      return res.status(500).json({ status: 'error', error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

  // POST — write a memory
  var body = req.body || {};
  var agent = body.agent;
  var observation = body.observation;

  if (!agent || !observation) return res.status(400).json({ error: 'agent and observation required' });

  var record = {
    id: 'om-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    agent: agent,
    opportunity_id: body.opportunity_id || null,
    entity_tags: body.entity_tags ? (typeof body.entity_tags === 'string' ? body.entity_tags : JSON.stringify(body.entity_tags)) : null,
    observation: observation,
    memory_type: body.memory_type || 'observation',
    created_at: new Date().toISOString()
  };

  try {
    var wr = await fetch(SB + '/rest/v1/organism_memory', {
      method: 'POST', headers: H, body: JSON.stringify(record)
    });
    if (!wr.ok) {
      var errText = await wr.text();
      if (wr.status === 404 || errText.includes('does not exist')) {
        return res.status(200).json({
          status: 'table_not_found',
          setup_sql: 'CREATE TABLE organism_memory (id text PRIMARY KEY, agent text NOT NULL, opportunity_id text, entity_tags text, observation text NOT NULL, memory_type text DEFAULT \'observation\', created_at timestamptz DEFAULT now()); ALTER TABLE organism_memory ENABLE ROW LEVEL SECURITY; CREATE POLICY "Allow all" ON organism_memory FOR ALL USING (true) WITH CHECK (true); CREATE INDEX idx_om_agent ON organism_memory(agent); CREATE INDEX idx_om_opp ON organism_memory(opportunity_id); CREATE INDEX idx_om_type ON organism_memory(memory_type); CREATE INDEX idx_om_created ON organism_memory(created_at DESC);',
          instructions: 'Create the table first. Go to Supabase Dashboard > SQL Editor > paste SQL > Run.'
        });
      }
      return res.status(500).json({ status: 'write_failed', error: errText.slice(0, 200) });
    }
    return res.status(200).json({ status: 'stored', id: record.id, agent: agent, memory_type: record.memory_type, observation_length: observation.length });
  } catch(e) {
    return res.status(500).json({ status: 'error', error: e.message });
  }
}