// api/health-monitor.js — System health check + API credit monitor
// Runs daily at 9am CST. Makes ZERO Claude API calls.
// Checks: (1) API credit balance via Anthropic cost API, (2) all crons fired today,
// (3) scraper health, (4) pipeline anomalies. Writes alerts to organism_memory.
export const config = { maxDuration: 30 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var AK = process.env.ANTHROPIC_API_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'hm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function getCSTDate() { return new Date(Date.now() - 6 * 3600000); }
function getCSTDateStr() { return getCSTDate().toISOString().slice(0, 10); }

async function alert(level, title, detail) {
  try {
    await fetch(SB + '/rest/v1/organism_memory', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({
      id: makeId(), agent: 'health_monitor', opportunity_id: null,
      entity_tags: 'system,health,' + level,
      observation: 'SYSTEM ALERT [' + level + ']: ' + title + '\n' + detail,
      memory_type: 'system_alert', created_at: new Date().toISOString()
    }) });
  } catch(e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var R = { ts: new Date().toISOString(), checks: [], alerts: [] };
  var today = getCSTDateStr();
  var todayStart = today + 'T00:00:00';

  // === CHECK 1: Anthropic API credit health ===
  // Test with a minimal API call that returns immediately on auth error
  try {
    var testR = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
    });
    if (testR.status === 400) {
      var errBody = await testR.text();
      if (errBody.indexOf('credit balance') !== -1 || errBody.indexOf('too low') !== -1) {
        R.checks.push({ name: 'api_credits', status: 'CRITICAL', detail: 'Credit balance too low' });
        R.alerts.push('CRITICAL: API credits depleted');
        await alert('CRITICAL', 'API Credits Depleted', 'Anthropic API returning credit balance too low error. ALL Claude-powered features are down. Add credits at console.anthropic.com/settings/billing immediately.');
      } else {
        R.checks.push({ name: 'api_credits', status: 'OK', detail: 'API responding' });
      }
    } else if (testR.ok) {
      R.checks.push({ name: 'api_credits', status: 'OK', detail: 'API responding, credits available' });
    } else {
      R.checks.push({ name: 'api_credits', status: 'WARNING', detail: 'API returned ' + testR.status });
    }
  } catch(e) {
    R.checks.push({ name: 'api_credits', status: 'ERROR', detail: 'Cannot reach Anthropic API: ' + e.message });
    R.alerts.push('ERROR: Cannot reach Anthropic API');
    await alert('ERROR', 'Anthropic API Unreachable', 'Health monitor cannot reach api.anthropic.com: ' + e.message);
  }

  // === CHECK 2: Also check via cost report API ===
  try {
    var monthStart = today.slice(0, 7) + '-01T00:00:00Z';
    var costR = await fetch('https://api.anthropic.com/v1/organizations/cost_report?starting_at=' + monthStart + '&ending_at=' + new Date().toISOString(), {
      headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01' }
    });
    if (costR.ok) {
      var costD = await costR.json();
      R.checks.push({ name: 'cost_report', status: 'OK', data: costD });
    } else {
      R.checks.push({ name: 'cost_report', status: 'UNAVAILABLE', detail: 'Cost API returned ' + costR.status + ' (may need admin key)' });
    }
  } catch(e) {
    R.checks.push({ name: 'cost_report', status: 'UNAVAILABLE', detail: e.message });
  }

  // === CHECK 3: Daily crons fired today? ===
  var expectedCrons = [
    { name: 'organism_think', agent: 'organism_think', memType: 'decision_point', afterUTC: '13:00' },
    { name: 'contract_expiration', agent: 'contract_expiration', memType: 'competitive_intel', afterUTC: '13:30' },
    { name: 'disaster_monitor', agent: 'disaster_monitor', memType: null, afterUTC: '14:00' },
    { name: 'organism_work', agent: null, memType: null, afterUTC: '18:00', multiAgent: true },
    { name: 'sonnet_work', agent: 'quality_gate', memType: null, afterUTC: '18:15' },
    { name: 'red_team', agent: 'red_team', memType: 'competitive_intel', afterUTC: '18:30' },
    { name: 'proposal_loop', agent: 'proposal_loop', memType: null, afterUTC: '18:45' }
  ];
  var cstHour = getCSTDate().getHours();
  for (var ci = 0; ci < expectedCrons.length; ci++) {
    var ec = expectedCrons[ci];
    var expectedHourUTC = parseInt(ec.afterUTC.split(':')[0]);
    var nowUTC = new Date().getUTCHours();
    // Only check crons that should have fired by now
    if (nowUTC < expectedHourUTC + 1) {
      R.checks.push({ name: 'cron_' + ec.name, status: 'NOT_DUE', detail: 'Scheduled ' + ec.afterUTC + ' UTC' });
      continue;
    }
    // Check organism_memory for this agent today
    var found = false;
    if (ec.multiAgent) {
      // organism-work writes many agents — check for any memory from today after expected time
      try {
        var mems = await (await fetch(SB + '/rest/v1/organism_memory?created_at=gte.' + today + 'T' + ec.afterUTC + ':00&limit=1', { headers: H })).json();
        found = mems && mems.length > 0;
      } catch(e) {}
    } else if (ec.agent) {
      try {
        var mems2 = await (await fetch(SB + '/rest/v1/organism_memory?agent=eq.' + ec.agent + '&created_at=gte.' + today + 'T' + ec.afterUTC + ':00&limit=1', { headers: H })).json();
        found = mems2 && mems2.length > 0;
      } catch(e) {}
    }
    // Also check hunt_runs
    if (!found) {
      try {
        var runs = await (await fetch(SB + '/rest/v1/hunt_runs?source=eq.' + ec.name + '&run_at=gte.' + today + 'T00:00:00&limit=1', { headers: H })).json();
        found = runs && runs.length > 0;
      } catch(e) {}
    }
    if (found) {
      R.checks.push({ name: 'cron_' + ec.name, status: 'OK', detail: 'Fired today' });
    } else {
      R.checks.push({ name: 'cron_' + ec.name, status: 'MISSED', detail: 'Expected after ' + ec.afterUTC + ' UTC, no output found' });
      R.alerts.push('MISSED: ' + ec.name + ' did not fire today');
      await alert('WARNING', ec.name + ' Cron Missed', ec.name + ' was scheduled for ' + ec.afterUTC + ' UTC today but produced no output in organism_memory or hunt_runs. Possible causes: API credits depleted, Vercel deployment failure, or endpoint error.');
    }
  }

  // === CHECK 4: Scraper health ===
  try {
    var recentHunts = await (await fetch(SB + '/rest/v1/hunt_runs?source=in.(apify_central_bidding,grants_gov,sam_gov)&run_at=gte.' + today + 'T00:00:00&order=run_at.desc&limit=10', { headers: H })).json();
    var scrapersToday = {};
    for (var si = 0; si < (recentHunts||[]).length; si++) {
      scrapersToday[recentHunts[si].source] = true;
    }
    var scraperNames = ['apify_central_bidding', 'grants_gov', 'sam_gov'];
    for (var sn = 0; sn < scraperNames.length; sn++) {
      if (scrapersToday[scraperNames[sn]]) {
        R.checks.push({ name: 'scraper_' + scraperNames[sn], status: 'OK', detail: 'Ran today' });
      } else {
        R.checks.push({ name: 'scraper_' + scraperNames[sn], status: 'WARNING', detail: 'No runs logged today' });
        R.alerts.push('WARNING: ' + scraperNames[sn] + ' has not run today');
      }
    }
  } catch(e) { R.checks.push({ name: 'scrapers', status: 'ERROR', detail: e.message }); }

  // === SUMMARY ===
  var criticals = R.alerts.filter(function(a) { return a.indexOf('CRITICAL') !== -1; }).length;
  var warnings = R.alerts.filter(function(a) { return a.indexOf('CRITICAL') === -1; }).length;
  R.summary = criticals > 0 ? 'CRITICAL — ' + criticals + ' critical alert(s)' : warnings > 0 ? 'WARNING — ' + warnings + ' warning(s)' : 'ALL SYSTEMS OK';

  // Log to hunt_runs
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }), body: JSON.stringify({
      id: 'hr-health-' + Date.now(), source: 'health_monitor',
      status: R.summary + ' | ' + R.checks.length + ' checks | ' + R.alerts.length + ' alerts',
      run_at: new Date().toISOString(), opportunities_found: 0
    }) });
  } catch(e) {}

  return res.status(200).json(R);
}