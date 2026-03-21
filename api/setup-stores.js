export const config = { maxDuration: 30 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

var TABLES = {
  competitive_intelligence: 'CREATE TABLE IF NOT EXISTS competitive_intelligence (id text PRIMARY KEY, competitor_name text, agency text, opportunity_id text, contract_value text, outcome text, bid_price text, strengths text, weaknesses text, strategic_notes text, vertical text, source_agent text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());',
  relationship_graph: 'CREATE TABLE IF NOT EXISTS relationship_graph (id text PRIMARY KEY, contact_name text, title text, organization text, email text, phone text, relationship_strength text DEFAULT \'none\', last_contact text, notes text, connected_orgs text, source_agent text, opportunity_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());',
  system_performance_log: 'CREATE TABLE IF NOT EXISTS system_performance_log (id text PRIMARY KEY, agent text, event_type text, metric_type text, metric_value text, details text, opportunity_id text, source_agent text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());'
};

async function tryCreateTable(tableName, sql) {
  // Method 1: Try RPC exec_sql (some Supabase projects have this)
  try {
    var r = await fetch(SB + '/rest/v1/rpc/exec_sql', {
      method: 'POST', headers: H,
      body: JSON.stringify({ sql: sql })
    });
    if (r.ok) return { method: 'rpc_exec_sql', status: 'created' };
  } catch(e) {}

  // Method 2: Try inserting a test row to see if table exists
  try {
    var r2 = await fetch(SB + '/rest/v1/' + tableName + '?select=id&limit=1', { headers: H });
    if (r2.ok) return { method: 'already_exists', status: 'exists' };
    if (r2.status === 404) return { method: 'none', status: 'needs_manual_creation' };
    return { method: 'none', status: 'check_failed_' + r2.status };
  } catch(e) {
    return { method: 'none', status: 'needs_manual_creation' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var results = {};
  var allExist = true;
  var tableNames = Object.keys(TABLES);

  for (var i = 0; i < tableNames.length; i++) {
    var name = tableNames[i];
    results[name] = await tryCreateTable(name, TABLES[name]);
    if (results[name].status !== 'exists' && results[name].status !== 'created') allExist = false;
  }

  if (allExist) {
    return res.status(200).json({ success: true, message: 'All 3 organism stores are ready', results: results });
  }

  // Return SQL for manual creation
  return res.status(200).json({
    success: false,
    message: 'Tables need manual creation in Supabase Dashboard > SQL Editor. Run each statement below.',
    results: results,
    manual_sql: Object.keys(TABLES).map(function(t) { return '-- ' + t + '\n' + TABLES[t]; }).join('\n\n'),
    instructions: 'Go to supabase.com > project mfvfbeyjpwllndeuhldi > SQL Editor > paste all SQL > Run. Then hit this endpoint again to verify.'
  });
}