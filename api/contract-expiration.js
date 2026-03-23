export const config = { maxDuration: 120 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'ce-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function logCost(agent, model, inTok, outTok) {
  var p = model.indexOf('haiku') !== -1 ? { in: 0.00000025, out: 0.00000125 } : { in: 0.000003, out: 0.000015 };
  var cost = inTok * p.in + outTok * p.out;
  fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'cost-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), source: 'api_cost', status: JSON.stringify({ agent: agent, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, endpoint: 'contract-expiration' }), run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function() {});
}
async function haiku(system, prompt) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: system, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) return '';
    var d = await r.json();
    if (d.usage) logCost('contract_expiration', 'claude-haiku-4-5-20251001', d.usage.input_tokens||0, d.usage.output_tokens||0);
    return (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  } catch(e) { return ''; }
}
async function mem(agent, oppId, tags, obs, mType) {
  try { await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: makeId(), agent: agent, opportunity_id: oppId || null, entity_tags: tags, observation: obs, memory_type: mType || 'competitive_intel', created_at: new Date().toISOString() }) }); } catch(e) {}
}

// HGI-relevant NAICS codes across 8 verticals
var NAICS_CODES = [
  '541611', // Admin Management Consulting (disaster recovery PM, program admin)
  '541618', // Other Management Consulting
  '524291', // Claims Adjusting (TPA/Claims)
  '524298', // All Other Insurance Related Activities
  '541990', // All Other Professional/Technical Services
  '541330', // Engineering Services (construction mgmt)
  '624230', // Emergency and Other Relief Services
  '541620', // Environmental Consulting (FEMA-adjacent)
  '561110', // Office Administrative Services (workforce/WIOA)
  '525990'  // Other Financial Vehicles (grant mgmt)
];

