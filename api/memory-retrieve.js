Create a new file: api/memory-retrieve.js

This is the organism's memory retrieval engine. Before every Claude call in the system, this endpoint is called to ask: "What does the organism know that is relevant to this context?" It uses the same Claude reranker pattern as knowledge-query.js — load candidates, have Claude select the most relevant, return as prompt injection text.

The file contents should be:

export const config = { maxDuration: 30 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
var DOLLAR = String.fromCharCode(36);

async function loadCandidates(opportunityId, agencyName, vertical, memoryType) {
  var candidates = [];
  var seen = new Set();

  // Strategy 1: Memories for this specific opportunity
  if (opportunityId) {
    try {
      var r1 = await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(opportunityId) + '&order=created_at.desc&limit=20', { headers: H });
      if (r1.ok) {
        var rows = await r1.json();
        for (var i = 0; i < rows.length; i++) { if (!seen.has(rows[i].id)) { candidates.push(rows[i]); seen.add(rows[i].id); } }
      }
    } catch(e) {}
  }

  // Strategy 2: Memories mentioning this agency in entity_tags
  if (agencyName) {
    try {
      var r2 = await fetch(SB + '/rest/v1/organism_memory?entity_tags=ilike.*' + encodeURIComponent(agencyName.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)) + '*&order=created_at.desc&limit=15', { headers: H });
      if (r2.ok) {
        var rows2 = await r2.json();
        for (var j = 0; j < rows2.length; j++) { if (!seen.has(rows2[j].id)) { candidates.push(rows2[j]); seen.add(rows2[j].id); } }
      }
    } catch(e) {}
  }

  // Strategy 3: Memories in same vertical
  if (vertical) {
    try {
      var r3 = await fetch(SB + '/rest/v1/organism_memory?entity_tags=ilike.*' + encodeURIComponent(vertical) + '*&order=created_at.desc&limit=15', { headers: H });
      if (r3.ok) {
        var rows3 = await r3.json();
        for (var k = 0; k < rows3.length; k++) { if (!seen.has(rows3[k].id)) { candidates.push(rows3[k]); seen.add(rows3[k].id); } }
      }
    } catch(e) {}
  }

  // Strategy 4: Recent high-value memories (competitive intel, patterns, corrections)
  try {
    var valuableTypes = 'memory_type=in.(competitive_intel,pattern,correction,recommendation,win_pattern,pricing_benchmark,relationship)';
    var r4 = await fetch(SB + '/rest/v1/organism_memory?' + valuableTypes + '&order=created_at.desc&limit=15', { headers: H });
    if (r4.ok) {
      var rows4 = await r4.json();
      for (var m = 0; m < rows4.length; m++) { if (!seen.has(rows4[m].id)) { candidates.push(rows4[m]); seen.add(rows4[m].id); } }
    }
  } catch(e) {}

  // Strategy 5: Most recent memories (catch-all for cross-cutting intelligence)
  try {
    var r5 = await fetch(SB + '/rest/v1/organism_memory?order=created_at.desc&limit=10', { headers: H });
    if (r5.ok) {
      var rows5 = await r5.json();
      for (var n = 0; n < rows5.length; n++) { if (!seen.has(rows5[n].id)) { candidates.push(rows5[n]); seen.add(rows5[n].id); } }
    }
  } catch(e) {}

  return candidates;
}

async function rerank(candidates, context) {
  if (!candidates.length) return { selected: [], injection: '' };
  if (candidates.length <= 12) {
    // Small enough to use all — no reranking needed
    return { selected: candidates, injection: buildInjection(candidates) };
  }

  var previews = candidates.map(function(c, i) {
    return 'MEM_' + i + ' [' + c.agent + ' | ' + (c.memory_type || 'obs') + ' | ' + (c.created_at || '').slice(0, 10) + ']: ' + (c.observation || '').slice(0, 250);
  }).join('\n\n');

  var prompt = 'CURRENT CONTEXT:\n' + (context || '').slice(0, 1500) + '\n\n' +
    'ORGANISM MEMORIES (' + candidates.length + ' candidates):\n\n' + previews + '\n\n' +
    'Select the 10-15 MOST RELEVANT memories for this context. Prioritize:\n' +
    '1. Memories about the specific opportunity or agency\n' +
    '2. Competitive intelligence that affects positioning\n' +
    '3. Pricing benchmarks and financial patterns\n' +
    '4. Relationship intelligence\n' +
    '5. Corrections and lessons learned\n' +
    '6. Cross-cutting patterns from other opportunities in this vertical\n\n' +
    'Respond ONLY: SELECTED: 3,7,0,12,5,8,15,1,9,11';

  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 150,
        system: 'You are the organism memory retrieval optimizer. Select the most relevant memories. Return ONLY the format requested.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    var d = await r.json();
    var text = (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
    var match = text.match(/SELECTED:\s*([\d,\s]+)/);
    if (match) {
      var indices = match[1].split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n) && n >= 0 && n < candidates.length; });
      var selected = indices.map(function(i) { return candidates[i]; });
      return { selected: selected, injection: buildInjection(selected) };
    }
  } catch(e) {}

  // Fallback: return first 12
  return { selected: candidates.slice(0, 12), injection: buildInjection(candidates.slice(0, 12)) };
}

function buildInjection(memories) {
  if (!memories.length) return '';
  var text = '\n\n=== ORGANISM INTELLIGENCE (accumulated from all prior analysis) ===\n';
  for (var i = 0; i < memories.length; i++) {
    var m = memories[i];
    text += '\n[' + (m.agent || 'unknown') + ' | ' + (m.memory_type || 'observation') + ' | ' + (m.created_at || '').slice(0, 10) + ']:\n' + m.observation + '\n';
  }
  text += '\n=== END ORGANISM INTELLIGENCE ===\n';
  text += 'USE THIS INTELLIGENCE: The observations above represent everything the organism has learned. Reference specific findings in your analysis. Build on prior intelligence — do not repeat or contradict it without explanation. Your output will also become organism memory for future agents.\n';
  return text;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'memory retrieval engine online', usage: 'POST with opportunity_id, agency, vertical, step, context' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var opportunityId = body.opportunity_id || null;
  var agency = body.agency || null;
  var vertical = body.vertical || null;
  var step = body.step || null;
  var context = body.context || '';

  // Build context string from available info
  var fullContext = '';
  if (step) fullContext += 'ANALYSIS STEP: ' + step + '\n';
  if (agency) fullContext += 'AGENCY: ' + agency + '\n';
  if (vertical) fullContext += 'VERTICAL: ' + vertical + '\n';
  if (context) fullContext += context;

  try {
    var candidates = await loadCandidates(opportunityId, agency, vertical, null);

    if (!candidates.length) {
      return res.status(200).json({ found: false, memory_count: 0, injection: '', message: 'No organism memories found. Memory builds as agents analyze opportunities.' });
    }

    var result = await rerank(candidates, fullContext);

    return res.status(200).json({
      found: true,
      candidates_loaded: candidates.length,
      memories_selected: result.selected.length,
      injection: result.injection,
      memory_ids: result.selected.map(function(m) { return m.id; })
    });
  } catch(e) {
    return res.status(200).json({ found: false, memory_count: 0, injection: '', error: e.message });
  }
}