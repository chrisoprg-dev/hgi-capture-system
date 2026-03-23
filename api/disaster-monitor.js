// api/disaster-monitor.js — FEMA Disaster Declaration Monitor
export const config = { maxDuration: 120 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
const TARGET_STATES = ['LA', 'TX', 'FL', 'MS'];
const TARGET_STATE_NAMES = { LA: 'Louisiana', TX: 'Texas', FL: 'Florida', MS: 'Mississippi' };
function makeId() { return 'fema-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

async function getBrief(femaId, stateName, title, incidentType, declaredDate) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        system: 'HGI capture intelligence agent. HGI is a 95-year-old minority-owned firm with $13B+ in disaster recovery program management experience (Road Home, Restore Louisiana, TPSD FEMA PA). Write a concise 4-sentence pre-solicitation brief for HGI leadership covering: (1) programs expected (FEMA PA Cat A-G, CDBG-DR, IA, HM 404/406), (2) state agencies to contact immediately, (3) most relevant HGI past performance, (4) recommended action this week.',
        messages: [{ role: 'user', content: 'FEMA ' + femaId + ' | ' + stateName + ' | ' + incidentType + ' | ' + title + ' | Declared ' + declaredDate }]
      })
    });
    if (!r.ok) return 'FEMA ' + femaId + ' declared in ' + stateName + '. Monitor FEMA.gov for program activation.';
    var d = await r.json();
    return (d.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('') || 'FEMA ' + femaId + ' declared in ' + stateName + '.';
  } catch(e) { return 'FEMA ' + femaId + ' declared in ' + stateName + '. Review FEMA.gov for details.'; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), checked: [], new_declarations: [], errors: [] };
  try {
    // FEMA OpenFEMA API — CamelCase endpoint, OData filter, 60-day window
    var cutoff = new Date(Date.now() - 60 * 24 * 3600000).toISOString().slice(0, 10);
    var stateFilter = TARGET_STATES.map(function(s) { return 'state%20eq%20%27' + s + '%27'; }).join('%20or%20');
    var femaUrl = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationType%20eq%20%27DR%27%20and%20(' + stateFilter + ')%20and%20declarationDate%20gt%20%27' + cutoff + '%27&$orderby=declarationDate%20desc&$top=20';
    var femaR = await fetch(femaUrl);
    if (!femaR.ok) { R.errors.push({ step: 'fema_fetch', status: femaR.status }); return res.status(200).json(R); }
    var femaD = await femaR.json();
    var declarations = femaD.DisasterDeclarationsSummaries || [];
    R.fema_results = declarations.length;

    // Load existing pipeline to deduplicate
    var existingR = await fetch(SB + '/rest/v1/opportunities?vertical=eq.disaster&source_url=like.*fema.gov*&select=source_url&limit=100', { headers: H });
    var existing = await existingR.json();
    var existingUrls = (existing||[]).map(function(o){ return o.source_url||''; });

    // Deduplicate by disasterNumber — API returns one row per county
    var seenNums = {};
    var newDecs = [];
    for (var di = 0; di < declarations.length; di++) {
      var dec = declarations[di];
      var num = String(dec.disasterNumber||'');
      var state = dec.state||'';
      if (TARGET_STATES.indexOf(state) === -1) continue;
      if (seenNums[num]) continue;
      if (existingUrls.some(function(u){ return u.indexOf(num) !== -1; })) continue;
      seenNums[num] = true;
      newDecs.push(dec);
    }
    R.checked = declarations.map(function(d){ return { id:'DR-'+(d.disasterNumber||''), state:d.state||'', title:d.declarationTitle||'', date:(d.declarationDate||'').slice(0,10) }; });

    if (!newDecs.length) {
      await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers:Object.assign({},H,{'Prefer':'return=minimal'}), body:JSON.stringify({ id:'hr-fema-'+Date.now(), source:'disaster_monitor', status:'0 new | '+declarations.length+' checked | all current', run_at:new Date().toISOString(), opportunities_found:0 }) });
      R.completed = new Date().toISOString();
      return res.status(200).json(R);
    }

    // Generate all briefs in PARALLEL — not sequential
    var briefPromises = newDecs.map(function(dec) {
      var femaId = 'DR-' + (dec.disasterNumber||'');
      var stateName = TARGET_STATE_NAMES[dec.state||''] || dec.state||'';
      var title = dec.declarationTitle||'';
      var incidentType = dec.incidentType||'';
      var declaredDate = (dec.declarationDate||'').slice(0,10);
      return getBrief(femaId, stateName, title, incidentType, declaredDate);
    });
    var briefs = await Promise.all(briefPromises);

    // Insert all new pipeline records + memories in parallel
    var insertPromises = newDecs.map(function(dec, idx) {
      var disasterNum = dec.disasterNumber||'';
      var state = dec.state||'';
      var title = dec.declarationTitle||'';
      var declaredDate = (dec.declarationDate||'').slice(0,10);
      var incidentType = dec.incidentType||'';
      var femaId = 'DR-' + disasterNum;
      var stateName = TARGET_STATE_NAMES[state] || state;
      var sourceUrl = 'https://www.fema.gov/disaster/' + disasterNum;
      var brief = briefs[idx];
      var oppId = makeId();
      var oppTitle = femaId + ' — ' + stateName + ' Disaster Recovery PM (' + title + ')';
      var scopeText = 'PRE-SOLICITATION — FEMA ' + femaId + '\nDeclared: ' + declaredDate + '\nIncident: ' + incidentType + '\nState: ' + stateName + '\n\nExpected programs: FEMA PA (Cat A-G), CDBG-DR, Individual Assistance, Hazard Mitigation 404/406.\nNo RFP yet. Monitor state emergency management portal weekly.\n\n' + brief;
      var memObs = 'DISASTER MONITOR — NEW FEMA DECLARATION\nDisaster: ' + femaId + ' | State: ' + stateName + ' | Date: ' + declaredDate + '\nIncident: ' + incidentType + ' — ' + title + '\nSource: ' + sourceUrl + '\n\nBRIEF:\n' + brief + '\n\nACTION: Pipeline record created (OPI 75). Monitor ' + stateName + ' emergency management for RFP within 30-120 days.';
      return Promise.all([
        fetch(SB+'/rest/v1/opportunities', { method:'POST', headers:Object.assign({},H,{'Prefer':'return=minimal'}), body:JSON.stringify({ id:oppId, title:oppTitle, agency:stateName+' Emergency Management / GOHSEP', vertical:'disaster', state:state, status:'active', stage:'identified', opi_score:75, source_url:sourceUrl, scope_analysis:scopeText, capture_action:'PRE-SOLICITATION | FEMA '+femaId+' | Declared '+declaredDate+' | Monitor for RFP within 30-120 days', discovered_at:new Date().toISOString(), last_updated:new Date().toISOString() }) }),
        fetch(SB+'/rest/v1/organism_memory', { method:'POST', headers:Object.assign({},H,{'Prefer':'return=minimal'}), body:JSON.stringify({ id:makeId(), agent:'disaster_monitor', opportunity_id:null, entity_tags:'fema,disaster_declaration,pre_solicitation', observation:memObs, memory_type:'analysis', created_at:new Date().toISOString() }) })
      ]).then(function(){ R.new_declarations.push({ id:femaId, state:state, title:title, opp_id:oppId }); }).catch(function(e){ R.errors.push({ step:'insert', id:femaId, msg:e.message }); });
    });
    await Promise.all(insertPromises);

    // Log run
    await fetch(SB+'/rest/v1/hunt_runs', { method:'POST', headers:Object.assign({},H,{'Prefer':'return=minimal'}), body:JSON.stringify({ id:'hr-fema-'+Date.now(), source:'disaster_monitor', status:R.new_declarations.length+' new | '+declarations.length+' checked | states:LA,TX,FL,MS', run_at:new Date().toISOString(), opportunities_found:R.new_declarations.length }) });
  } catch(e) { R.errors.push({ fatal: e.message }); }
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}