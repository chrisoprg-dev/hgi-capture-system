export const config = { maxDuration: 30 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = [];
  var seeds = [
    { table: 'relationship_graph', data: { id: 'rg-seed-gilton', contact_name: 'Nikita C. Gilton', title: 'Executive Director', organization: 'Houma Terrebonne Housing Authority', email: 'ngilton@hthousing.org', phone: '985-873-6865', relationship_strength: 'warm', last_contact: '2026-03-19', notes: 'Procurement contact for HTHA Grant and Project Management RFP. HGI submitted proposal March 19 2026.', connected_orgs: 'Terrebonne Parish', source_agent: 'seed', opportunity_id: 'manualtest-manual-htha-2026-03-04-001', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } },
    { table: 'competitive_intelligence', data: { id: 'ci-seed-htha-landscape', competitor_name: 'General field', agency: 'Houma Terrebonne Housing Authority', opportunity_id: 'manualtest-manual-htha-2026-03-04-001', contract_value: '640K-1.8M estimated', outcome: 'pending', strengths: 'HGI: Road Home credibility, local Terrebonne presence via TPSD, 96-year track record', weaknesses: 'No direct housing authority clients in current portfolio', strategic_notes: 'National firms (Witt Obriens, Hagerty) may bid. HGI advantage is local execution plus federal compliance depth. TPSD relationship provides Terrebonne Parish credibility.', vertical: 'disaster', source_agent: 'seed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } }
  ];
  for (var i = 0; i < seeds.length; i++) {
    try {
      var r = await fetch(SB + '/rest/v1/' + seeds[i].table, { method: 'POST', headers: H, body: JSON.stringify(seeds[i].data) });
      results.push({ table: seeds[i].table, id: seeds[i].data.id, status: r.ok ? 'seeded' : 'failed_' + r.status });
    } catch(e) { results.push({ table: seeds[i].table, status: 'error', error: e.message }); }
  }
  return res.status(200).json({ success: true, results: results });
}