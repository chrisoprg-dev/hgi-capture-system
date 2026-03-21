export const config = { maxDuration: 30 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

async function loadTable(table, limit, order) {
  try {
    var r = await fetch(SB + '/rest/v1/' + table + '?select=*&order=' + (order || 'created_at.desc') + '&limit=' + (limit || 50), { headers: H });
    if (r.ok) return await r.json();
    return [];
  } catch(e) { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');

  var ci = await loadTable('competitive_intelligence', 50);
  var rg = await loadTable('relationship_graph', 50);
  var sp = await loadTable('system_performance_log', 50);
  var reactions = await loadTable('hunt_runs', 30, 'id.desc');
  var agentReactions = reactions.filter(function(r) { return r.source && r.source.indexOf('react:') === 0; });

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HGI Organism Intelligence</title>';
  html += '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;background:#0a0e17;color:#e0e0e0;padding:16px;line-height:1.5}';
  html += 'h1{color:#c9a227;font-size:22px;margin-bottom:16px;border-bottom:2px solid #c9a227;padding-bottom:8px}';
  html += 'h2{color:#c9a227;font-size:17px;margin:20px 0 10px;padding:8px 12px;background:#141a2a;border-left:3px solid #c9a227;border-radius:4px}';
  html += '.count{color:#888;font-size:13px;margin-left:8px}';
  html += '.card{background:#141a2a;border:1px solid #1e2a3a;border-radius:8px;padding:12px;margin-bottom:10px}';
  html += '.agent{color:#5b9bd5;font-weight:600;font-size:13px}';
  html += '.label{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.value{color:#e0e0e0;font-size:13px;margin-bottom:6px}';
  html += '.strength-strong,.strength-hot{color:#4caf50;font-weight:700}';
  html += '.strength-warm{color:#ff9800;font-weight:700}';
  html += '.strength-cold,.strength-none{color:#f44336}';
  html += '.time{color:#666;font-size:11px}';
  html += '.insight{background:#1a2332;border-left:3px solid #5b9bd5;padding:8px 12px;margin:6px 0;font-size:13px;border-radius:0 4px 4px 0}';
  html += '.metric{display:inline-block;background:#1a2332;padding:3px 8px;border-radius:12px;font-size:12px;margin:2px 4px 2px 0}';
  html += 'details{margin-bottom:6px}summary{cursor:pointer;color:#5b9bd5;font-size:13px}';
  html += '</style></head><body>';

  html += '<h1>HGI Organism Intelligence — Live Brain</h1>';
  html += '<p style="color:#888;font-size:13px;margin-bottom:16px">What the 20 agents have learned. Every record here was produced by Claude-powered agents analyzing real opportunities. This is the shared memory that makes the 50th opportunity smarter than the 1st.</p>';

  // RELATIONSHIP GRAPH
  html += '<h2>Relationship Graph <span class="count">' + rg.length + ' contacts</span></h2>';
  for (var i = 0; i < rg.length; i++) {
    var c = rg[i];
    var strengthClass = 'strength-' + (c.relationship_strength || 'none');
    html += '<div class="card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center"><strong>' + (c.contact_name || 'Unknown') + '</strong><span class="' + strengthClass + '">' + (c.relationship_strength || 'none').toUpperCase() + '</span></div>';
    html += '<div class="value">' + (c.title || '') + (c.organization ? ' — ' + c.organization : '') + '</div>';
    if (c.email) html += '<div class="value" style="font-size:12px">' + c.email + (c.phone ? ' | ' + c.phone : '') + '</div>';
    if (c.notes) html += '<div class="insight">' + c.notes + '</div>';
    if (c.connected_orgs) html += '<div class="label">Connected to:</div><div class="value">' + c.connected_orgs + '</div>';
    html += '<div class="time">' + (c.source_agent || '') + ' | ' + (c.created_at || '').slice(0, 16) + '</div>';
    html += '</div>';
  }
  if (rg.length === 0) html += '<div class="card">No contacts yet. Contacts are added when agents process opportunities and outcomes.</div>';

  // COMPETITIVE INTELLIGENCE
  html += '<h2>Competitive Intelligence <span class="count">' + ci.length + ' entries</span></h2>';
  for (var j = 0; j < ci.length; j++) {
    var e = ci[j];
    html += '<div class="card">';
    html += '<div style="display:flex;justify-content:space-between"><strong>' + (e.competitor_name || 'Unknown') + '</strong><span class="metric">' + (e.vertical || '') + '</span></div>';
    html += '<div class="value">' + (e.agency || '') + (e.contract_value ? ' | ' + e.contract_value : '') + (e.outcome ? ' | ' + e.outcome : '') + '</div>';
    if (e.strengths) html += '<div class="label">Strengths:</div><div class="value" style="font-size:12px">' + e.strengths + '</div>';
    if (e.weaknesses) html += '<div class="label">Weaknesses:</div><div class="value" style="font-size:12px">' + e.weaknesses + '</div>';
    if (e.strategic_notes) html += '<div class="insight">' + e.strategic_notes + '</div>';
    html += '<div class="time">' + (e.source_agent || '') + ' | ' + (e.created_at || '').slice(0, 16) + '</div>';
    html += '</div>';
  }
  if (ci.length === 0) html += '<div class="card">No competitive intelligence yet.</div>';

  // SYSTEM PERFORMANCE LOG
  html += '<h2>System Performance Log <span class="count">' + sp.length + ' entries</span></h2>';
  for (var k = 0; k < sp.length; k++) {
    var s = sp[k];
    html += '<div class="card">';
    html += '<span class="agent">' + (s.source_agent || s.agent || '') + '</span>';
    html += ' <span class="metric">' + (s.metric_type || '') + '</span>';
    if (s.metric_value) html += ' <span class="metric" style="background:#2a1a1a;color:#ff9800">' + s.metric_value + '</span>';
    if (s.details) html += '<div class="insight">' + s.details + '</div>';
    html += '<div class="time">' + (s.event_type || '') + ' | ' + (s.created_at || '').slice(0, 16) + '</div>';
    html += '</div>';
  }
  if (sp.length === 0) html += '<div class="card">No performance data yet.</div>';

  // RECENT AGENT REACTIONS
  html += '<h2>Recent Agent Reactions <span class="count">' + agentReactions.length + ' reactions</span></h2>';
  for (var m = 0; m < Math.min(agentReactions.length, 20); m++) {
    var ar = agentReactions[m];
    var parsed = null;
    try { parsed = JSON.parse(ar.notes || '{}'); } catch(e) {}
    html += '<div class="card">';
    html += '<span class="agent">' + (ar.source || '').replace('react:', '') + '</span>';
    html += ' <span class="time">' + (ar.run_at || '').slice(0, 19) + '</span>';
    if (parsed && parsed.analysis) html += '<div class="insight">' + parsed.analysis + '</div>';
    if (parsed && parsed.downstream) html += '<div style="font-size:12px;color:#5b9bd5;margin-top:4px">Downstream: ' + parsed.downstream + '</div>';
    html += '</div>';
  }

  html += '<div style="margin-top:30px;padding:12px;background:#141a2a;border-radius:8px;text-align:center;color:#666;font-size:12px">';
  html += 'HGI Capture System — Living Organism Intelligence | ' + new Date().toISOString().slice(0, 19) + ' UTC';
  html += '</div></body></html>';

  return res.status(200).send(html);
}