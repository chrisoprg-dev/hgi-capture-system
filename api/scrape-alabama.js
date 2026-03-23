// api/scrape-alabama.js — Alabama state procurement scraper
// Source: Alabama Purchasing Division public bid search (no auth required)
// Runs 2x daily via Vercel cron
import { HGI_KEYWORDS } from './hgi-master-context.js';
export const config = { maxDuration: 60 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var INTAKE = 'https://hgi-capture-system.vercel.app/api/intake';
var INTAKE_SECRET = process.env.INTAKE_SECRET;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

// Alabama IB search uses form POST — top HGI-relevant keywords only (avoid hammering)
var AL_KEYWORDS = [
  'claims administration', 'third party administrator', 'TPA',
  'program management', 'grant management', 'workers compensation',
  'disaster recovery', 'housing program', 'workforce development',
  'WIOA', 'property management', 'insurance administration'
];

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

async function searchAlabama(keyword) {
  try {
    var params = new URLSearchParams({ stype: 'ALL', category: '', keywords: keyword, agency: '' });
    var r = await fetch('https://purchasing.alabama.gov/ibs/ibs_search_result.cfm?' + params.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return [];
    var html = await r.text();
    // Parse bid rows — Alabama IB results are in a table with class="bids"
    var results = [];
    // Match bid entries: title, agency, deadline, bid number from table rows
    var rowRegex = /<tr[^>]*class=["']?bid[^"']*["']?[^>]*>([\s\S]*?)<\/tr>/gi;
    var cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    var hrefRegex = /href=["']([^"']+)["']/i;
    var rows = html.match(/<tr[^>]*>[\s\S]*?<td[\s\S]*?<\/tr>/gi) || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];
      var cm;
      var re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((cm = re.exec(row)) !== null) cells.push(stripHtml(cm[1]));
      if (cells.length >= 3 && cells[0].length > 5) {
        var hrefM = hrefRegex.exec(row);
        var url = hrefM ? ('https://purchasing.alabama.gov' + hrefM[1]) : '';
        results.push({ title: cells[0] || '', agency: cells[1] || 'Alabama Agency', deadline: cells[2] || '', bid_number: cells[3] || '', url: url, keyword: keyword });
      }
    }
    return results;
  } catch(e) { return []; }
}

async function sendToIntake(bid) {
  try {
    var r = await fetch(INTAKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-intake-secret': INTAKE_SECRET },
      body: JSON.stringify({
        source: 'alabama_purchasing',
        source_id: bid.bid_number || bid.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60),
        title: bid.title,
        agency: bid.agency,
        url: bid.url || 'https://purchasing.alabama.gov/ibs/ibs_current_bids.cfm',
        state: 'AL',
        response_deadline: bid.deadline,
        description: 'Alabama state procurement: ' + bid.title + '. Agency: ' + bid.agency + '. Found via keyword: ' + bid.keyword,
        rfp_text: 'Alabama procurement: ' + bid.title + ' | Agency: ' + bid.agency + ' | Deadline: ' + bid.deadline + ' | Source keyword: ' + bid.keyword
      })
    });
    var d = await r.json();
    return { title: bid.title, status: d.success ? 'ingested' : (d.skipped ? 'skipped' : 'error'), opi: d.opi_score };
  } catch(e) { return { title: bid.title, status: 'error', error: e.message }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var results = { source: 'alabama_purchasing', started: new Date().toISOString(), keywords_searched: 0, found: 0, ingested: 0, skipped: 0, errors: 0, details: [] };
  var seenTitles = new Set();
  var allBids = [];
  for (var i = 0; i < AL_KEYWORDS.length; i++) {
    results.keywords_searched++;
    var bids = await searchAlabama(AL_KEYWORDS[i]);
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
      body: JSON.stringify({ source: 'scrape_alabama', status: 'found:' + results.found + '|in:' + results.ingested + '|skip:' + results.skipped, run_at: new Date().toISOString(), opportunities_found: results.ingested }) });
  } catch(e) {}
  return res.status(200).json(results);
}