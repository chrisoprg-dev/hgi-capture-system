export const config = { maxDuration: 60 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
var D = String.fromCharCode(36);

// CONFIRMED HGI DATA ONLY — never fabricate
var HGI = {
  name: 'HGI Global, Inc.',
  legal: 'Hammerman & Gainer LLC',
  founded: '~1929',
  years: '96',
  address: '2400 Veterans Memorial Blvd, Suite 510, Kenner, LA 70062',
  phone: '504-982-5030',
  uei: 'DL4SJEVKZ6H4',
  ownership: '100% Minority-Owned',
  staff: '67 FT + 43 Contract Professionals',
  offices: 'Kenner (HQ), Shreveport, Alexandria, New Orleans',
  insurance: D+'5M Fidelity Bond, '+D+'5M E&O, '+D+'2M GL'
};

var RATES = [
  ['Principal',220],['Program Director',210],['Subject Matter Expert',200],
  ['Sr Grant Manager',180],['Grant Manager',175],['Sr Project Manager',180],
  ['Project Manager',155],['Grant Writer',145],['Architect/Engineer',135],
  ['Cost Estimator',125],['Appeals Specialist',145],['Sr Damage Assessor',115],
  ['Damage Assessor',105],['Administrative Support',65]
];

var PP = [
  {name:'Road Home Program',client:'Louisiana Recovery Authority',value:D+'67M direct / '+D+'13B+ program',period:'2006-2015',outcome:'Zero misappropriation. 130,000+ families served. Largest disaster recovery program in U.S. history.'},
  {name:'Restore Louisiana',client:'Louisiana OCD',value:D+'42.3M',period:'2017-2021',outcome:'CDBG-DR program administration. HUD compliance. Homeowner assistance and infrastructure.'},
  {name:'Rebuild New Jersey',client:'State of New Jersey',value:D+'67.7M',period:'Post-Sandy',outcome:'Multi-state disaster recovery capability demonstrated.'},
  {name:'HAP',client:'State of Louisiana',value:D+'950M',period:'Post-Katrina',outcome:'Homeowner Assistance Program. Massive scale program delivery.'},
  {name:'Terrebonne Parish Schools',client:'TPSB',value:D+'2.96M',period:'2022-2025 (Completed)',outcome:'Post-Hurricane Ida construction management. FEMA PA coordination. 100% reimbursement.'},
  {name:'BP GCCF',client:'BP / Gulf Coast Claims',value:'1M+ Claims',period:'2010-2013',outcome:'Rapid mobilization. Complex federal oversight. Kenneth Feinberg program.'},
  {name:'St. John Sheriff',client:'St. John the Baptist Parish',value:D+'788K',period:'Post-disaster',outcome:'Parish-level disaster recovery coordination.'}
];

var GOLD = '#C9A84C';
var NAVY = '#1B3A5C';
var WHITE = '#FFFFFF';
var LIGHT = '#F8F6F0';

function esc(s) { return (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildOrgChart(staffingPlan, scopeAnalysis) {
  // Extract positions from the proposal/scope — look for common RFP role patterns
  var positions = [];
  var text = (staffingPlan || '') + '\n' + (scopeAnalysis || '');
  var rateMap = {};
  for (var i = 0; i < RATES.length; i++) rateMap[RATES[i][0].toLowerCase()] = RATES[i][1];
  
  // Try to find position/rate table in staffing plan
  var lines = text.split('\n');
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j];
    // Match patterns like "Program Director | $210" or "**Program Director** | $205/hr"
    var m = line.match(/(Program Director|Senior PM|Senior Project Manager|Project Manager|PA SME|Public Assistance SME|Subject Matter Expert|HM Specialist|Hazard Mitigation|Grant Financial|Financial Specialist|Documentation Manager|Admin|Administrative Support|Construction Manager|Resident Inspector|Grant Writer|Cost Estimator|Damage Assessor)/i);
    if (m) {
      var title = m[1];
      var rateMatch = line.match(/\$([\d,.]+)/);
      var rate = rateMatch ? parseInt(rateMatch[1].replace(/,/g,'')) : null;
      // Avoid duplicates
      var dup = false;
      for (var k = 0; k < positions.length; k++) {
        if (positions[k].title.toLowerCase() === title.toLowerCase()) { dup = true; break; }
      }
      if (!dup) positions.push({ title: title, rate: rate });
    }
  }
  
  // If no positions found, use defaults from rate card
  if (positions.length < 3) {
    positions = [
      {title:'Program Director',rate:210},{title:'Sr Project Manager',rate:180},
      {title:'Project Manager',rate:155},{title:'Subject Matter Expert',rate:200},
      {title:'Grant Writer',rate:145},{title:'Administrative Support',rate:65}
    ];
  }
  
  // Build tiered org chart: first position = top, next 2-3 = middle, rest = bottom
  var top = positions[0];
  var mid = positions.slice(1, Math.min(4, positions.length));
  var bot = positions.slice(4);
  
  var html = '<div class="org">';
  html += '<div class="org-level"><div class="org-box exec"><div class="org-title">' + esc(top.title) + '</div><div class="org-rate">' + (top.rate ? D+top.rate+'/hr' : 'TBD') + '</div></div></div>';
  html += '<div class="org-connector"></div>';
  if (mid.length) {
    html += '<div class="org-level">';
    for (var m2 = 0; m2 < mid.length; m2++) {
      html += '<div class="org-box"><div class="org-title">' + esc(mid[m2].title) + '</div><div class="org-rate">' + (mid[m2].rate ? D+mid[m2].rate+'/hr' : 'TBD') + '</div></div>';
    }
    html += '</div>';
  }
  if (bot.length) {
    html += '<div class="org-connector"></div>';
    html += '<div class="org-level">';
    for (var b = 0; b < bot.length; b++) {
      html += '<div class="org-box"><div class="org-title">' + esc(bot[b].title) + '</div><div class="org-rate">' + (bot[b].rate ? D+bot[b].rate+'/hr' : 'TBD') + '</div></div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function buildPPTiles(agency, vertical) {
  // Select most relevant past performance based on vertical
  var selected = PP;
  if (vertical && vertical.includes('disaster')) {
    selected = PP.filter(function(p) { return ['Road Home','Restore Louisiana','Rebuild New Jersey','Terrebonne Parish','HAP','St. John Sheriff'].indexOf(p.name.split(' ')[0]+' '+p.name.split(' ')[1]) !== -1 || p.name === 'Road Home Program'; });
  }
  selected = selected.slice(0, 6);
  var html = '<div class="pp-grid">';
  for (var i = 0; i < selected.length; i++) {
    var p = selected[i];
    html += '<div class="pp-card"><div class="pp-name">' + esc(p.name) + '</div>';
    html += '<div class="pp-client">' + esc(p.client) + ' | ' + esc(p.period) + '</div>';
    html += '<div class="pp-value">' + esc(p.value) + '</div>';
    html += '<div class="pp-outcome">' + esc(p.outcome) + '</div></div>';
  }
  html += '</div>';
  return html;
}

function buildRateTable(staffingPlan) {
  // Try to extract RFP-specific rates from staffing plan, fall back to standard
  var rows = '';
  for (var i = 0; i < RATES.length; i++) {
    rows += '<tr><td>' + esc(RATES[i][0]) + '</td><td class="rate">' + D + RATES[i][1] + '/hr</td></tr>';
  }
  return '<table><thead><tr><th>Position</th><th>Fully Burdened Rate</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function buildProcessFlow(vertical) {
  var steps;
  if (vertical && vertical.includes('disaster')) {
    steps = ['Activation & Deployment','Damage Assessment','PW Development & Optimization','FEMA Submission & Negotiation','Obligation & Funding','Implementation Oversight','Compliance & Audit','Closeout'];
  } else if (vertical && vertical.includes('grant')) {
    steps = ['Needs Assessment','Grant Research & Identification','Application Development','Award Management','Compliance Monitoring','Reporting','Closeout'];
  } else {
    steps = ['Assessment','Planning','Execution','Monitoring','Compliance','Reporting','Closeout'];
  }
  var html = '<div class="process">';
  for (var i = 0; i < steps.length; i++) {
    html += '<div class="step"><div class="step-num">' + (i+1) + '</div><div class="step-label">' + esc(steps[i]) + '</div></div>';
    if (i < steps.length - 1) html += '<div class="arrow">\u2192</div>';
  }
  html += '</div>';
  return html;
}

function buildComplianceMatrix(scopeAnalysis) {
  if (!scopeAnalysis || scopeAnalysis.length < 100) return '';
  // Extract eval criteria if present
  var html = '<div class="compliance"><h3 class="h3">Evaluation Criteria Alignment</h3><table class="eval-table"><thead><tr><th>Criterion</th><th>Weight</th><th>HGI Response</th><th>Strength</th></tr></thead><tbody>';
  // Look for eval criteria pattern
  var techMatch = scopeAnalysis.match(/Technical[^\d]*(\d+)/i);
  var expMatch = scopeAnalysis.match(/Experience[^\d]*(\d+)/i);
  var ppMatch = scopeAnalysis.match(/Past Performance[^\d]*(\d+)/i);
  var staffMatch = scopeAnalysis.match(/Staff[^\d]*(\d+)/i);
  var priceMatch = scopeAnalysis.match(/Price[^\d]*(\d+)/i);
  
  if (techMatch) html += '<tr><td>Technical Approach</td><td>' + techMatch[1] + ' pts</td><td>FEMA PA methodology, CDBG-DR expertise, compliance framework</td><td class="strong">\u2605\u2605\u2605\u2605</td></tr>';
  if (expMatch) html += '<tr><td>Experience</td><td>' + expMatch[1] + ' pts</td><td>' + HGI.years + ' years, Road Home ' + D + '13B+, multi-state operations</td><td class="strong">\u2605\u2605\u2605\u2605\u2605</td></tr>';
  if (ppMatch) html += '<tr><td>Past Performance</td><td>' + ppMatch[1] + ' pts</td><td>7 confirmed references, zero misappropriation record</td><td class="strong">\u2605\u2605\u2605\u2605\u2605</td></tr>';
  if (staffMatch) html += '<tr><td>Staffing</td><td>' + staffMatch[1] + ' pts</td><td>' + HGI.staff + ' across 4 Louisiana offices</td><td class="strong">\u2605\u2605\u2605</td></tr>';
  if (priceMatch) html += '<tr><td>Price</td><td>' + priceMatch[1] + ' pts</td><td>Competitive fully-burdened rates, firm 3 years</td><td class="strong">\u2605\u2605\u2605</td></tr>';
  html += '</tbody></table></div>';
  return (techMatch || expMatch) ? html : '';
}

function md(text) {
  if (!text) return '';
  return text
    .replace(/^### (.+)$/gm, '<h4 class="h4">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="h3">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="h2">$1</h2>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/\|[^\n]+\|/gm, function(row) {
      var cells = row.split('|').filter(function(c){return c.trim();});
      return '<tr>' + cells.map(function(c){return '<td>'+c.trim()+'</td>';}).join('') + '</tr>';
    })
    .replace(/^\- \*\*(.+?)\*\*(.*)$/gm, '<div class="bl"><strong>$1</strong>$2</div>')
    .replace(/^\- (.+)$/gm, '<div class="bl">$1</div>')
    .replace(/^\* (.+)$/gm, '<div class="bl">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var id = req.query.id;
  if (!id) return res.status(400).send('Add ?id=OPPORTUNITY_ID to the URL');

  var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(id) + '&limit=1', { headers: H });
  var opps = await oppR.json();
  if (!opps || !opps.length) return res.status(404).send('Opportunity not found');
  var o = opps[0];

  // Load organism memory for this opportunity
  var memR = await fetch(SB + '/rest/v1/organism_memory?opportunity_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc&limit=10&select=agent,observation', { headers: H });
  var mems = [];
  try { mems = await memR.json(); } catch(e) {}

  var dueDate = o.due_date ? new Date(o.due_date).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : 'TBD';
  var vertical = o.vertical || 'professional services';
  var verticalTitle = vertical.includes('disaster') ? 'Disaster Recovery Program Management Services' : vertical.includes('grant') ? 'Grant Management & Administration Services' : 'Professional Services';

  var css = '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&display=swap");'
    + '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }'
    + 'body { font-family: "Outfit", sans-serif; color: #222; line-height: 1.65; background: '+WHITE+'; font-weight: 400; }'
    + '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } .page-break { page-break-before: always; } }'
    + '.cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: linear-gradient(160deg, '+NAVY+' 0%, #0D1F33 50%, #0A1628 100%); color: white; text-align: center; position: relative; overflow: hidden; page-break-after: always; }'
    + '.cover::before { content: ""; position: absolute; top: -30%; right: -20%; width: 70%; height: 160%; background: radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 65%); pointer-events: none; }'
    + '.cover::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, transparent, '+GOLD+', transparent); }'
    + '.cover-badge { display: inline-block; padding: 6px 24px; border: 1px solid rgba(201,168,76,0.4); border-radius: 2px; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: '+GOLD+'; margin-bottom: 36px; font-weight: 500; }'
    + '.cover-title { font-family: "Cormorant Garamond", serif; font-size: 44px; font-weight: 700; line-height: 1.15; max-width: 750px; margin-bottom: 16px; letter-spacing: -0.5px; }'
    + '.cover-sub { font-size: 18px; font-weight: 300; color: rgba(255,255,255,0.55); max-width: 600px; margin-bottom: 48px; letter-spacing: 0.3px; }'
    + '.cover-divider { width: 60px; height: 2px; background: '+GOLD+'; margin: 0 auto 40px; }'
    + '.cover-meta { font-size: 13px; color: rgba(255,255,255,0.4); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px; }'
    + '.cover-agency { font-family: "Cormorant Garamond", serif; font-size: 28px; font-weight: 700; margin-bottom: 48px; }'
    + '.cover-hgi { font-family: "Cormorant Garamond", serif; font-size: 38px; font-weight: 800; color: '+GOLD+'; margin-bottom: 4px; }'
    + '.cover-legal { font-size: 14px; color: rgba(255,255,255,0.5); font-weight: 300; margin-bottom: 6px; }'
    + '.cover-date { font-size: 15px; font-weight: 500; margin-top: 32px; }'
    + '.content { max-width: 920px; margin: 0 auto; padding: 60px 48px; }'
    + 'h2.sec { font-family: "Cormorant Garamond", serif; font-size: 26px; color: '+NAVY+'; margin: 52px 0 16px; padding-bottom: 8px; border-bottom: 2px solid '+GOLD+'; letter-spacing: -0.3px; }'
    + 'h3.h3 { font-size: 17px; font-weight: 600; color: '+NAVY+'; margin: 28px 0 10px; }'
    + 'h4.h4 { font-size: 14px; font-weight: 600; color: #555; margin: 16px 0 6px; }'
    + 'p { margin-bottom: 14px; font-size: 14.5px; line-height: 1.75; color: #333; }'
    + '.bl { padding: 5px 0 5px 14px; border-left: 2px solid '+GOLD+'; margin-bottom: 7px; font-size: 13.5px; color: #444; }'
    + 'hr { border: none; border-top: 1px solid #e5e5e5; margin: 20px 0; }'
    + '.stats { display: flex; gap: 0; margin: 36px 0; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }'
    + '.stat { flex: 1; padding: 22px 12px; text-align: center; background: '+NAVY+'; color: white; }'
    + '.stat:nth-child(even) { background: #234B6E; }'
    + '.stat-num { font-family: "Cormorant Garamond", serif; font-size: 30px; font-weight: 800; color: '+GOLD+'; }'
    + '.stat-label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-top: 3px; font-weight: 500; }'
    + '.process { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; margin: 28px 0; padding: 20px; background: '+LIGHT+'; border-radius: 6px; border: 1px solid #e8e4dc; }'
    + '.step { text-align: center; min-width: 80px; }'
    + '.step-num { width: 32px; height: 32px; border-radius: 50%; background: '+NAVY+'; color: '+GOLD+'; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; margin: 0 auto 5px; }'
    + '.step-label { font-size: 10px; font-weight: 600; color: '+NAVY+'; letter-spacing: 0.3px; line-height: 1.3; }'
    + '.arrow { color: '+GOLD+'; font-size: 18px; font-weight: 700; margin-top: -8px; }'
    + '.pp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0; }'
    + '.pp-card { background: '+LIGHT+'; border-radius: 6px; padding: 16px; border-left: 3px solid '+GOLD+'; }'
    + '.pp-name { font-weight: 700; color: '+NAVY+'; font-size: 14px; margin-bottom: 2px; }'
    + '.pp-client { font-size: 11px; color: #999; margin-bottom: 6px; }'
    + '.pp-value { font-family: "Cormorant Garamond", serif; font-size: 22px; font-weight: 800; color: '+GOLD+'; margin-bottom: 3px; }'
    + '.pp-outcome { font-size: 12px; color: #555; line-height: 1.5; }'
    + 'table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }'
    + 'th { background: '+NAVY+'; color: white; padding: 9px 12px; text-align: left; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600; }'
    + 'td { padding: 8px 12px; border-bottom: 1px solid #eee; }'
    + 'td.rate { font-weight: 700; color: '+NAVY+'; font-size: 15px; }'
    + 'tr:nth-child(even) td { background: '+LIGHT+'; }'
    + '.eval-table td.strong { color: '+GOLD+'; font-size: 16px; letter-spacing: 2px; }'
    + '.org { margin: 28px 0; text-align: center; }'
    + '.org-level { display: flex; justify-content: center; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }'
    + '.org-box { background: '+NAVY+'; color: white; border-radius: 5px; padding: 9px 14px; min-width: 130px; }'
    + '.org-box.exec { background: linear-gradient(135deg, '+GOLD+', #B8933F); color: '+NAVY+'; }'
    + '.org-title { font-weight: 700; font-size: 12px; }'
    + '.org-rate { font-size: 10px; opacity: 0.7; }'
    + '.org-connector { width: 2px; height: 12px; background: '+GOLD+'; margin: 0 auto; }'
    + '.callout { background: linear-gradient(135deg, '+NAVY+', #1D3D5E); color: white; border-radius: 6px; padding: 24px 28px; margin: 32px 0; border-left: 4px solid '+GOLD+'; }'
    + '.callout-label { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: '+GOLD+'; margin-bottom: 6px; font-weight: 600; }'
    + '.callout-text { font-size: 16px; font-weight: 300; line-height: 1.6; } .callout-text strong { color: '+GOLD+'; }'
    + '.hdr { padding: 14px 48px; border-bottom: 2px solid '+GOLD+'; display: flex; justify-content: space-between; align-items: center; }'
    + '.hdr-logo { font-family: "Cormorant Garamond", serif; font-size: 16px; font-weight: 800; color: '+GOLD+'; }'
    + '.hdr-title { font-size: 11px; color: #aaa; font-weight: 400; }'
    + '.ftr { padding: 10px 48px; border-top: 1px solid #eee; text-align: center; font-size: 10px; color: #bbb; margin-top: 40px; }'
    + '.print-bar { position: fixed; top: 0; left: 0; right: 0; background: '+NAVY+'; padding: 10px 20px; display: flex; gap: 10px; z-index: 999; }'
    + '.print-bar button { padding: 8px 20px; background: '+GOLD+'; color: '+NAVY+'; border: none; border-radius: 4px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }'
    + '.print-bar button:hover { background: #B8933F; }'
    + '.print-bar .info { color: rgba(255,255,255,0.6); font-size: 12px; line-height: 36px; margin-left: auto; }'
    + '@media print { .print-bar { display: none !important; } body { padding-top: 0 !important; } }'
    + 'body { padding-top: 52px; }';

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HGI Proposal — ' + esc(o.agency||'') + '</title><style>' + css + '</style></head><body>';

  // PRINT BAR
  html += '<div class="print-bar no-print"><button onclick="window.print()">Print / Save PDF</button><button onclick="document.querySelectorAll(\'.page-break\').forEach(function(e){e.style.display=\'none\'});alert(\'Page breaks removed for continuous view\')">Continuous View</button><div class="info">HGI Proposal Graphics Engine v1 | ' + esc(o.title||'') + '</div></div>';

  // COVER
  html += '<div class="cover"><div class="cover-badge">Proposal</div>';
  html += '<div class="cover-title">' + esc(verticalTitle) + '</div>';
  html += '<div class="cover-sub">' + esc(o.title||'') + '</div>';
  html += '<div class="cover-divider"></div>';
  html += '<div class="cover-meta">Submitted To</div>';
  html += '<div class="cover-agency">' + esc(o.agency||'') + '</div>';
  html += '<div class="cover-meta">Submitted By</div>';
  html += '<div class="cover-hgi">' + HGI.name + '</div>';
  html += '<div class="cover-legal">' + HGI.legal + ' \u2014 ' + HGI.ownership + ' \u2014 Est. ' + HGI.founded + '</div>';
  html += '<div class="cover-date">Due: ' + esc(dueDate) + '</div>';
  html += '</div>';

  // HEADER
  html += '<div class="hdr"><div class="hdr-logo">HGI Global</div><div class="hdr-title">' + esc(o.agency||'') + ' \u2014 ' + esc(verticalTitle) + '</div></div>';

  html += '<div class="content">';

  // STATS BAR
  html += '<div class="stats">';
  html += '<div class="stat"><div class="stat-num">' + HGI.years + '</div><div class="stat-label">Years in Business</div></div>';
  html += '<div class="stat"><div class="stat-num">'+D+'13B+</div><div class="stat-label">Federal Programs Managed</div></div>';
  html += '<div class="stat"><div class="stat-num">0</div><div class="stat-label">Misappropriations</div></div>';
  html += '<div class="stat"><div class="stat-num">110+</div><div class="stat-label">Professionals</div></div>';
  html += '<div class="stat"><div class="stat-num">4</div><div class="stat-label">Louisiana Offices</div></div>';
  html += '</div>';

  // VALUE CALLOUT
  html += '<div class="callout"><div class="callout-label">Key Differentiator</div>';
  html += '<div class="callout-text">HGI\'s approach to federal program management has delivered <strong>zero misappropriation across '+D+'13 billion+</strong> in administered funds \u2014 an unmatched compliance record spanning nearly a century of fiduciary service to Louisiana and beyond.</div></div>';

  // EVAL CRITERIA ALIGNMENT (dynamic from scope)
  var evalMatrix = buildComplianceMatrix(o.scope_analysis || '');
  if (evalMatrix) {
    html += '<h2 class="sec">Evaluation Criteria Alignment</h2>' + evalMatrix;
  }

  // PROCESS FLOW
  html += '<h2 class="sec">Methodology</h2>' + buildProcessFlow(vertical);

  // ORG CHART
  html += '<h2 class="sec">Proposed Team Structure</h2>' + buildOrgChart(o.staffing_plan, o.scope_analysis);

  // PAST PERFORMANCE
  html += '<div class="page-break"></div>';
  html += '<h2 class="sec">Past Performance</h2>' + buildPPTiles(o.agency, vertical);

  // RATE TABLE
  html += '<h2 class="sec">Pricing \u2014 Fully Burdened Rates</h2>';
  html += '<p>All rates include labor, benefits, overhead, G&A, and profit. Rates remain firm for the base contract period.</p>';
  html += buildRateTable(o.staffing_plan);

  // TECHNICAL APPROACH (from staffing_plan which holds the proposal)
  if (o.staffing_plan && o.staffing_plan.length > 500) {
    html += '<div class="page-break"></div>';
    html += '<h2 class="sec">Technical Approach</h2>';
    // Extract just the technical approach section
    var techSection = o.staffing_plan.match(/(?:TECHNICAL APPROACH|4\.\s*TECHNICAL)[\s\S]*?(?=##\s*\d+\.|##\s*[A-Z]|$)/i);
    if (techSection) {
      html += '<div>' + md(techSection[0].slice(0, 4000)) + '</div>';
    } else {
      html += '<div>' + md(o.staffing_plan.slice(0, 3000)) + '</div>';
    }
  }

  // COMPANY PROFILE
  html += '<div class="page-break"></div>';
  html += '<h2 class="sec">Corporate Profile</h2>';
  html += '<table><tbody>';
  html += '<tr><td><strong>Legal Name</strong></td><td>' + HGI.legal + '</td></tr>';
  html += '<tr><td><strong>DBA</strong></td><td>' + HGI.name + '</td></tr>';
  html += '<tr><td><strong>Established</strong></td><td>' + HGI.founded + ' (' + HGI.years + ' years)</td></tr>';
  html += '<tr><td><strong>Ownership</strong></td><td>' + HGI.ownership + '</td></tr>';
  html += '<tr><td><strong>Headquarters</strong></td><td>' + HGI.address + '</td></tr>';
  html += '<tr><td><strong>Offices</strong></td><td>' + HGI.offices + '</td></tr>';
  html += '<tr><td><strong>Staff</strong></td><td>' + HGI.staff + '</td></tr>';
  html += '<tr><td><strong>SAM UEI</strong></td><td>' + HGI.uei + '</td></tr>';
  html += '<tr><td><strong>Insurance</strong></td><td>' + HGI.insurance + '</td></tr>';
  html += '</tbody></table>';

  html += '</div>';

  // FOOTER
  html += '<div class="ftr">CONFIDENTIAL \u2014 ' + HGI.name + ' | ' + HGI.legal + ' | ' + HGI.address + ' | ' + HGI.phone + '</div>';

  html += '</body></html>';

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}