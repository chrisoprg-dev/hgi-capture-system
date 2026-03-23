// api/scrape-alabama.js — Alabama opportunities via SAM.gov API
// Alabama's procurement portal requires JS rendering — not reachable via direct HTTP from Vercel.
// This scraper uses SAM.gov (confirmed reachable) filtered to Alabama state opportunities only.
// SAM.gov covers federally-funded state programs (CDBG-DR, FEMA PA admin, WIOA, HUD) posted by AL agencies.
import { HGI_KEYWORDS } from './hgi-master-context.js';
export const config = { maxDuration: 60 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var INTAKE = 'https://hgi-capture-system.vercel.app/api/intake';
var INTAKE_SECRET = process.env.INTAKE_SECRET;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
var SAM_API_KEY = process.env.SAM_GOV_API_KEY || 'DEMO_KEY';
var SAM_BASE = 'https://sam.gov/api/prod/opportunities/v2/search';

var AL_KEYWORDS = ['claims administration', 'program management', 'grant administration', 'third party administrator', 'workforce development', 'disaster recovery', 'workers compensation TPA', 'housing authority'];

function getDateRange() {
  var to = new Date();
  var from = new Date();
  from.setDate(from.getDate() - 60);
  var fmt = function(d) { return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '/' + d.getFullYear(); };
  return { from: fmt(from), to: fmt(to) };
}

async function searchSamAlabama(keyword) {
  try {
    var dates = getDateRange();
    var params = new URLSearchParams({ api_key: SAM_API_KEY, keyword: keyword, postedFrom: dates.from, postedTo: dates.to, ptype: 'o,p,k', active: 'true', limit: '20' });
    var r = await fetch(SAM_BASE + '?' + params.toString(), { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    var d = await r.json();
    return (d.opportunitiesData || []).filter(function(o) {
      var state = (o.placeOfPerformance && o.placeOfPerformance.state && o.placeOfPerformance.state.code) || (o.officeAddress && o.officeAddress.state) || '';
      return state === 'AL';
    });
  } catch(e) { return []; }
}

async function sendToIntake(opp, keyword) {
  try {
    var agency = opp.fullParentPathName ? opp.fullParentPathName.split('.').pop().trim() : 'Alabama Agency';
    var deadline = opp.responseDeadLine ? opp.responseDeadLine.slice(0,10) : '';
    var naics = Array.isArray(opp.naicsCodes) && opp.naicsCodes.length ? opp.naicsCodes[0] : (opp.naicsCode || '');
    var r = await fetch(INTAKE, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-intake-secret': INTAKE_SECRET },
      body: JSON.stringify({ source: 'sam.gov', source_id: opp.noticeId || opp.solicitationNumber || opp.title.replace(/[^a-zA-Z0-9]/g,'-').slice(0,60), title: opp.title || 'Untitled', agency: agency, url: opp.uiLink || ('https://sam.gov/workspace/contract/opp/'+opp.noticeId+'/view'), state: 'AL', naics: String(naics||''), response_deadline: deadline, description: opp.title+' | '+agency+' | Alabama | NAICS: '+naics, rfp_text: 'SAM.gov Alabama: '+opp.title+' | '+opp.type+' | '+agency+' | NAICS: '+naics+' | Keyword: '+keyword, intake_secret: INTAKE_SECRET })
    });
    var d2 = await r.json();
    return { title: opp.title, status: d2.success ? 'ingested' : (d2.skipped ? 'skipped' : 'error'), opi: d2.opi_score };
  } catch(e) { return { title: opp.title||'error', status: 'error', error: e.message }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { source: 'sam_gov_alabama', started: new Date().toISOString(), keywords_searched: 0, found: 0, ingested: 0, skipped: 0, errors: 0, details: [] };
  var seenIds = new Set();
  var allOpps = [];
  for (var i = 0; i < AL_KEYWORDS.length; i++) {
    results.keywords_searched++;
    var opps = await searchSamAlabama(AL_KEYWORDS[i]);
    for (var j = 0; j < opps.length; j++) {
      var id = opps[j].noticeId || opps[j].solicitationNumber || opps[j].title;
      if (id && !seenIds.has(id)) { seenIds.add(id); allOpps.push({ opp: opps[j], keyword: AL_KEYWORDS[i] }); }
    }
    if (i < AL_KEYWORDS.length-1) await new Promise(function(r2){setTimeout(r2,200);});
  }
  results.found = allOpps.length;
  var batch = allOpps.slice(0,15);
  for (var k = 0; k < batch.length; k++) {
    var ir = await sendToIntake(batch[k].opp, batch[k].keyword);
    results.details.push(ir);
    if (ir.status==='ingested') results.ingested++;
    else if (ir.status==='skipped') results.skipped++;
    else results.errors++;
  }
  results.completed = new Date().toISOString();
  try { await fetch(SB+'/rest/v1/hunt_runs',{method:'POST',headers:Object.assign({},H,{Prefer:'return=minimal'}),body:JSON.stringify({source:'scrape_alabama',status:'found:'+results.found+'|in:'+results.ingested+'|skip:'+results.skipped,run_at:new Date().toISOString(),opportunities_found:results.ingested})}); } catch(e) {}
  return res.status(200).json(results);
}