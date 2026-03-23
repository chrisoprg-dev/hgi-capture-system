export const config = { maxDuration: 60 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
var D = String.fromCharCode(36);
var HGI = { name:'HGI Global, Inc.', legal:'Hammerman & Gainer LLC', founded:'~1929', years:'96', address:'2400 Veterans Memorial Blvd, Suite 510, Kenner, LA 70062', phone:'504-982-5030', uei:'DL4SJEVKZ6H4', ownership:'100% Minority-Owned', staff:'67 FT + 43 Contract Professionals', offices:'Kenner (HQ), Shreveport, Alexandria, New Orleans', insurance:D+'5M Fidelity Bond, '+D+'5M E&O, '+D+'2M GL' };
var GOLD='#C9A84C',NAVY='#1B3A5C',LIGHT='#F8F6F0';
var PEXELS_KEY = process.env.PEXELS_API_KEY || '';
var OPENAI_KEY = process.env.OPENAI_API_KEY || '';

async function fetchPexelsImage(query) {
  if (!PEXELS_KEY) return null;
  try {
    var r = await fetch('https://api.pexels.com/v1/search?query='+encodeURIComponent(query)+'&per_page=1&orientation=landscape',{headers:{Authorization:PEXELS_KEY}});
    var d = await r.json();
    return (d.photos && d.photos[0]) ? d.photos[0].src.large2x || d.photos[0].src.large : null;
  } catch(e) { return null; }
}

async function generateDalleImage(prompt) {
  if (!OPENAI_KEY) return null;
  try {
    var r = await fetch('https://api.openai.com/v1/images/generations',{
      method:'POST',
      headers:{'Authorization':'Bearer '+OPENAI_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:'dall-e-3',prompt:prompt,n:1,size:'1792x1024',quality:'standard'})
    });
    var d = await r.json();
    return (d.data && d.data[0]) ? d.data[0].url : null;
  } catch(e) { return null; }
}

