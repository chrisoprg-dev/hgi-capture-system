// api/scrape-georgia.js — Georgia state procurement scraper
// Source: Georgia Procurement Registry (GPR) — public, no auth required
// Runs 2x daily via Vercel cron
import { HGI_KEYWORDS } from './hgi-master-context.js';
export const config = { maxDuration: 60 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var INTAKE = 'https://hgi-capture-system.vercel.app/api/intake';
var INTAKE_SECRET = process.env.INTAKE_SECRET;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

// Georgia-specific keyword set — focused on HGI verticals most likely in GA market
var GA_KEYWORDS = [
  'claims administration', 'third party administrator',
  'program management', 'grant management', 'grant administration',
  'workers compensation administration', 'TPA services',
  'disaster recovery', 'housing program management',
  'workforce development services', 'case management services',
  'settlement administration', 'insurance administration'
];

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s{2,}/g, ' ').trim();
}

async function searchGeorgia(keyword) {
  try {
    // Georgia Team Works procurement search
    var url = 'https://ssl.doas.state.ga.us/gpr/index.cfm?action=searchsolicitations&solicitationNumber=&solType=ALL&keyword=' + encodeURIComponent(keyword) + '&dept=&openonly=true';
    var r = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return [];
    var html = await r.text();
    var results = [];
    // Parse table rows from Georgia GPR results
    var rowRegex = /<tr[^>]*class=["']?result[^"']*["']?[^>]*>([\s\S]*?)<\/tr>/gi;
    var cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    var hrefRegex = /href=["']([^"']+)["']/i;
    // Georgia GPR uses standard table — extract all rows with 4+ cells
    var allRows = html.match(/<tr[^>]*>(?:[\s\S]*?<td[\s\S]*?){4,}[\s\S]*?<\/tr>/gi) || [];
    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];
      var cells = [];
      var m;
      var re2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((m = re2.exec(row)) !== null) cells.push(stripHtml(m[1]));
      // Skip header rows and empty rows
      if (cells.length >= 3 && cells[0].length > 5 && !cells[0].toLowerCase().includes('solicitation')) {
        var hrefM = hrefRegex.exec(row);
        var detailUrl = hrefM ? ('https://ssl.doas.state.ga.us' + hrefM[1]) : 'https://ssl.doas.state.ga.us/gpr/';
        results.push({
          title: cells[0] || cells[1] || '',
          agency: cells[1] || cells[2] || 'Georgia Agency',
          deadline: cells[cells.length - 1] || '',
          sol_number: cells[2] || '',
          url: detailUrl,
          keyword: keyword
        });
      }
    }
    return results.filter(function(r2) { return r2.title.length > 5; });
  } catch(e) { return []; }
}

async function sendToIntake(bid) {
  try {
    var r = await fetch(INTAKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-intake-secret': INTAKE_SECRET },
      body: JSON.stringify({
        source: 'georgia_gpr',
        source_id: bid.sol_number || bid.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60),
        title: bid.title,
        agency: bid.agency,
        url: bid.url,
        state: 'GA',
        response_deadline: bid.deadline,
        description: 'Georgia procurement: ' + bid.title + '. Agency: ' + bid.agency + '. Found via keyword: ' + bid.keyword,
        rfp_text: 'Georgia GPR: ' + bid.title + ' | Agency: ' + bid.agency + ' | Deadline: ' + bid.deadline + ' | Source keyword: ' + bid.keyword
      })
    });
    var d = await r.json();
    return { title: bid.title, status: d.success ? 'ingested' : (d.skipped ? 'skipped' : 'error'), opi: d.opi_score };
  } catch(e) { return { title: bid.title, status: 'error', error: e.message }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { source: 'georgia_gpr', started: new Date().toISOString(), keywords_searched: 0, found: 0, ingested: 0, skipped: 0, errors: 0, details: [] };
  var seenTitles = new Set();
  var allBids = [];
  for (var i = 0; i < GA_KEYWORDS.length; i++) {
    results.keywords_searched++;
    var bids = await searchGeorgia(GA_KEYWORDS[i]);
    for (var j = 0; j < bids.length; j++) {
      var key = bids[j].title.toLowerCase().slice(0, 50);
      if (!seenTitles.has(key)) { seenTitles.add(key); allBids.push(bids[j]); }
    }
  }
  results.found = allBids.length;
  var batch = allBids.slice(0, 15);
  for (var k = 0; k < batch.length; k++) {
    var ir = await sendToIntake(batch[k]);
    results.details.push(ir);
    if (ir.status === 'ingested') results.ingested++;
    else if (ir.status === 'skipped') results.skipped++;
    else results.errors++;
  }
  results.completed = new Date().toISOString();
  try {
    await fetch(SB + '/rest/v1/hunt_runs', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ source: 'scrape_georgia', status: 'found:' + results.found + '|in:' + results.ingested + '|skip:' + results.skipped, run_at: new Date().toISOString(), opportunities_found: results.ingested }) });
  } catch(e) {}
  return res.status(200).json(results);
}