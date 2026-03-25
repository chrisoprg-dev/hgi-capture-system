export const config = { maxDuration: 60 };
import { HGI_GRANTS_KEYWORDS } from './hgi-master-context.js';
var INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
var GRANTS_API = 'https://api.grants.gov/v1/api/search2';
var INTAKE_SECRET = process.env.INTAKE_SECRET;
var KEYWORDS = HGI_GRANTS_KEYWORDS;
async function searchGrants(kw, debug) {
  try {
    var r = await fetch(GRANTS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw, rows: 10, sortBy: 'openDate|desc' })
    });
    if (debug) return { __debug: true, status: r.status, ok: r.ok, body: await r.text() };
    if (!r.ok) return [];
    var d = await r.json();
    return (d.data && d.data.oppHits) || d.oppHits || [];
  } catch(e) {
    if (debug) return { __debug: true, error: e.message };
    return [];
  }
}
async function sendToIntake(opp) {
  try {
    var title = opp.title || opp.oppTitle || 'Untitled Grant';
    var agency = opp.agency || opp.agencyName || 'Federal Agency';
    var oppId = opp.id || opp.oppId || opp.number || '';
    var body = {
      source: 'grants.gov',
      source_id: 'grants-' + (oppId || title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60)),
      title: title,
      agency: agency,
      url: 'https://www.grants.gov/search-results-detail/' + oppId,
      posted_date: opp.openDate || '',
      response_deadline: opp.closeDate || '',
      estimated_value: opp.awardCeiling ? (String.fromCharCode(36) + Number(opp.awardCeiling).toLocaleString()) : '',
      state: 'Federal',
      description: (opp.description || opp.synopsis || '').slice(0, 2000),
      rfp_text: (opp.description || opp.synopsis || '').slice(0, 10000),
      intake_secret: INTAKE_SECRET
    };
    var r = await fetch(INTAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-intake-secret': INTAKE_SECRET },
      body: JSON.stringify(body)
    });
    var res2 = await r.json();
    return { title: title, status: res2.success ? 'ingested' : (res2.skipped ? 'skipped' : 'failed'), opi: res2.opi_score };
  } catch(e) { return { title: 'error', status: 'error', error: e.message }; }
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { source: 'grants.gov', started: new Date().toISOString(), keywords_searched: 0, found: 0, ingested: 0, skipped: 0, errors: 0, details: [] };
  var seenIds = new Set();
  var allOpps = [];
  var isDebug = req.query && req.query.debug === '1';
  if (isDebug) {
    var debugResult = await searchGrants(KEYWORDS[0], true);
    return res.status(200).json({ debug: true, keyword: KEYWORDS[0], api_url: GRANTS_API, result: debugResult });
  }
  for (var i = 0; i < KEYWORDS.length; i++) {
    results.keywords_searched++;
    var hits = await searchGrants(KEYWORDS[i]);
    for (var j = 0; j < hits.length; j++) {
      var id = hits[j].id || hits[j].oppId || hits[j].number || '';
      if (id && !seenIds.has(id)) { seenIds.add(id); allOpps.push(hits[j]); }
    }
  }
  results.found = allOpps.length;
  var batch = allOpps.slice(0, 20);
  for (var k = 0; k < batch.length; k++) {
    var ir = await sendToIntake(batch[k]);
    results.details.push(ir);
    if (ir.status === 'ingested') results.ingested++;
    else if (ir.status === 'skipped') results.skipped++;
    else results.errors++;
  }
  results.completed = new Date().toISOString();
  try {
    var SB = process.env.SUPABASE_URL;
    var SK = process.env.SUPABASE_SERVICE_KEY;
    await fetch(SB + '/rest/v1/hunt_runs', {
      method: 'POST',
      headers: { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ source: 'grants_gov', status: 'found:' + results.found + '|in:' + results.ingested + '|skip:' + results.skipped, run_at: new Date().toISOString(), opportunities_found: results.ingested })
    });
  } catch(e) {}
  return res.status(200).json(results);
}