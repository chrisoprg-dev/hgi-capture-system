export const config = { maxDuration: 30 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var results = {};

  // TEST 1: Write a memory
  try {
    var record = {
      id: 'om-test-' + Date.now(),
      agent: 'session_24_test',
      opportunity_id: 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu',
      entity_tags: 'St George, disaster, Louisiana, competitive_intel',
      observation: 'St. George incorporated 2024 by Supreme Court 4-3 decision. Mayor Dustin Yates. Budget: $58M revenue, $44M spending. 2% sales tax generating ~$43M annually. Brand new city with zero established vendor relationships. Impacted by DR-4277 (2016 Flood), DR-4611 (Ida), DR-4817 (Francine). This is a greenfield opportunity with no incumbent. Primary competitors for disaster recovery MSA: Tetra Tech/AMR (deep FEMA PA experience), CDR Maguire (dominant Louisiana disaster recovery), Witt OBriens (national leader). HGI advantages: CDBG-DR dominance (Road Home $67M direct, Restore LA $42.3M), 95-year Louisiana heritage, 100% minority-owned, zero misappropriation record.',
      memory_type: 'competitive_intel',
      created_at: new Date().toISOString()
    };
    var wr = await fetch(SB + '/rest/v1/organism_memory', {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(record)
    });
    results.write = { status: wr.ok ? 'SUCCESS' : 'FAILED_' + wr.status, id: record.id, observation_length: record.observation.length };
    if (!wr.ok) results.write.error = (await wr.text()).slice(0, 200);
  } catch(e) { results.write = { status: 'ERROR', error: e.message }; }

  // TEST 2: Read it back
  try {
    var rd = await fetch(SB + '/rest/v1/organism_memory?order=created_at.desc&limit=3&select=id,agent,memory_type,entity_tags,observation,created_at', { headers: H });
    if (rd.ok) {
      var rows = await rd.json();
      results.read = { status: 'SUCCESS', count: rows.length, memories: rows.map(function(r) { return { id: r.id, agent: r.agent, type: r.memory_type, tags: r.entity_tags, observation_preview: (r.observation || '').slice(0, 100) + '...' }; }) };
    } else {
      results.read = { status: 'FAILED_' + rd.status };
    }
  } catch(e) { results.read = { status: 'ERROR', error: e.message }; }

  // TEST 3: Count total memories
  try {
    var ct = await fetch(SB + '/rest/v1/organism_memory?select=id', { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    results.total = ct.headers.get('content-range') || 'unknown';
  } catch(e) { results.total = 'error'; }

  results.timestamp = new Date().toISOString();
  results.verdict = (results.write && results.write.status === 'SUCCESS' && results.read && results.read.status === 'SUCCESS') ? 'MEMORY SYSTEM WORKING' : 'ISSUES DETECTED';

  return res.status(200).json(results);
}
