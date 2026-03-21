export const config = { maxDuration: 30 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
var BASE = 'https://hgi-capture-system.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var results = {};

  // Test the retrieval endpoint with St. George context
  try {
    var r = await fetch(BASE + '/api/memory-retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opportunity_id: 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu',
        agency: 'City of St. George',
        vertical: 'disaster',
        step: 'research',
        context: 'Analyzing competitive landscape for St. George disaster recovery MSA'
      })
    });
    if (r.ok) {
      var data = await r.json();
      results.retrieve = {
        status: 'SUCCESS',
        found: data.found,
        candidates_loaded: data.candidates_loaded,
        memories_selected: data.memories_selected,
        injection_length: (data.injection || '').length,
        injection_preview: (data.injection || '').slice(0, 300) + '...'
      };
    } else {
      results.retrieve = { status: 'FAILED_' + r.status, body: (await r.text()).slice(0, 200) };
    }
  } catch(e) { results.retrieve = { status: 'ERROR', error: e.message }; }

  results.timestamp = new Date().toISOString();
  results.verdict = (results.retrieve && results.retrieve.status === 'SUCCESS' && results.retrieve.found) ? 'RETRIEVAL WORKING' : 'ISSUES DETECTED';

  return res.status(200).json(results);
}
