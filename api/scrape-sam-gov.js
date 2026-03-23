// api/scrape-sam-gov.js — SAM.gov federal opportunities scraper
// Uses the confirmed-working public API endpoint (DEMO_KEY or registered key)
// Filters by: HGI NAICS codes + HGI-relevant keywords + state-administered federal programs
// NOTE: HGI has NEVER had a direct federal contract — we filter for state-administered
//       federal programs (CDBG-DR, FEMA PA admin, WIOA, HUD) where the awarding org
//       is a state/local agency, housing authority, or insurance entity using federal funds
import { HGI_KEYWORDS } from './hgi-master-context.js';
export const config = { maxDuration: 120 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var INTAKE = 'https://hgi-capture-system.vercel.app/api/intake';
var INTAKE_SECRET = process.env.INTAKE_SECRET;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
var SAM_API_KEY = process.env.SAM_GOV_API_KEY || 'DEMO_KEY';
var SAM_BASE = 'https://sam.gov/api/prod/opportunities/v2/search';

// HGI NAICS codes — filter to only these
var HGI_NAICS = ['541611', '541690', '561110', '561990', '524291', '923120', '921190', '541219', '541618', '624310'];

// HGI target states — where HGI operates
var HGI_STATES = ['LA', 'TX', 'FL', 'MS', 'AL', 'GA'];

// Top keywords to search on SAM.gov — focused, not exhausting rate limits
// DEMO_KEY: ~1000 requests/day. At 1 request per keyword = 16 keywords 2x/day = 32/day. Fine.
var SAM_KEYWORDS = [
  // TPA / Claims — HGI's biggest non-disaster vertical
  'claims administration services',
  'third party administrator TPA',
  'workers compensation claims administration',
  'insurance guaranty association',
  'self-insured claims management',
  // Disaster / Recovery — but specifically program admin not construction
  'disaster recovery program management',
  'CDBG-DR program administration',
  'FEMA public assistance program management',
  'grant management program administration',
  // Workforce
  'workforce development WIOA administration',
  'unemployment claims adjudication',
  // Housing / HUD
  'housing authority program management',
  'HUD compliance program administration',
  // Settlement / Mediation
  'settlement administration services',
  'class action administration',
  // Staff Aug / BPO
  'staff augmentation professional services',
  'business process outsourcing program'
];

function getDateRange() {
  // Last 60 days posted, active only
  var to = new Date();
  var from = new Date();
  from.setDate(from.getDate() - 60);
  var fmt = function(d) {
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var yyyy = d.getFullYear();
    return mm + '/' + dd + '/' + yyyy;
  };
  return { from: fmt(from), to: fmt(to) };
}

async function searchSam(keyword) {
  try {
    var dates = getDateRange();
    // Build query — filter for our states using placeOfPerformance
    // ptype: o = combined synopsis/solicitation, p = presolicitation, k = combined
    var params = new URLSearchParams({
      api_key: SAM_API_KEY,
      keyword: keyword,
      postedFrom: dates.from,
      postedTo: dates.to,
      ptype: 'o,p,k',   // solicitations + presolicitations
      active: 'true',
      limit: '25'
    });
    var r = await fetch(SAM_BASE + '?' + params.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return [];
    var d = await r.json();
    var opps = d.opportunitiesData || [];
    // Filter to HGI states (placeOfPerformance.state)
    return opps.filter(function(o) {
      var state = (o.placeOfPerformance && o.placeOfPerformance.state && o.placeOfPerformance.state.code) ||
                  (o.officeAddress && o.officeAddress.state) || '';
      return HGI_STATES.indexOf(state) !== -1;
    });
  } catch(e) { return []; }
}

async function sendToIntake(opp, keyword) {
  try {
    var state = (opp.placeOfPerformance && opp.placeOfPerformance.state && opp.placeOfPerformance.state.code) ||
                (opp.officeAddress && opp.officeAddress.state) || 'Federal';
    var agency = opp.fullParentPathName
      ? opp.fullParentPathName.split('.').pop().trim()
      : 'Federal Agency';
    var deadline = opp.responseDeadLine ? opp.responseDeadLine.slice(0, 10) : '';
    var naics = Array.isArray(opp.naicsCodes) && opp.naicsCodes.length ? opp.naicsCodes[0] : (opp.naicsCode || '');
    var r = await fetch(INTAKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-intake-secret': INTAKE_SECRET },
      body: JSON.stringify({
        source: 'sam.gov',
        source_id: opp.noticeId || opp.solicitationNumber || opp.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60),
        title: opp.title || 'Untitled',
        agency: agency,
        url: opp.uiLink || ('https://sam.gov/workspace/contract/opp/' + opp.noticeId + '/view'),
        state: state,
        naics: String(naics || ''),
        response_deadline: deadline,
        description: opp.title + ' | ' + opp.type + ' | ' + agency + ' | ' + state + ' | NAICS: ' + naics,
        rfp_text: 'SAM.gov: ' + opp.title + ' | Type: ' + opp.type + ' | Agency: ' + agency + ' | State: ' + state + ' | NAICS: ' + naics + ' | Solicitation: ' + (opp.solicitationNumber || '') + ' | Keyword match: ' + keyword,
        intake_secret: INTAKE_SECRET
      })
    });
    var res2 = await r.json();
    return { title: opp.title, status: res2.success ? 'ingested' : (res2.skipped ? 'skipped' : 'error'), opi: res2.opi_score };
  } catch(e) { return { title: opp.title || 'error', status: 'error', error: e.message }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { source: 'sam.gov', started: new Date().toISOString(), api_key_type: SAM_API_KEY === 'DEMO_KEY' ? 'DEMO_KEY' : 'REGISTERED', keywords_searched: 0, found_total: 0, after_state_filter: 0, ingested: 0, skipped: 0, errors: 0, details: [] };
  var seenIds = new Set();
  var allOpps = [];
  for (var i = 0; i < SAM_KEYWORDS.length; i++) {
    results.keywords_searched++;
    var opps = await searchSam(SAM_KEYWORDS[i]);
    results.found_total += opps.length;
    for (var j = 0; j < opps.length; j++) {
      var id = opps[j].noticeId || opps[j].solicitationNumber || opps[j].title;
      if (id && !seenIds.has(id)) { seenIds.add(id); allOpps.push({ opp: opps[j], keyword: SAM_KEYWORDS[i] }); }
    }
    // Small delay between SAM.gov requests to respect rate limits
    if (i < SAM_KEYWORDS.length - 1) await new Promise(function(r2) { setTimeout(r2, 300); });
  }
  results.after_state_filter = allOpps.length;
  // Process up to 20 opportunities per run
  var batch = allOpps.slice(0, 20);
  for (var k = 0; k < batch.length; k++) {
    var ir = await sendToIntake(batch[k].opp, batch[k].keyword);
    results.details.push(ir);
    if (ir.status === 'ingested') results.ingested++;
    else if (ir.status === 'skipped') results.skipped++;
    else results.errors++;
  }
  results.completed = new Date().toISOString();
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ source: 'sam_gov', status: 'found:' + results.found_total + '|filtered_state:' + results.after_state_filter + '|in:' + results.ingested + '|skip:' + results.skipped, run_at: new Date().toISOString(), opportunities_found: results.ingested }) });
  } catch(e) {}
  return res.status(200).json(results);
}