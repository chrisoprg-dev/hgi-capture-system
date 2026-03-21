export const config = { maxDuration: 60 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
var D = String.fromCharCode(36);
var HGI = { name:'HGI Global, Inc.', legal:'Hammerman & Gainer LLC', founded:'~1929', years:'96', address:'2400 Veterans Memorial Blvd, Suite 510, Kenner, LA 70062', phone:'504-982-5030', uei:'DL4SJEVKZ6H4', ownership:'100% Minority-Owned', staff:'67 FT + 43 Contract Professionals', offices:'Kenner (HQ), Shreveport, Alexandria, New Orleans', insurance:D+'5M Fidelity Bond, '+D+'5M E&O, '+D+'2M GL' };
var GOLD='#C9A84C',NAVY='#1B3A5C',WHITE='#FFFFFF',LIGHT='#F8F6F0';
function esc(s){return(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function renderSection(title, content, sectionNum) {
  var html = '<div class="section">';
  html += '<div class="sec-header"><span class="sec-num">'+sectionNum+'</span><h2 class="sec-title">'+esc(title)+'</h2></div>';
  html += '<div class="sec-body">' + renderContent(content, title) + '</div></div>';
  return html;
}

function renderContent(text, sectionTitle) {
  if (!text) return '';
  var lower = (sectionTitle||'').toLowerCase();
  // Detect tables and render them professionally
  var lines = text.split('\n');
  var html = '';
  var inTable = false;
  var tableRows = [];
  var isFirstRow = true;
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Table detection
    if (line.trim().indexOf('|') === 0 || (line.indexOf('|') > -1 && line.trim().split('|').length >= 3)) {
      if (line.replace(/[|\-\s]/g,'').length < 2) continue; // separator row
      var cells = line.split('|').filter(function(c){return c.trim();});
      if (!inTable) { inTable = true; tableRows = []; isFirstRow = true; }
      tableRows.push({ cells: cells, isHeader: isFirstRow });
      isFirstRow = false;
      continue;
    }
    if (inTable) {
      html += buildTable(tableRows, lower);
      inTable = false; tableRows = []; isFirstRow = true;
    }
    // Headers
    if (line.match(/^###\s+/)) { html += '<h4 class="h4">' + renderInline(line.replace(/^###\s+/,'')) + '</h4>'; continue; }
    if (line.match(/^##\s+/)) { html += '<h3 class="h3">' + renderInline(line.replace(/^##\s+/,'')) + '</h3>'; continue; }
    if (line.match(/^#\s+/)) continue; // skip top-level headers, we use sec-header
    if (line.match(/^---$/)) { html += '<hr class="divider"/>'; continue; }
    // Bullet points
    if (line.match(/^\s*[-*]\s+\*\*/)) {
      var bm = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*(.*)/);
      if (bm) { html += '<div class="bullet"><strong>'+renderInline(bm[1])+'</strong>'+renderInline(bm[2])+'</div>'; continue; }
    }
    if (line.match(/^\s*[-*]\s+/)) {
      html += '<div class="bullet">'+renderInline(line.replace(/^\s*[-*]\s+/,''))+'</div>'; continue;
    }
    // Regular paragraphs
    if (line.trim().length > 0) {
      html += '<p>'+renderInline(line)+'</p>';
    }
  }
  if (inTable) html += buildTable(tableRows, lower);
  
  // Inject visual elements based on section type
  if (lower.includes('personnel') || lower.includes('staffing') || lower.includes('organizational')) {
    html += buildOrgChart(text);
  }
  if (lower.includes('past performance')) {
    html += buildPPVisual(text);
  }
  if (lower.includes('technical approach')) {
    html = buildProcessFlow() + html;
  }
  
  return html;
}

function renderInline(t) {
  return (t||'').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');
}

function buildTable(rows, context) {
  if (!rows.length) return '';
  var isCompliance = context.includes('compliance');
  var isPricing = context.includes('pricing') || context.includes('exhibit');
  var cls = isCompliance ? 'tbl compliance-tbl' : isPricing ? 'tbl pricing-tbl' : 'tbl';
  var html = '<table class="'+cls+'">';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var tag = r.isHeader ? 'th' : 'td';
    html += '<tr>';
    for (var j = 0; j < r.cells.length; j++) {
      var cell = r.cells[j].trim();
      var cellClass = '';
      // Status indicators for compliance
      if (cell === 'Compliant') cellClass = ' class="status-pass"';
      if (cell === 'Partial') cellClass = ' class="status-warn"';
      if (cell === 'Gap') cellClass = ' class="status-fail"';
      // Rate formatting
      if (cell.match(/^\$\d/) && !r.isHeader) cellClass = ' class="rate-cell"';
      html += '<'+tag+cellClass+'>' + renderInline(cell) + '</'+tag+'>';
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function buildOrgChart(text) {
  var positions = [];
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/(Program Director|Senior PM|Senior Project Manager|Project Manager|PA SME|Public Assistance SME|Subject Matter Expert|HM Specialist|Hazard Mitigation|Grant Financial|Financial Specialist|Documentation Manager|Administrative Support|Construction Manager|Resident Inspector|Grant Writer|Cost Estimator|Damage Assessor|Project Inspector)/i);
    if (m) {
      var rm = lines[i].match(/\$(\d+)/); var rate = rm ? parseInt(rm[1]) : null;
      var dup = false; for (var k=0;k<positions.length;k++) if (positions[k].t.toLowerCase()===m[1].toLowerCase()) dup=true;
      if (!dup && positions.length < 12) positions.push({t:m[1],r:rate});
    }
  }
  if (positions.length < 2) return '';
  var top = positions[0], mid = positions.slice(1,Math.min(4,positions.length)), bot = positions.slice(4);
  var html = '<div class="org-visual"><div class="org-label">PROPOSED ORGANIZATIONAL STRUCTURE</div>';
  html += '<div class="org-chart"><div class="org-row"><div class="org-node top"><div class="org-n-title">'+esc(top.t)+'</div>'+(top.r?'<div class="org-n-rate">'+D+top.r+'/hr</div>':'')+'</div></div>';
  html += '<div class="org-line"></div>';
  if (mid.length) { html += '<div class="org-row">'; for(var a=0;a<mid.length;a++) html += '<div class="org-node"><div class="org-n-title">'+esc(mid[a].t)+'</div>'+(mid[a].r?'<div class="org-n-rate">'+D+mid[a].r+'/hr</div>':'')+'</div>'; html += '</div>'; }
  if (bot.length) { html += '<div class="org-line"></div><div class="org-row">'; for(var b=0;b<bot.length;b++) html += '<div class="org-node sm"><div class="org-n-title">'+esc(bot[b].t)+'</div>'+(bot[b].r?'<div class="org-n-rate">'+D+bot[b].r+'/hr</div>':'')+'</div>'; html += '</div>'; }
  html += '</div></div>';
  return html;
}

function buildPPVisual(text) {
  var programs = [];
  var sections = text.split(/\d+\.\d+\s+/);
  for (var i = 1; i < sections.length && programs.length < 6; i++) {
    var s = sections[i];
    var nm = s.match(/^(.+?)\n/);
    var vm = s.match(/Contract Value[:\s]*([^\n]+)/i);
    var pm = s.match(/Period[:\s]*([^\n]+)/i);
    var cm = s.match(/Client[:\s]*([^\n]+)/i);
    if (nm) programs.push({ name:nm[1].trim(), value:vm?vm[1].trim():'', period:pm?pm[1].trim():'', client:cm?cm[1].trim():'' });
  }
  if (!programs.length) return '';
  var html = '<div class="pp-visual">';
  for (var j = 0; j < programs.length; j++) {
    var p = programs[j];
    html += '<div class="pp-tile"><div class="pp-tile-name">'+esc(p.name)+'</div>';
    if (p.client) html += '<div class="pp-tile-client">'+esc(p.client)+'</div>';
    if (p.value) html += '<div class="pp-tile-value">'+esc(p.value)+'</div>';
    if (p.period) html += '<div class="pp-tile-period">'+esc(p.period)+'</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function buildProcessFlow() {
  var steps = ['Activation','Damage Assessment','PW Development','FEMA Submission','Obligation','Implementation','Compliance','Closeout'];
  var html = '<div class="flow-visual"><div class="flow-label">HGI DISASTER RECOVERY METHODOLOGY</div><div class="flow-steps">';
  for (var i = 0; i < steps.length; i++) {
    html += '<div class="flow-step"><div class="flow-num">'+(i+1)+'</div><div class="flow-name">'+steps[i]+'</div></div>';
    if (i < steps.length-1) html += '<div class="flow-arrow">\u25B6</div>';
  }
  html += '</div></div>';
  return html;
}

function buildStatsBar() {
  return '<div class="stats">'
    +'<div class="stat"><div class="stat-n">'+HGI.years+'</div><div class="stat-l">Years</div></div>'
    +'<div class="stat"><div class="stat-n">'+D+'13B+</div><div class="stat-l">Programs Managed</div></div>'
    +'<div class="stat"><div class="stat-n">0</div><div class="stat-l">Misappropriations</div></div>'
    +'<div class="stat"><div class="stat-n">110+</div><div class="stat-l">Professionals</div></div>'
    +'<div class="stat"><div class="stat-n">4</div><div class="stat-l">LA Offices</div></div>'
    +'</div>';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  var id = req.query.id;
  if (!id) return res.status(400).send('?id=OPPORTUNITY_ID required');
  var oppR = await fetch(SB+'/rest/v1/opportunities?id=eq.'+encodeURIComponent(id)+'&limit=1',{headers:H});
  var opps = await oppR.json();
  if (!opps||!opps.length) return res.status(404).send('Not found');
  var o = opps[0];
  var proposal = o.staffing_plan || '';
  if (proposal.length < 100) return res.status(400).send('No proposal content for this opportunity. Run orchestrator first.');
  var dueDate = o.due_date ? new Date(o.due_date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'TBD';
  var vertical = o.vertical || 'professional services';
  var vertTitle = vertical.includes('disaster')?'Disaster Recovery Program Management':'Grant Management & Administration';
  
  // Parse proposal into sections
  var sections = [];
  var parts = proposal.split(/^## (\d+)\.\s*/m);
  // parts[0] = header, then alternating: number, content
  for (var i = 1; i < parts.length; i += 2) {
    var num = parts[i];
    var body = (parts[i+1]||'');
    var titleMatch = body.match(/^(.+?)\n/);
    var title = titleMatch ? titleMatch[1].trim() : 'Section '+num;
    var content = titleMatch ? body.slice(titleMatch[0].length) : body;
    sections.push({ num: num, title: title, content: content });
  }

  var css = '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&display=swap");'
    +'*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:"Outfit",sans-serif;color:#222;line-height:1.65;background:'+WHITE+';font-weight:400}'
    +'@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0!important}.no-print{display:none!important}.page-break{page-break-before:always}}'
    +'.cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:linear-gradient(160deg,'+NAVY+' 0%,#0D1F33 50%,#0A1628 100%);color:white;text-align:center;position:relative;overflow:hidden;page-break-after:always}'
    +'.cover::before{content:"";position:absolute;top:-30%;right:-20%;width:70%;height:160%;background:radial-gradient(ellipse,rgba(201,168,76,0.08) 0%,transparent 65%);pointer-events:none}'
    +'.cover::after{content:"";position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,transparent,'+GOLD+',transparent)}'
    +'.cover-badge{display:inline-block;padding:6px 24px;border:1px solid rgba(201,168,76,0.4);border-radius:2px;font-size:11px;letter-spacing:5px;text-transform:uppercase;color:'+GOLD+';margin-bottom:36px;font-weight:500}'
    +'.cover-title{font-family:"Cormorant Garamond",serif;font-size:44px;font-weight:700;line-height:1.15;max-width:750px;margin-bottom:16px}'
    +'.cover-sub{font-size:18px;font-weight:300;color:rgba(255,255,255,0.55);max-width:600px;margin-bottom:48px}'
    +'.cover-div{width:60px;height:2px;background:'+GOLD+';margin:0 auto 40px}'
    +'.cover-meta{font-size:13px;color:rgba(255,255,255,0.4);letter-spacing:3px;text-transform:uppercase;margin-bottom:6px}'
    +'.cover-agency{font-family:"Cormorant Garamond",serif;font-size:28px;font-weight:700;margin-bottom:48px}'
    +'.cover-hgi{font-family:"Cormorant Garamond",serif;font-size:38px;font-weight:800;color:'+GOLD+';margin-bottom:4px}'
    +'.cover-legal{font-size:14px;color:rgba(255,255,255,0.5);font-weight:300;margin-bottom:6px}'
    +'.cover-date{font-size:15px;font-weight:500;margin-top:32px}'
    +'.wrap{max-width:920px;margin:0 auto;padding:48px}'
    +'.section{margin-bottom:40px;page-break-inside:avoid}'
    +'.sec-header{display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:10px;border-bottom:2px solid '+GOLD+'}'
    +'.sec-num{font-family:"Cormorant Garamond",serif;font-size:36px;font-weight:800;color:'+GOLD+';line-height:1}'
    +'.sec-title{font-family:"Cormorant Garamond",serif;font-size:24px;color:'+NAVY+';font-weight:700;letter-spacing:-0.3px}'
    +'.sec-body{padding-left:4px}'
    +'h3.h3{font-size:16px;font-weight:600;color:'+NAVY+';margin:24px 0 8px}'
    +'h4.h4{font-size:14px;font-weight:600;color:#444;margin:16px 0 6px}'
    +'p{margin-bottom:12px;font-size:14px;line-height:1.75;color:#333}'
    +'.bullet{padding:4px 0 4px 14px;border-left:2px solid '+GOLD+';margin-bottom:6px;font-size:13.5px;color:#444}'
    +'.divider{border:none;border-top:1px solid #e5e5e5;margin:16px 0}'
    +'table.tbl{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}'
    +'.tbl th{background:'+NAVY+';color:white;padding:8px 10px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;font-weight:600}'
    +'.tbl td{padding:7px 10px;border-bottom:1px solid #eee}'
    +'.tbl tr:nth-child(even) td{background:'+LIGHT+'}'
    +'td.status-pass{color:#1a7a1a;font-weight:600}td.status-pass::before{content:"\u2713 "}'
    +'td.status-warn{color:#c67700;font-weight:600}td.status-warn::before{content:"\u26A0 "}'
    +'td.status-fail{color:#c62828;font-weight:600}td.status-fail::before{content:"\u2717 "}'
    +'td.rate-cell{font-weight:700;color:'+NAVY+';font-size:15px}'
    +'.pricing-tbl td:first-child{font-weight:600;color:'+NAVY+'}'
    +'.stats{display:flex;gap:0;margin:28px 0;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}'
    +'.stat{flex:1;padding:18px 10px;text-align:center;background:'+NAVY+';color:white}'
    +'.stat:nth-child(even){background:#234B6E}'
    +'.stat-n{font-family:"Cormorant Garamond",serif;font-size:28px;font-weight:800;color:'+GOLD+'}'
    +'.stat-l{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-top:2px;font-weight:500}'
    +'.org-visual{background:'+LIGHT+';border:1px solid #e8e4dc;border-radius:6px;padding:24px;margin:20px 0;text-align:center}'
    +'.org-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+NAVY+';font-weight:700;margin-bottom:16px}'
    +'.org-row{display:flex;justify-content:center;gap:10px;margin-bottom:4px;flex-wrap:wrap}'
    +'.org-node{background:'+NAVY+';color:white;border-radius:5px;padding:8px 12px;min-width:120px}'
    +'.org-node.top{background:linear-gradient(135deg,'+GOLD+',#B8933F);color:'+NAVY+'}'
    +'.org-node.sm{font-size:11px;min-width:100px;padding:6px 10px}'
    +'.org-n-title{font-weight:700;font-size:11px}.org-n-rate{font-size:10px;opacity:0.7}'
    +'.org-line{width:2px;height:10px;background:'+GOLD+';margin:0 auto}'
    +'.flow-visual{background:linear-gradient(135deg,'+NAVY+',#1D3D5E);border-radius:6px;padding:24px;margin:20px 0;text-align:center}'
    +'.flow-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+GOLD+';font-weight:600;margin-bottom:14px}'
    +'.flow-steps{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px}'
    +'.flow-step{text-align:center;min-width:70px}'
    +'.flow-num{width:28px;height:28px;border-radius:50%;background:rgba(201,168,76,0.2);border:1px solid '+GOLD+';color:'+GOLD+';font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px}'
    +'.flow-name{font-size:9px;font-weight:600;color:rgba(255,255,255,0.8);letter-spacing:0.3px;line-height:1.2}'
    +'.flow-arrow{color:'+GOLD+';font-size:10px;margin-top:-6px}'
    +'.pp-visual{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0}'
    +'.pp-tile{background:'+LIGHT+';border-radius:5px;padding:14px;border-left:3px solid '+GOLD+'}'
    +'.pp-tile-name{font-weight:700;color:'+NAVY+';font-size:13px;margin-bottom:2px}'
    +'.pp-tile-client{font-size:10px;color:#999;margin-bottom:4px}'
    +'.pp-tile-value{font-family:"Cormorant Garamond",serif;font-size:20px;font-weight:800;color:'+GOLD+';margin-bottom:2px}'
    +'.pp-tile-period{font-size:10px;color:#777}'
    +'.callout{background:linear-gradient(135deg,'+NAVY+',#1D3D5E);color:white;border-radius:6px;padding:22px 26px;margin:24px 0;border-left:4px solid '+GOLD+'}'
    +'.callout-l{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+GOLD+';margin-bottom:5px;font-weight:600}'
    +'.callout-t{font-size:15px;font-weight:300;line-height:1.6}.callout-t strong{color:'+GOLD+'}'
    +'.hdr{padding:12px 48px;border-bottom:2px solid '+GOLD+';display:flex;justify-content:space-between;align-items:center}'
    +'.hdr-logo{font-family:"Cormorant Garamond",serif;font-size:16px;font-weight:800;color:'+GOLD+'}'
    +'.hdr-t{font-size:11px;color:#aaa;font-weight:400}'
    +'.ftr{padding:8px 48px;border-top:1px solid #eee;text-align:center;font-size:9px;color:#bbb;margin-top:32px}'
    +'.corp-tbl td:first-child{font-weight:600;color:'+NAVY+';width:160px}'
    +'.toolbar{position:fixed;top:0;left:0;right:0;background:'+NAVY+';padding:8px 16px;display:flex;gap:8px;z-index:999}'
    +'.toolbar button{padding:7px 18px;background:'+GOLD+';color:'+NAVY+';border:none;border-radius:3px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}'
    +'.toolbar button:hover{background:#B8933F}'
    +'.toolbar .inf{color:rgba(255,255,255,0.5);font-size:11px;line-height:34px;margin-left:auto}'
    +'@media print{.toolbar{display:none!important}body{padding-top:0!important}}'
    +'body{padding-top:48px}';

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HGI Proposal \u2014 '+esc(o.agency||'')+'</title><style>'+css+'</style></head><body>';
  
  // TOOLBAR
  html += '<div class="toolbar no-print"><button onclick="window.print()">Print / Save PDF</button><button onclick="document.querySelectorAll(\'.page-break\').forEach(function(e){e.style.display=\'none\'});this.textContent=\'Done\'">Continuous View</button><div class="inf">HGI Proposal Graphics Engine | '+esc(o.title||'').slice(0,50)+'</div></div>';
  
  // COVER PAGE
  html += '<div class="cover"><div class="cover-badge">Proposal</div>';
  html += '<div class="cover-title">'+esc(vertTitle)+'</div>';
  html += '<div class="cover-sub">'+esc(o.title||'')+'</div>';
  html += '<div class="cover-div"></div>';
  html += '<div class="cover-meta">Submitted To</div>';
  html += '<div class="cover-agency">'+esc(o.agency||'')+'</div>';
  html += '<div class="cover-meta">Submitted By</div>';
  html += '<div class="cover-hgi">'+HGI.name+'</div>';
  html += '<div class="cover-legal">'+HGI.legal+' \u2014 '+HGI.ownership+' \u2014 Est. '+HGI.founded+'</div>';
  html += '<div class="cover-date">Due: '+esc(dueDate)+'</div></div>';
  
  // HEADER
  html += '<div class="hdr"><div class="hdr-logo">HGI Global</div><div class="hdr-t">'+esc(o.agency||'')+' \u2014 '+esc(vertTitle)+'</div></div>';
  
  html += '<div class="wrap">';
  
  // STATS BAR + VALUE CALLOUT
  html += buildStatsBar();
  html += '<div class="callout"><div class="callout-l">Key Differentiator</div>';
  html += '<div class="callout-t">HGI has delivered <strong>zero misappropriation across '+D+'13 billion+</strong> in federal program funds \u2014 an unmatched compliance record spanning nearly a century of fiduciary service.</div></div>';
  
  // RENDER EACH PROPOSAL SECTION WITH EMBEDDED VISUALS
  for (var s = 0; s < sections.length; s++) {
    if (s > 0 && s % 2 === 0) html += '<div class="page-break"></div>';
    html += renderSection(sections[s].title, sections[s].content, sections[s].num);
  }
  
  // CORPORATE PROFILE (always at end)
  html += '<div class="page-break"></div>';
  html += '<div class="section"><div class="sec-header"><span class="sec-num">\u2605</span><h2 class="sec-title">Corporate Profile</h2></div>';
  html += '<table class="tbl corp-tbl"><tbody>';
  html += '<tr><td>Legal Name</td><td>'+HGI.legal+'</td></tr>';
  html += '<tr><td>DBA</td><td>'+HGI.name+'</td></tr>';
  html += '<tr><td>Established</td><td>'+HGI.founded+' ('+HGI.years+' years)</td></tr>';
  html += '<tr><td>Ownership</td><td>'+HGI.ownership+'</td></tr>';
  html += '<tr><td>Headquarters</td><td>'+HGI.address+'</td></tr>';
  html += '<tr><td>Offices</td><td>'+HGI.offices+'</td></tr>';
  html += '<tr><td>Staff</td><td>'+HGI.staff+'</td></tr>';
  html += '<tr><td>SAM UEI</td><td>'+HGI.uei+'</td></tr>';
  html += '<tr><td>Insurance</td><td>'+HGI.insurance+'</td></tr>';
  html += '</tbody></table></div>';
  
  html += '</div>'; // wrap
  html += '<div class="ftr">CONFIDENTIAL \u2014 '+HGI.name+' | '+HGI.legal+' | '+HGI.address+' | '+HGI.phone+'</div>';
  html += '</body></html>';
  
  res.setHeader('Content-Type','text/html');
  return res.status(200).send(html);
}