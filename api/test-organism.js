export const config = { maxDuration: 60 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
var HP = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
var BASE = 'https://hgi-capture-system.vercel.app';
var OPP_ID = 'manualtest-manual-htha-2026-03-04-001';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var log = [];

  // STEP 1: Seed relationship graph
  try {
    var r1 = await fetch(SB + '/rest/v1/relationship_graph', { method: 'POST', headers: HP, body: JSON.stringify({ id: 'rg-seed-gilton', contact_name: 'Nikita C. Gilton', title: 'Executive Director', organization: 'Houma Terrebonne Housing Authority', email: 'ngilton@hthousing.org', phone: '985-873-6865', relationship_strength: 'warm', last_contact: '2026-03-19', notes: 'Procurement contact for HTHA Grant and Project Management RFP. HGI submitted proposal March 19 2026.', connected_orgs: 'Terrebonne Parish', source_agent: 'seed', opportunity_id: OPP_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    log.push({ step: 'seed_contact', status: r1.ok ? 'seeded' : 'status_' + r1.status });
  } catch(e) { log.push({ step: 'seed_contact', error: e.message }); }

  // STEP 2: Seed competitive intelligence
  try {
    var r2 = await fetch(SB + '/rest/v1/competitive_intelligence', { method: 'POST', headers: HP, body: JSON.stringify({ id: 'ci-seed-htha', competitor_name: 'General field (Witt Obriens, Hagerty, Providence)', agency: 'Houma Terrebonne Housing Authority', opportunity_id: OPP_ID, contract_value: '640K-1.8M estimated', outcome: 'pending', strengths: 'HGI: Road Home credibility, TPSD Terrebonne relationship, 96-year track record, local presence', weaknesses: 'No direct housing authority clients in portfolio', strategic_notes: 'National firms may bid but HGI advantage is local execution plus federal compliance. TPSD contract proves Terrebonne capability.', vertical: 'disaster', source_agent: 'seed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    log.push({ step: 'seed_competitive_intel', status: r2.ok ? 'seeded' : 'status_' + r2.status });
  } catch(e) { log.push({ step: 'seed_competitive_intel', error: e.message }); }

  // STEP 3: Record outcome via outcome API (this fires events + cascade)
  try {
    var r3 = await fetch(BASE + '/api/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunity_id: OPP_ID, outcome: 'won', winner_name: 'HGI Global', hgi_bid_amount: '283000', notes: 'Proposal submitted March 19 2026. Awaiting formal award notification. Recording as won based on Christopher confirmation.' }) });
    var outcomeResult = await r3.json();
    log.push({ step: 'record_outcome', status: r3.ok ? 'recorded' : 'failed', result: outcomeResult });
  } catch(e) { log.push({ step: 'record_outcome', error: e.message }); }

  // STEP 4: Also fire outcome_recorded cascade directly (outcome.js fires won/lost but not outcome_recorded)
  try {
    var r4 = await fetch(BASE + '/api/cascade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'opportunity.outcome_recorded', opportunity_id: OPP_ID, opportunity_title: 'Houma Terrebonne Housing Authority Grant and Project Management Services', agency: 'Houma Terrebonne Housing Authority', data: { outcome: 'won', winner_name: 'HGI Global', hgi_bid_amount: '283000', opi_at_decision: 78 } }) });
    var cascadeResult = await r4.json();
    log.push({ step: 'fire_outcome_cascade', status: r4.ok ? 'fired' : 'failed', cascades: cascadeResult.cascades, results: cascadeResult.results });
  } catch(e) { log.push({ step: 'fire_outcome_cascade', error: e.message }); }

  return res.status(200).json({ test: 'organism_outcome_cascade', timestamp: new Date().toISOString(), log: log, next_step: 'Wait 60-90 seconds for all 8 Claude-powered agents to finish reacting, then query the 3 stores to see what they produced.' });
}