// api/disaster-monitor.js — FEMA Disaster Declaration Monitor
// Polls FEMA OpenFEMA API daily. When a new major disaster drops in LA/TX/FL/MS:
// - Creates a pre-solicitation opportunity in the pipeline
// - Fires an executive brief to organism memory
// Target states: Louisiana, Texas, Florida, Mississippi
export const config = { maxDuration: 60 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
const TARGET_STATES = ['LA', 'TX', 'FL', 'MS'];
const TARGET_STATE_NAMES = { LA: 'Louisiana', TX: 'Texas', FL: 'Florida', MS: 'Mississippi' };

function makeId() { return 'fema-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

async function storeMemory(observation) {
  try {
    await fetch(SB + '/rest/v1/organism_memory', {
      method: 'POST',
      headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        id: makeId(),
        agent: 'disaster_monitor',
        opportunity_id: null,
        entity_tags: 'fema,disaster_declaration,pre_solicitation,executive_brief',
        observation: observation,
        memory_type: 'analysis',
        created_at: new Date().toISOString()
      })
    });
  } catch(e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), checked: [], new_declarations: [], errors: [] };

  try {
    // FEMA OpenFEMA API — disasters declared in last 14 days in target states
    // Major disaster declarations only (DR type)
    var cutoff = new Date(Date.now() - 14 * 24 * 3600000).toISOString().slice(0, 10);
    var stateFilter = TARGET_STATES.map(function(s) { return "state eq '" + s + "'"; }).join(' or ');
    var femaUrl = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationType%20eq%20%27DR%27%20and%20(' + encodeURIComponent(stateFilter) + ')%20and%20declarationDate%20gt%20%27' + cutoff + '%27&$orderby=declarationDate%20desc&$top=20';

    var femaR = await fetch(femaUrl);
    if (!femaR.ok) {
      R.errors.push({ step: 'fema_fetch', status: femaR.status });
      return res.status(200).json(R);
    }
    var femaD = await femaR.json();
    var declarations = femaD.DisasterDeclarationsSummaries || [];
    R.fema_results = declarations.length;

    // Deduplicate by disaster number — check what we already have in pipeline
    var existingR = await fetch(SB + '/rest/v1/opportunities?vertical=eq.disaster&source_url=like.*fema.gov*&select=source_url&limit=50', { headers: H });
    var existing = await existingR.json();
    var existingUrls = (existing||[]).map(function(o) { return o.source_url || ''; });

    // Process each new declaration
    for (var di = 0; di < declarations.length; di++) {
      var dec = declarations[di];
      var disasterNum = dec.disasterNumber || dec.disaster_number || '';
      var state = dec.state || dec.stateCode || '';
      var title = dec.declarationTitle || dec.declaration_title || '';
      var declaredDate = (dec.declarationDate || dec.declaration_date || '').slice(0, 10);
      var incidentType = dec.incidentType || dec.incident_type || '';
      var femaId = 'DR-' + disasterNum;
      var sourceUrl = 'https://www.fema.gov/disaster/' + disasterNum;
      R.checked.push({ id: femaId, state: state, title: title, date: declaredDate });

      // Skip if already in pipeline
      if (existingUrls.some(function(u) { return u.indexOf(String(disasterNum)) !== -1; })) continue;
      if (TARGET_STATES.indexOf(state) === -1) continue;

      var stateName = TARGET_STATE_NAMES[state] || state;

      // Generate pre-solicitation brief using Haiku
      var brief = '';
      try {
        var briefR = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system: 'HGI capture intelligence agent. HGI is a 95-year-old minority-owned firm with $13B+ in disaster recovery program management experience including Road Home, Restore Louisiana, TPSD FEMA PA. When a FEMA major disaster is declared, state and local agencies typically issue RFPs for program management, FEMA PA consulting, CDBG-DR administration, and housing assistance within 30-120 days. Write a concise pre-solicitation brief for HGI leadership.',
            messages: [{ role: 'user', content:
              'FEMA DISASTER DECLARATION\n' +
              'Disaster: ' + femaId + '\n' +
              'State: ' + stateName + '\n' +
              'Title: ' + title + '\n' +
              'Incident Type: ' + incidentType + '\n' +
              'Declaration Date: ' + declaredDate + '\n\n' +
              'Write a 4-6 sentence pre-solicitation brief covering: (1) what programs HGI should expect to be solicited (FEMA PA, CDBG-DR, IA, HM 404/406), (2) which state/local agencies to contact immediately, (3) HGI past performance most relevant to this declaration, (4) recommended immediate actions this week. Be specific to this state and incident type.'
            }]
          })
        });
        var briefD = await briefR.json();
        brief = (briefD.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
      } catch(e) { brief = 'FEMA ' + femaId + ' declared in ' + stateName + '. Review FEMA.gov for program activation details.'; }

      // Add to pipeline as pre-solicitation opportunity
      var oppId = makeId();
      var oppTitle = femaId + ' — ' + stateName + ' Disaster Recovery Program Management (' + title + ')';
      try {
        await fetch(SB + '/rest/v1/opportunities', {
          method: 'POST',
          headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
          body: JSON.stringify({
            id: oppId,
            title: oppTitle,
            agency: stateName + ' Emergency Management / GOHSEP',
            vertical: 'disaster',
            state: state,
            status: 'active',
            stage: 'identified',
            opi_score: 75,
            source_url: sourceUrl,
            scope_analysis: 'PRE-SOLICITATION — FEMA ' + femaId + '\nDeclared: ' + declaredDate + '\nIncident: ' + incidentType + '\nState: ' + stateName + '\n\nExpected programs: FEMA PA (Cat A-G), CDBG-DR, Individual Assistance, Hazard Mitigation 404/406.\nNo RFP issued yet. Monitor state emergency management portal weekly.\n\n' + brief,
            capture_action: 'PRE-SOLICITATION | FEMA ' + femaId + ' | Declared ' + declaredDate + ' | Monitor for RFP within 30-120 days',
            discovered_at: new Date().toISOString(),
            last_updated: new Date().toISOString()
          })
        });
        R.new_declarations.push({ id: femaId, state: state, title: title, opp_id: oppId });
      } catch(e) { R.errors.push({ step: 'pipeline_insert', id: femaId, msg: e.message }); }

      // Store executive brief in organism memory
      var memObs = 'DISASTER MONITOR — NEW FEMA DECLARATION\n' +
        'Disaster: ' + femaId + ' | State: ' + stateName + ' | Date: ' + declaredDate + '\n' +
        'Incident: ' + incidentType + ' — ' + title + '\n' +
        'Source: ' + sourceUrl + '\n\n' +
        'PRE-SOLICITATION BRIEF:\n' + brief + '\n\n' +
        'ACTION: Pipeline record created (OPI 75). Monitor ' + stateName + ' emergency management portal for RFP. Contact state OCD/emergency management this week.';
      await storeMemory(memObs);
    }

    // Log the run
    try {
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({
          id: 'hr-fema-' + Date.now(),
          source: 'disaster_monitor',
          status: R.new_declarations.length + ' new | ' + declarations.length + ' checked | states: ' + TARGET_STATES.join(','),
          run_at: new Date().toISOString(),
          opportunities_found: R.new_declarations.length
        })
      });
    } catch(e) {}

  } catch(e) { R.errors.push({ fatal: e.message }); }

  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}