function imgTag(url, alt, height, caption) {
  if (!url) return '';
  var h = height || 220;
  var cap = caption ? '<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(13,31,51,0.85));padding:20px 16px 10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;font-weight:600;">'+caption+'</div>' : '';
  return '<div style="position:relative;border-radius:6px;overflow:hidden;margin:20px 0;"><img src="'+url+'" alt="'+(alt||'')+'" style="width:100%;height:'+h+'px;object-fit:cover;display:block;opacity:0.9;">'+cap+'</div>';
}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// Convert full markdown to rich HTML — ALL text preserved, visuals injected inline
function markdownToHTML(text, vertical) {
  if (!text) return '';
  var lines = text.split('\n');
  var html = '';
  var inTable = false;
  var tableHTML = '';
  var tableIsHeader = true;
  var sectionCount = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      if (inTable) {
        html += tableHTML + '</tbody></table></div>';
        inTable = false; tableHTML = ''; tableIsHeader = true;
      }
      continue;
    }

    // Table separator row (---|---)
    if (trimmed.match(/^[\|\s\-:]+$/) && trimmed.includes('---')) continue;

    // Table rows
    if (trimmed.charAt(0) === '|' || (trimmed.includes('|') && trimmed.split('|').length >= 3 && !trimmed.match(/^#/))) {
      var cells = trimmed.split('|').filter(function(c){ return c.trim() !== ''; });
      if (cells.length < 2) { continue; }
      if (!inTable) {
        inTable = true;
        tableHTML = '<div class="tbl-wrap"><table class="tbl"><thead>';
        tableIsHeader = true;
      }
      var tag = tableIsHeader ? 'th' : 'td';
      if (tableIsHeader) { tableHTML += '<tr>'; }
      else { if (tableIsHeader === false && tableHTML.indexOf('</thead>') === -1) { tableHTML += '</thead><tbody>'; } tableHTML += '<tr>'; }
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c].trim();
        var cls = '';
        if (tag === 'td') {
          if (cell === 'Compliant') cls = ' class="st-pass"';
          else if (cell === 'Partial') cls = ' class="st-warn"';
          else if (cell === 'Gap' || cell === 'Missing') cls = ' class="st-fail"';
          else if (cell.match(/^\$\d/)) cls = ' class="rate-c"';
        }
        tableHTML += '<' + tag + cls + '>' + inline(cell) + '</' + tag + '>';
      }
      tableHTML += '</tr>';
      if (tableIsHeader) tableIsHeader = false;
      continue;
    }

    // Close any open table
    if (inTable) {
      html += tableHTML + '</tbody></table></div>';
      inTable = false; tableHTML = ''; tableIsHeader = true;
    }

    // H1 — top level proposal title
    if (trimmed.match(/^# /)) {
      html += '<div class="prop-title">' + inline(trimmed.replace(/^# /, '')) + '</div>';
      continue;
    }

    // H2 — major sections with visual section headers
    if (trimmed.match(/^## /)) {
      sectionCount++;
      var secTitle = trimmed.replace(/^## /, '').replace(/^\d+\.\s*/, '');
      var secNum = trimmed.match(/^## (\d+)/) ? trimmed.match(/^## (\d+)/)[1] : sectionCount;
      html += '<div class="page-break"></div>';
      html += '<div class="sec-hdr"><span class="sec-n">' + secNum + '</span><h2 class="sec-t">' + inline(secTitle) + '</h2></div>';

      // INJECT VISUALS after specific section headers
      var lower = secTitle.toLowerCase();
      if (lower.includes('technical approach')) {
        html += buildProcessFlow(vertical);
      }
      continue;
    }

    // H3
    if (trimmed.match(/^### /)) {
      html += '<h3 class="h3">' + inline(trimmed.replace(/^### /, '')) + '</h3>';
      continue;
    }

    // H4 (bold sub-sub)
    if (trimmed.match(/^#### /)) {
      html += '<h4 class="h4">' + inline(trimmed.replace(/^#### /, '')) + '</h4>';
      continue;
    }

    // Horizontal rule
    if (trimmed === '---') {
      html += '<hr class="sep"/>';
      continue;
    }

    // Bold-lead bullet: - **Label** description
    var boldBullet = trimmed.match(/^[-*]\s+\*\*(.+?)\*\*(.*)/);
    if (boldBullet) {
      html += '<div class="bl"><strong>' + inline(boldBullet[1]) + '</strong>' + inline(boldBullet[2]) + '</div>';
      continue;
    }

    // Regular bullet
    if (trimmed.match(/^[-*]\s+/)) {
      html += '<div class="bl">' + inline(trimmed.replace(/^[-*]\s+/, '')) + '</div>';
      continue;
    }

    // Bold paragraph (standalone **text**)
    if (trimmed.match(/^\*\*.+\*\*$/) && !trimmed.match(/^\*\*.+\*\*\s*\|/)) {
      html += '<p class="bold-p">' + inline(trimmed) + '</p>';
      continue;
    }

    // Regular paragraph
    html += '<p>' + inline(trimmed) + '</p>';
  }

  // Close any dangling table
  if (inTable) {
    html += tableHTML + '</tbody></table></div>';
  }

  return html;
}

function inline(t) {
  return (t||'')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function buildProcessFlow(vertical) {
  var steps = (vertical||'').includes('disaster')
    ? ['Activation','Damage Assessment','PW Development','FEMA Submission','Obligation','Implementation','Compliance','Closeout']
    : ['Assessment','Planning','Execution','Monitoring','Compliance','Reporting','Closeout'];
  var h = '<div class="flow-box"><div class="flow-lbl">HGI METHODOLOGY</div><div class="flow-row">';
  for (var i=0;i<steps.length;i++) {
    h += '<div class="flow-s"><div class="flow-n">'+(i+1)+'</div><div class="flow-t">'+steps[i]+'</div></div>';
    if (i<steps.length-1) h += '<div class="flow-a">\u25B6</div>';
  }
  return h + '</div></div>';
}

function buildOrgChart(proposal) {
  var pos = [];
  var lines = (proposal||'').split('\n');
  for (var i=0;i<lines.length;i++) {
    var m = lines[i].match(/(Program Director|Senior Project Manager|Senior PM|Project Manager|Public Assistance SME|PA SME|Subject Matter Expert|Hazard Mitigation Specialist|HM Specialist|Grant Financial Specialist|Financial Specialist|Documentation Manager|Administrative Support|Construction Manager|Resident Inspector|Project Inspector|Grant Writer|Cost Estimator|Damage Assessor)/i);
    if (m) {
      var rm = lines[i].match(/\$(\d+)/); var rate = rm ? parseInt(rm[1]) : null;
      var dup = false; for (var k=0;k<pos.length;k++) if (pos[k].t.toLowerCase()===m[1].toLowerCase()) dup=true;
      if (!dup && pos.length < 12) pos.push({t:m[1],r:rate});
    }
  }
  if (pos.length < 3) return '';
  var top=pos[0], mid=pos.slice(1,Math.min(4,pos.length)), bot=pos.slice(4);
  var h = '<div class="org-box"><div class="org-lbl">PROPOSED ORGANIZATIONAL STRUCTURE</div><div class="org-chart">';
  h += '<div class="org-r"><div class="org-nd top"><div class="org-nt">'+esc(top.t)+'</div>'+(top.r?'<div class="org-nr">'+D+top.r+'/hr</div>':'')+'</div></div>';
  h += '<div class="org-ln"></div>';
  if (mid.length) { h += '<div class="org-r">'; for(var a=0;a<mid.length;a++) h += '<div class="org-nd"><div class="org-nt">'+esc(mid[a].t)+'</div>'+(mid[a].r?'<div class="org-nr">'+D+mid[a].r+'/hr</div>':'')+'</div>'; h += '</div>'; }
  if (bot.length) { h += '<div class="org-ln"></div><div class="org-r">'; for(var b=0;b<bot.length;b++) h += '<div class="org-nd sm"><div class="org-nt">'+esc(bot[b].t)+'</div>'+(bot[b].r?'<div class="org-nr">'+D+bot[b].r+'/hr</div>':'')+'</div>'; h += '</div>'; }
  return h + '</div></div>';
}

function buildPPTiles(proposal) {
  var blocks = (proposal||'').split(/\*\*\d+\.\d+\s+/);
  if (blocks.length < 2) return '';
  var tiles = [];
  for (var i=1;i<blocks.length && tiles.length<6;i++) {
    var nm = blocks[i].match(/^(.+?)\*\*/);
    var vm = blocks[i].match(/Contract Value[:\s]*([^\n]+)/i);
    var pm = blocks[i].match(/Period[:\s]*([^\n]+)/i);
    var cm = blocks[i].match(/Client[:\s]*([^\n]+)/i);
    if (nm) tiles.push({name:nm[1].trim(),value:vm?vm[1].trim():'',period:pm?pm[1].trim():'',client:cm?cm[1].trim():''});
  }
  if (!tiles.length) return '';
  var h = '<div class="pp-grid">';
  for (var j=0;j<tiles.length;j++) {
    var p = tiles[j];
    h += '<div class="pp-tile"><div class="pp-nm">'+esc(p.name)+'</div>';
    if (p.client) h += '<div class="pp-cl">'+esc(p.client)+'</div>';
    if (p.value) h += '<div class="pp-val">'+esc(p.value)+'</div>';
    if (p.period) h += '<div class="pp-per">'+esc(p.period)+'</div>';
    h += '</div>';
  }
  return h + '</div>';
}

function buildStatsBar() {
  return '<div class="stats">'
    +'<div class="st"><div class="st-n">'+HGI.years+'</div><div class="st-l">Years</div></div>'
    +'<div class="st"><div class="st-n">'+D+'13B+</div><div class="st-l">Programs Managed</div></div>'
    +'<div class="st"><div class="st-n">0</div><div class="st-l">Misappropriations</div></div>'
    +'<div class="st"><div class="st-n">110+</div><div class="st-l">Professionals</div></div>'
    +'<div class="st"><div class="st-n">4</div><div class="st-l">LA Offices</div></div>'
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
  if (proposal.length < 100) return res.status(400).send('No proposal content. Run orchestrator first.');
  var dueDate = o.due_date ? new Date(o.due_date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'TBD';
  var vertical = o.vertical || '';
  var agency = o.agency || '';
  var state = o.state || 'Louisiana';
  var vertTitle = vertical.includes('disaster')?'Disaster Recovery Program Management Services':vertical.includes('grant')?'Grant Management & Administration Services':'Professional Services';

  // Fetch contextual images from Pexels in parallel
  var pexelsQuery2 = vertical.includes('disaster') ? 'disaster recovery community rebuilding' : vertical.includes('housing') ? 'affordable housing community neighborhood' : 'government program management professional';
  var pexelsState = (state||'Louisiana').toLowerCase().includes('louisiana') ? 'Louisiana bayou wetlands aerial landscape' : (state + ' aerial landscape government');

  var [coverImg, sectionImg1, sectionImg2] = await Promise.all([
    fetchPexelsImage(pexelsState),
    fetchPexelsImage(pexelsQuery2),
    fetchPexelsImage('FEMA disaster recovery workers field assessment site')
  ]);

  // DALL-E available for future use — not applied to cover until design approved
  var dalleImg = null;

  // Render the FULL proposal as rich HTML — all text preserved
  var proposalHTML = markdownToHTML(proposal, vertical);

  // Find injection points for org chart and PP tiles
  // Insert org chart after staffing section header
  var orgChart = buildOrgChart(proposal);
  if (orgChart) {
    var staffingMarker = proposalHTML.indexOf('Staffing');
    if (staffingMarker === -1) staffingMarker = proposalHTML.indexOf('STAFFING');
    if (staffingMarker === -1) staffingMarker = proposalHTML.indexOf('Organizational');
    if (staffingMarker > -1) {
      // Find the next </div> after the sec-hdr that contains this text
      var afterHdr = proposalHTML.indexOf('</h2></div>', staffingMarker);
      if (afterHdr > -1) {
        var insertAt = afterHdr + '</h2></div>'.length;
        proposalHTML = proposalHTML.slice(0, insertAt) + orgChart + proposalHTML.slice(insertAt);
      }
    }
  }

  // Insert PP tiles after past performance section
  var ppTiles = buildPPTiles(proposal);
  if (ppTiles) {
    var ppMarker = proposalHTML.indexOf('Past Performance');
    if (ppMarker === -1) ppMarker = proposalHTML.indexOf('PAST PERFORMANCE');
    if (ppMarker > -1) {
      var afterPPHdr = proposalHTML.indexOf('</h2></div>', ppMarker);
      if (afterPPHdr > -1) {
        var ppInsert = afterPPHdr + '</h2></div>'.length;
        proposalHTML = proposalHTML.slice(0, ppInsert) + ppTiles + proposalHTML.slice(ppInsert);
      }
    }
  }

  var css = '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&display=swap");'
    +'*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:"Outfit",sans-serif;color:#222;line-height:1.7;background:#fff;font-weight:400}'
    +'@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0!important}.no-print{display:none!important}.page-break{page-break-before:always}}'
    // COVER
    +'.cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:linear-gradient(160deg,'+NAVY+' 0%,#0D1F33 50%,#0A1628 100%);color:white;text-align:center;position:relative;overflow:hidden;page-break-after:always}'
    +'.cover::before{content:"";position:absolute;top:-30%;right:-20%;width:70%;height:160%;background:radial-gradient(ellipse,rgba(201,168,76,0.08) 0%,transparent 65%)}'
    +'.cover::after{content:"";position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,transparent,'+GOLD+',transparent)}'
    +'.c-badge{display:inline-block;padding:6px 24px;border:1px solid rgba(201,168,76,0.4);border-radius:2px;font-size:11px;letter-spacing:5px;text-transform:uppercase;color:'+GOLD+';margin-bottom:36px}'
    +'.c-title{font-family:"Cormorant Garamond",serif;font-size:44px;font-weight:700;line-height:1.15;max-width:750px;margin-bottom:16px}'
    +'.c-sub{font-size:18px;font-weight:300;color:rgba(255,255,255,0.55);max-width:600px;margin-bottom:48px}'
    +'.c-div{width:60px;height:2px;background:'+GOLD+';margin:0 auto 40px}'
    +'.c-meta{font-size:13px;color:rgba(255,255,255,0.4);letter-spacing:3px;text-transform:uppercase;margin-bottom:6px}'
    +'.c-agency{font-family:"Cormorant Garamond",serif;font-size:28px;font-weight:700;margin-bottom:48px}'
    +'.c-hgi{font-family:"Cormorant Garamond",serif;font-size:38px;font-weight:800;color:'+GOLD+';margin-bottom:4px}'
    +'.c-legal{font-size:14px;color:rgba(255,255,255,0.5);font-weight:300;margin-bottom:6px}'
    +'.c-date{font-size:15px;font-weight:500;margin-top:32px}'
    // LAYOUT
    +'.wrap{max-width:920px;margin:0 auto;padding:48px}'
    +'.hdr{padding:12px 48px;border-bottom:2px solid '+GOLD+';display:flex;justify-content:space-between;align-items:center}'
    +'.hdr-logo{font-family:"Cormorant Garamond",serif;font-size:16px;font-weight:800;color:'+GOLD+'}'
    +'.hdr-t{font-size:11px;color:#aaa}'
    +'.ftr{padding:8px 48px;border-top:1px solid #eee;text-align:center;font-size:9px;color:#bbb;margin-top:32px}'
    // SECTIONS
    +'.prop-title{font-family:"Cormorant Garamond",serif;font-size:28px;font-weight:800;color:'+NAVY+';text-align:center;margin:24px 0 8px}'
    +'.sec-hdr{display:flex;align-items:center;gap:14px;margin:40px 0 18px;padding-bottom:10px;border-bottom:2px solid '+GOLD+'}'
    +'.sec-n{font-family:"Cormorant Garamond",serif;font-size:36px;font-weight:800;color:'+GOLD+';line-height:1}'
    +'.sec-t{font-family:"Cormorant Garamond",serif;font-size:24px;color:'+NAVY+';font-weight:700}'
    +'h3.h3{font-size:16px;font-weight:600;color:'+NAVY+';margin:24px 0 8px}'
    +'h4.h4{font-size:14px;font-weight:600;color:#444;margin:16px 0 6px}'
    +'p{margin-bottom:12px;font-size:14px;line-height:1.8;color:#333}'
    +'p.bold-p{font-weight:600;color:'+NAVY+'}'
    +'.bl{padding:5px 0 5px 14px;border-left:2px solid '+GOLD+';margin-bottom:6px;font-size:13.5px;color:#444;line-height:1.6}'
    +'.sep{border:none;border-top:1px solid #e5e5e5;margin:20px 0}'
    // TABLES
    +'.tbl-wrap{overflow-x:auto;margin:16px 0}'
    +'.tbl{width:100%;border-collapse:collapse;font-size:12.5px}'
    +'.tbl th{background:'+NAVY+';color:white;padding:8px 10px;text-align:left;font-size:10.5px;letter-spacing:0.7px;text-transform:uppercase;font-weight:600;white-space:nowrap}'
    +'.tbl td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}'
    +'.tbl tr:nth-child(even) td{background:'+LIGHT+'}'
    +'td.st-pass{color:#1a7a1a;font-weight:600}td.st-pass::before{content:"\u2713 ";font-size:14px}'
    +'td.st-warn{color:#c67700;font-weight:600}td.st-warn::before{content:"\u26A0 ";font-size:13px}'
    +'td.st-fail{color:#c62828;font-weight:600}td.st-fail::before{content:"\u2717 ";font-size:14px}'
    +'td.rate-c{font-weight:700;color:'+NAVY+';font-size:14px}'
    // STATS BAR
    +'.stats{display:flex;gap:0;margin:28px 0;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}'
    +'.st{flex:1;padding:18px 10px;text-align:center;background:'+NAVY+';color:white}'
    +'.st:nth-child(even){background:#234B6E}'
    +'.st-n{font-family:"Cormorant Garamond",serif;font-size:28px;font-weight:800;color:'+GOLD+'}'
    +'.st-l{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-top:2px}'
    // CALLOUT
    +'.callout{background:linear-gradient(135deg,'+NAVY+',#1D3D5E);color:white;border-radius:6px;padding:22px 26px;margin:24px 0;border-left:4px solid '+GOLD+'}'
    +'.callout-l{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+GOLD+';margin-bottom:5px;font-weight:600}'
    +'.callout-t{font-size:15px;font-weight:300;line-height:1.6}.callout-t strong{color:'+GOLD+'}'
    // PROCESS FLOW
    +'.flow-box{background:linear-gradient(135deg,'+NAVY+',#1D3D5E);border-radius:6px;padding:22px;margin:20px 0;text-align:center}'
    +'.flow-lbl{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+GOLD+';font-weight:600;margin-bottom:12px}'
    +'.flow-row{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px}'
    +'.flow-s{text-align:center;min-width:70px}'
    +'.flow-n{width:28px;height:28px;border-radius:50%;background:rgba(201,168,76,0.2);border:1px solid '+GOLD+';color:'+GOLD+';font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px}'
    +'.flow-t{font-size:9px;font-weight:600;color:rgba(255,255,255,0.8);line-height:1.2}'
    +'.flow-a{color:'+GOLD+';font-size:10px;margin-top:-6px}'
    // ORG CHART
    +'.org-box{background:'+LIGHT+';border:1px solid #e8e4dc;border-radius:6px;padding:22px;margin:20px 0;text-align:center}'
    +'.org-lbl{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+NAVY+';font-weight:700;margin-bottom:14px}'
    +'.org-chart{display:flex;flex-direction:column;align-items:center}'
    +'.org-r{display:flex;justify-content:center;gap:10px;margin-bottom:4px;flex-wrap:wrap}'
    +'.org-nd{background:'+NAVY+';color:white;border-radius:5px;padding:8px 12px;min-width:120px}'
    +'.org-nd.top{background:linear-gradient(135deg,'+GOLD+',#B8933F);color:'+NAVY+'}'
    +'.org-nd.sm{min-width:100px;padding:6px 10px}'
    +'.org-nt{font-weight:700;font-size:11px}.org-nr{font-size:10px;opacity:0.7}'
    +'.org-ln{width:2px;height:10px;background:'+GOLD+';margin:2px auto}'
    // PP TILES
    +'.pp-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:20px 0}'
    +'.pp-tile{background:'+LIGHT+';border-radius:5px;padding:14px;border-left:3px solid '+GOLD+'}'
    +'.pp-nm{font-weight:700;color:'+NAVY+';font-size:13px;margin-bottom:2px}'
    +'.pp-cl{font-size:10px;color:#999;margin-bottom:4px}'
    +'.pp-val{font-family:"Cormorant Garamond",serif;font-size:20px;font-weight:800;color:'+GOLD+';margin-bottom:2px}'
    +'.pp-per{font-size:10px;color:#777}'
    // CORPORATE TABLE
    +'.corp td:first-child{font-weight:600;color:'+NAVY+';width:160px}'
    // TOOLBAR
    +'.tb{position:fixed;top:0;left:0;right:0;background:'+NAVY+';padding:8px 16px;display:flex;gap:8px;z-index:999}'
    +'.tb button{padding:7px 18px;background:'+GOLD+';color:'+NAVY+';border:none;border-radius:3px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}'
    +'.tb button:hover{background:#B8933F}'
    +'.tb .inf{color:rgba(255,255,255,0.5);font-size:11px;line-height:34px;margin-left:auto}'
    +'@media print{.tb{display:none!important}body{padding-top:0!important}}'
    +'body{padding-top:48px}';

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HGI Proposal \u2014 '+esc(o.agency||'')+'</title><style>'+css+'</style></head><body>';

  // TOOLBAR
  html += '<div class="tb no-print"><button onclick="window.print()">Print / Save PDF</button><button onclick="document.querySelectorAll(\'.page-break\').forEach(function(e){e.style.display=\'none\'});this.textContent=\'\u2713 Done\'">Continuous View</button><div class="inf">HGI Proposal Graphics Engine v2</div></div>';

  // COVER — with DALL-E generated image or Pexels fallback
  var coverBg = dalleImg || coverImg;
  var coverImgStyle = coverBg ? 'background-image:url('+coverBg+');background-size:cover;background-position:center;' : '';
  html += '<div class="cover" style="'+coverImgStyle+'">';
  if (coverBg) html += '<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(13,31,51,0.45) 0%,rgba(13,31,51,0.88) 60%,rgba(13,31,51,0.97) 100%);z-index:0;"></div>';
  html += '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:60px 40px;">';
  html += '<div class="c-badge">Proposal</div>';
  html += '<div class="c-title">'+esc(vertTitle)+'</div>';
  html += '<div class="c-sub">'+esc(o.title||'')+'</div>';
  html += '<div class="c-div"></div>';
  html += '<div class="c-meta">Submitted To</div>';
  html += '<div class="c-agency">'+esc(o.agency||'')+'</div>';
  html += '<div class="c-meta">Submitted By</div>';
  html += '<div class="c-hgi">'+HGI.name+'</div>';
  html += '<div class="c-legal">'+HGI.legal+' \u2014 '+HGI.ownership+' \u2014 Est. '+HGI.founded+'</div>';
  html += '<div class="c-date">Due: '+esc(dueDate)+'</div>';
  html += '</div></div>';

  // HEADER BAR
  html += '<div class="hdr"><div class="hdr-logo">HGI Global</div><div class="hdr-t">'+esc(o.agency||'')+' \u2014 '+esc(vertTitle)+'</div></div>';

  html += '<div class="wrap">';

  // STATS + CALLOUT
  html += buildStatsBar();
  html += '<div class="callout"><div class="callout-l">Key Differentiator</div>';
  html += '<div class="callout-t">HGI has delivered <strong>zero misappropriation across '+D+'13 billion+</strong> in federal program funds \u2014 an unmatched compliance record spanning nearly a century of fiduciary service.</div></div>';

  // Inject contextual photo after callout — complements text, does not replace it
  if (sectionImg1) html += imgTag(sectionImg1, agency+' program context', 200, agency+' \u2014 '+vertTitle);

  // THE FULL PROPOSAL — every word preserved, visuals injected inline
  html += proposalHTML;

  // Inject field work photo after approach section if found
  if (sectionImg2) {
    var approachIdx = html.indexOf('Approach');
    if (approachIdx > -1) {
      var approachInsert = html.indexOf('</h2></div>', approachIdx);
      if (approachInsert > -1) {
        var ai = approachInsert + '</h2></div>'.length;
        html = html.slice(0, ai) + imgTag(sectionImg2, 'Field assessment', 180, 'FEMA PA field operations \u2014 damage assessment \u2014 project worksheet development') + html.slice(ai);
      }
    }
  }

  // CORPORATE PROFILE at end
  html += '<div class="page-break"></div>';
  html += '<div class="sec-hdr"><span class="sec-n">\u2605</span><h2 class="sec-t">Corporate Profile</h2></div>';
  html += '<table class="tbl corp"><tbody>';
  html += '<tr><td>Legal Name</td><td>'+HGI.legal+'</td></tr>';
  html += '<tr><td>DBA</td><td>'+HGI.name+'</td></tr>';
  html += '<tr><td>Established</td><td>'+HGI.founded+' ('+HGI.years+' years)</td></tr>';
  html += '<tr><td>Ownership</td><td>'+HGI.ownership+'</td></tr>';
  html += '<tr><td>Headquarters</td><td>'+HGI.address+'</td></tr>';
  html += '<tr><td>Offices</td><td>'+HGI.offices+'</td></tr>';
  html += '<tr><td>Staff</td><td>'+HGI.staff+'</td></tr>';
  html += '<tr><td>SAM UEI</td><td>'+HGI.uei+'</td></tr>';
  html += '<tr><td>Insurance</td><td>'+HGI.insurance+'</td></tr>';
  html += '</tbody></table>';

  html += '</div>'; // wrap
  html += '<div class="ftr">CONFIDENTIAL \u2014 '+HGI.name+' | '+HGI.legal+' | '+HGI.address+' | '+HGI.phone+'</div>';
  html += '</body></html>';

  res.setHeader('Content-Type','text/html');
  return res.status(200).send(html);
}