// Known competitors to watch
var COMPETITORS = ['CDR Maguire', 'Tetra Tech', 'IEM', 'Hagerty Consulting', 'Tidal Basin', 'Witt O\'Brien', 'Adjusters International', 'HORNE LLP', 'ICF International', 'Deloitte'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { started: new Date().toISOString(), queries: [], contracts_found: 0, analyzed: 0, pipeline_created: 0, errors: [] };
  try {
    // Date windows: contracts ending in next 3-12 months
    var now = new Date();
    var start3mo = new Date(now.getTime() + 90 * 86400000).toISOString().slice(0,10);
    var start6mo = new Date(now.getTime() + 180 * 86400000).toISOString().slice(0,10);
    var end12mo = new Date(now.getTime() + 365 * 86400000).toISOString().slice(0,10);
    // Query 1: Contracts expiring 3-12 months, HGI NAICS codes
    var body1 = JSON.stringify({
      subawards: false,
      limit: 25,
      page: 1,
      sort: 'Award Amount',
      order: 'desc',
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: { require: NAICS_CODES },
        time_period: [{ start_date: start3mo, end_date: end12mo, date_type: 'date_signed' }]
      },
      fields: ['Award ID', 'Recipient Name', 'Start Date', 'End Date', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Description', 'NAICS Code', 'Place of Performance State Code', 'Place of Performance City Name', 'generated_internal_id']
    });
    var r1;
    try {
      r1 = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body1 });
    } catch(fetchErr) { R.errors.push({ step: 'usaspending_fetch', msg: fetchErr.message }); }
    var contracts1 = [];
    if (r1 && r1.ok) {
      var d1 = await r1.json();
      contracts1 = (d1.results || []);
      R.queries.push({ type: 'naics_expiring', count: contracts1.length });
    } else if (r1) {
      R.errors.push({ step: 'usaspending_naics', status: r1.status });
    }
    // Query 2: Competitor contracts expiring in next 12 months
    // Search by keyword for known competitors
    var contracts2 = [];
    var competitorKeywords = COMPETITORS.slice(0, 5); // Top 5 to stay within cost budget
    for (var ci = 0; ci < competitorKeywords.length; ci++) {
      try {
        var body2 = JSON.stringify({
          subawards: false,
          limit: 10,
          page: 1,
          sort: 'Award Amount',
          order: 'desc',
          filters: {
            award_type_codes: ['A', 'B', 'C', 'D'],
            keywords: [competitorKeywords[ci]],
            time_period: [{ start_date: start3mo, end_date: end12mo, date_type: 'date_signed' }]
          },
          fields: ['Award ID', 'Recipient Name', 'Start Date', 'End Date', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Description', 'NAICS Code', 'Place of Performance State Code', 'generated_internal_id']
        });
        var r2 = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body2 });
        if (r2 && r2.ok) {
          var d2 = await r2.json();
          var found = (d2.results || []);
          contracts2 = contracts2.concat(found);
          R.queries.push({ type: 'competitor', name: competitorKeywords[ci], count: found.length });
        }
      } catch(e) { R.errors.push({ step: 'competitor_' + competitorKeywords[ci], msg: e.message }); }
    }
    // Deduplicate by Award ID
    var allContracts = contracts1.concat(contracts2);
    var seen = {};
    var unique = [];
    for (var ui = 0; ui < allContracts.length; ui++) {
      var aid = allContracts[ui]['Award ID'] || allContracts[ui]['generated_internal_id'] || ('idx-' + ui);
      if (!seen[aid]) { seen[aid] = true; unique.push(allContracts[ui]); }
    }
    R.contracts_found = unique.length;
    if (unique.length === 0) {
      R.note = 'No expiring contracts found in window';
      await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'hr-ce-' + Date.now(), source: 'contract_expiration', status: '0 contracts found', run_at: new Date().toISOString(), opportunities_found: 0 }) }).catch(function(){});
      return res.status(200).json(R);
    }
    // Build summary for Haiku analysis
    var contractSummary = unique.slice(0, 20).map(function(c, i) {
      return (i+1) + '. ' + (c['Recipient Name']||'Unknown') + ' | ' + (c['Awarding Agency']||'') + ' / ' + (c['Awarding Sub Agency']||'') + ' | ' + String.fromCharCode(36) + ((c['Award Amount']||0)/1000000).toFixed(1) + 'M | Ends: ' + (c['End Date']||'unknown') + ' | NAICS: ' + (c['NAICS Code']||'n/a') + ' | ' + (c['Place of Performance State Code']||'') + ' | ' + (c['Description']||'').slice(0,120);
    }).join('\n');
    // Haiku: analyze which contracts are HGI-relevant recompete opportunities
    var analysis = await haiku(
      'You are a government contract intelligence analyst for HGI Global, a program management and third-party administration firm. HGI\'s 8 verticals: Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management. HGI has one prior federal contract (PBGC) and is actively trying to penetrate the federal market. HGI\'s strengths: 95+ years in business, 100% minority-owned (8a/MBE advantage), $13B+ program experience (Road Home), deep Louisiana/Gulf Coast presence.',
      'Analyze these expiring federal contracts for recompete potential:\n\n' + contractSummary + '\n\nFor each contract, respond with ONE line in this exact format:\nCONTRACT [number]: [FIT_SCORE 1-10] | [VERTICAL match or NONE] | [RECOMPETE_SIGNAL: HIGH/MEDIUM/LOW/NONE] | [1-sentence reason]\n\nFIT_SCORE criteria: 10 = exact HGI vertical match + minority-owned advantage likely. 7-9 = strong vertical match. 4-6 = partial match, worth monitoring. 1-3 = not HGI work.\n\nAfter all contracts, add a section: SUMMARY: [total high-fit count] high-fit contracts identified. [1-2 sentence strategic recommendation for HGI.]'
    );
    R.analyzed = Math.min(unique.length, 20);
    R.analysis_chars = analysis.length;
    // Parse high-fit contracts (FIT_SCORE >= 7) and create pipeline records
    var highFit = [];
    var lines = analysis.split('\n');
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var fitMatch = line.match(/CONTRACT\s+(\d+):\s*(\d+)\s*\|/i);
      if (fitMatch) {
        var idx = parseInt(fitMatch[1]) - 1;
        var score = parseInt(fitMatch[2]);
        if (score >= 7 && idx < unique.length) {
          highFit.push({ contract: unique[idx], fit_score: score, analysis_line: line });
        }
      }
    }
    R.high_fit = highFit.length;
    // Create pipeline records for high-fit contracts
    for (var hi = 0; hi < highFit.length; hi++) {
      var hf = highFit[hi];
      var c = hf.contract;
      var title = 'RECOMPETE: ' + (c['Awarding Sub Agency'] || c['Awarding Agency'] || 'Federal') + ' - ' + (c['Description']||'Professional Services').slice(0, 80);
      var oppId = 'usaspend-' + (c['Award ID']||'').replace(/[^a-zA-Z0-9]/g, '').slice(0, 30) + '-' + Date.now();
      // Check for duplicates by Award ID in title
      var awardIdCheck = (c['Award ID']||'').slice(0, 20);
      if (awardIdCheck) {
        try {
          var existing = await (await fetch(SB + '/rest/v1/opportunities?title=ilike.*' + encodeURIComponent(awardIdCheck) + '*&limit=1', { headers: H })).json();
          if (existing && existing.length > 0) { R.queries.push({ type: 'dedup_skip', award_id: awardIdCheck }); continue; }
        } catch(e) {}
      }
      try {
        await fetch(SB + '/rest/v1/opportunities', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({
          id: oppId,
          title: title,
          agency: (c['Awarding Agency']||'Federal Agency'),
          vertical: 'recompete',
          state: (c['Place of Performance State Code']||''),
          opi_score: 70,
          stage: 'identified',
          status: 'active',
          estimated_value: c['Award Amount'] || null,
          source_url: 'https://www.usaspending.gov/award/' + encodeURIComponent(c['generated_internal_id']||c['Award ID']||''),
          scope_analysis: 'RECOMPETE SIGNAL: Contract ' + (c['Award ID']||'') + ' held by ' + (c['Recipient Name']||'unknown') + ' expires ' + (c['End Date']||'unknown') + '. Award value: ' + String.fromCharCode(36) + ((c['Award Amount']||0)/1000000).toFixed(2) + 'M. Agency: ' + (c['Awarding Agency']||'') + ' / ' + (c['Awarding Sub Agency']||'') + '. NAICS: ' + (c['NAICS Code']||'') + '. HGI Fit Score: ' + hf.fit_score + '/10. Analysis: ' + hf.analysis_line,
          discovered_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        }) });
        R.pipeline_created++;
      } catch(e) { R.errors.push({ step: 'pipeline_create', msg: e.message }); }
      // Write to organism memory
      await mem('contract_expiration', oppId, (c['Awarding Agency']||'') + ',recompete,' + (c['Recipient Name']||''), 'EXPIRING CONTRACT DETECTED: ' + (c['Recipient Name']||'') + ' holds ' + (c['Award ID']||'') + ' at ' + (c['Awarding Agency']||'') + ' / ' + (c['Awarding Sub Agency']||'') + ' worth ' + String.fromCharCode(36) + ((c['Award Amount']||0)/1000000).toFixed(2) + 'M, ending ' + (c['End Date']||'') + '. NAICS ' + (c['NAICS Code']||'') + '. HGI fit: ' + hf.fit_score + '/10. ' + hf.analysis_line, 'competitive_intel');
    }
    // Store full analysis in memory regardless
    if (analysis.length > 100) {
      await mem('contract_expiration', null, 'contract_expiration,federal,recompete', 'CONTRACT EXPIRATION SCAN ' + new Date().toISOString().slice(0,10) + ': ' + unique.length + ' contracts found, ' + highFit.length + ' high-fit (score 7+). ' + analysis.slice(0, 3000), 'competitive_intel');
    }
  } catch(e) { R.errors.push({ fatal: e.message }); }
  // Run log
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ id: 'hr-ce-' + Date.now(), source: 'contract_expiration', status: R.contracts_found + ' found | ' + R.high_fit + ' high-fit | ' + R.pipeline_created + ' created', run_at: new Date().toISOString(), opportunities_found: R.pipeline_created || 0 }) });
  } catch(e) {}
  R.completed = new Date().toISOString();
  return res.status(200).json(R);
}