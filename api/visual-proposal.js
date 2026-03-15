export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  const oppR = await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(id) + '&limit=1', { headers: H });
  const opps = await oppR.json();
  if (!opps || !opps.length) return res.status(404).json({ error: 'Not found' });
  const o = opps[0];

  const GOLD = '#C9A84C';
  const NAVY = '#1B3A5C';
  const WHITE = '#FFFFFF';
  const LIGHT = '#F8F6F0';
  const DARK = '#0A0A0A';

  function md(text) {
    if (!text) return '';
    return text
      .replace(/^### (.+)$/gm, '<h4 class="h4">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="h3">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 class="h2">$1</h2>')
      .replace(/^---$/gm, '<hr/>')
      .replace(/^\- \*\*(.+?)\*\*(.*)$/gm, '<div class="bl"><strong>$1</strong>$2</div>')
      .replace(/^\- (.+)$/gm, '<div class="bl">$1</div>')
      .replace(/^\* (.+)$/gm, '<div class="bl">$1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  }

  // Rate card
  var rates = [
    ['Principal','$180'],['Program Director','$165'],['Subject Matter Expert','$155'],
    ['Senior Grant Manager','$150'],['Senior Project Manager','$150'],['Appeals Specialist','$145'],
    ['Project Manager','$140'],['Architect / Engineer','$135'],['Cost Estimator','$125'],
    ['Grant Manager','$120'],['Senior Damage Assessor','$115'],['Grant Writer','$105'],
    ['Damage Assessor','$95'],['Administrative Support','$65']
  ];

  var rateRows = rates.map(function(r) { return '<tr><td>' + r[0] + '</td><td class="rate">' + r[1] + '</td></tr>'; }).join('');

  // Past performance
  var ppData = [
    { name: 'Road Home Program', client: 'Louisiana Recovery Authority', value: '$12B', period: '2006-2015', outcome: 'Zero misappropriation. 130,000+ families served.' },
    { name: 'PBGC Administration', client: 'Pension Benefit Guaranty Corp', value: '$8.5M/yr', period: '2019-Present', outcome: '34M beneficiaries. Zero audit findings.' },
    { name: 'Orleans Parish Schools', client: 'OPSB', value: '$283K/mo', period: '2002-Present', outcome: '22 years continuous service. Post-Katrina reconstruction.' },
    { name: 'TPCIGA', client: 'TX Property & Casualty', value: '28 years', period: '1998-Present', outcome: 'Longest continuous guaranty assoc. relationship in TX.' },
    { name: 'Terrebonne Parish Schools', client: 'TPSB', value: '$15M+', period: '2018-Present', outcome: 'Construction mgmt & grant admin. On-time delivery.' },
    { name: 'BP GCCF', client: 'BP / Gulf Coast', value: '1M+ claims', period: '2010-2013', outcome: 'Rapid mobilization. Complex federal oversight.' }
  ];

  var ppRows = ppData.map(function(p) {
    return '<div class="pp-card"><div class="pp-name">' + p.name + '</div><div class="pp-client">' + p.client + ' | ' + p.period + '</div><div class="pp-value">' + p.value + '</div><div class="pp-outcome">' + p.outcome + '</div></div>';
  }).join('');

  // Process flow steps
  var steps = ['Damage Assessment','PW Development','FEMA Submission','Obligation','Implementation','Compliance','Closeout'];
  var processFlow = steps.map(function(s, i) {
    return '<div class="step"><div class="step-num">' + (i+1) + '</div><div class="step-label">' + s + '</div></div>' + (i < steps.length - 1 ? '<div class="arrow">→</div>' : '');
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>HGI Proposal - ' + (o.agency || '') + '</title><style>' +
    '@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Source+Sans+3:wght@300;400;600;700&display=swap");' +
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +
    'body { font-family: "Source Sans 3", sans-serif; color: #222; line-height: 1.6; background: ' + WHITE + '; }' +
    '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } .page-break { page-break-before: always; } }' +

    // Cover page
    '.cover { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: linear-gradient(135deg, ' + NAVY + ' 0%, #0D2137 100%); color: white; text-align: center; position: relative; overflow: hidden; page-break-after: always; }' +
    '.cover::before { content: ""; position: absolute; top: -50%; right: -30%; width: 80%; height: 200%; background: radial-gradient(ellipse, rgba(201,168,76,0.12) 0%, transparent 70%); }' +
    '.cover-label { font-size: 14px; letter-spacing: 6px; text-transform: uppercase; color: ' + GOLD + '; margin-bottom: 24px; font-weight: 600; }' +
    '.cover-title { font-family: "Playfair Display", serif; font-size: 42px; font-weight: 800; line-height: 1.15; max-width: 700px; margin-bottom: 12px; }' +
    '.cover-sub { font-size: 20px; font-weight: 300; color: rgba(255,255,255,0.7); max-width: 600px; margin-bottom: 48px; }' +
    '.cover-line { width: 80px; height: 3px; background: ' + GOLD + '; margin: 0 auto 48px; }' +
    '.cover-to { font-size: 14px; color: rgba(255,255,255,0.5); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; }' +
    '.cover-agency { font-family: "Playfair Display", serif; font-size: 26px; font-weight: 700; margin-bottom: 48px; }' +
    '.cover-from-label { font-size: 14px; color: rgba(255,255,255,0.5); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; }' +
    '.cover-hgi { font-family: "Playfair Display", serif; font-size: 36px; font-weight: 900; color: ' + GOLD + '; margin-bottom: 4px; }' +
    '.cover-tagline { font-size: 16px; color: rgba(255,255,255,0.6); font-style: italic; margin-bottom: 48px; }' +
    '.cover-date { font-size: 18px; font-weight: 600; }' +
    '.cover-validity { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }' +

    // Content
    '.content { max-width: 900px; margin: 0 auto; padding: 60px 48px; }' +
    'h2.h2, h2.section-title { font-family: "Playfair Display", serif; font-size: 28px; color: ' + NAVY + '; margin: 48px 0 16px; padding-bottom: 8px; border-bottom: 3px solid ' + GOLD + '; }' +
    'h3.h3 { font-size: 18px; font-weight: 700; color: ' + NAVY + '; margin: 32px 0 12px; }' +
    'h4.h4 { font-size: 15px; font-weight: 700; color: #444; margin: 20px 0 8px; }' +
    'p { margin-bottom: 14px; font-size: 15px; line-height: 1.75; color: #333; }' +
    'strong { color: #111; }' +
    '.bl { padding: 6px 0 6px 16px; border-left: 3px solid ' + GOLD + '; margin-bottom: 8px; font-size: 14px; color: #444; }' +
    'hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }' +

    // Stats bar
    '.stats { display: flex; gap: 0; margin: 32px 0; border-radius: 8px; overflow: hidden; }' +
    '.stat { flex: 1; padding: 20px 16px; text-align: center; background: ' + NAVY + '; color: white; }' +
    '.stat:nth-child(even) { background: #234B6E; }' +
    '.stat-num { font-family: "Playfair Display", serif; font-size: 32px; font-weight: 800; color: ' + GOLD + '; }' +
    '.stat-label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.6); margin-top: 4px; }' +

    // Process flow
    '.process { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin: 32px 0; padding: 24px; background: ' + LIGHT + '; border-radius: 8px; }' +
    '.step { text-align: center; }' +
    '.step-num { width: 36px; height: 36px; border-radius: 50%; background: ' + NAVY + '; color: ' + GOLD + '; font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px; }' +
    '.step-label { font-size: 11px; font-weight: 600; color: ' + NAVY + '; letter-spacing: 0.5px; }' +
    '.arrow { color: ' + GOLD + '; font-size: 20px; font-weight: 800; margin-top: -10px; }' +

    // Past performance cards
    '.pp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }' +
    '.pp-card { background: ' + LIGHT + '; border-radius: 8px; padding: 16px; border-left: 4px solid ' + GOLD + '; }' +
    '.pp-name { font-weight: 700; color: ' + NAVY + '; font-size: 15px; margin-bottom: 2px; }' +
    '.pp-client { font-size: 12px; color: #888; margin-bottom: 8px; }' +
    '.pp-value { font-family: "Playfair Display", serif; font-size: 24px; font-weight: 800; color: ' + GOLD + '; margin-bottom: 4px; }' +
    '.pp-outcome { font-size: 13px; color: #555; line-height: 1.5; }' +

    // Rate table
    'table { width: 100%; border-collapse: collapse; margin: 24px 0; }' +
    'th { background: ' + NAVY + '; color: white; padding: 10px 14px; text-align: left; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }' +
    'td { padding: 10px 14px; border-bottom: 1px solid #eee; font-size: 14px; }' +
    'td.rate { font-weight: 700; color: ' + NAVY + '; font-size: 16px; }' +
    'tr:nth-child(even) td { background: ' + LIGHT + '; }' +

    // Org chart
    '.org { margin: 32px 0; text-align: center; }' +
    '.org-level { display: flex; justify-content: center; gap: 16px; margin-bottom: 8px; }' +
    '.org-box { background: ' + NAVY + '; color: white; border-radius: 6px; padding: 10px 16px; min-width: 140px; }' +
    '.org-box.exec { background: ' + GOLD + '; color: ' + NAVY + '; }' +
    '.org-title { font-weight: 700; font-size: 13px; }' +
    '.org-rate { font-size: 11px; opacity: 0.7; }' +
    '.org-connector { width: 2px; height: 16px; background: ' + GOLD + '; margin: 0 auto; }' +

    // Callout box
    '.callout { background: linear-gradient(135deg, ' + NAVY + ', #234B6E); color: white; border-radius: 8px; padding: 24px; margin: 32px 0; }' +
    '.callout-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ' + GOLD + '; margin-bottom: 8px; }' +
    '.callout-text { font-size: 18px; font-weight: 300; line-height: 1.6; }' +
    '.callout-text strong { color: ' + GOLD + '; }' +

    // Discriminator table
    '.disc-table td:first-child { font-weight: 700; color: ' + NAVY + '; width: 200px; }' +
    '.disc-table td:nth-child(2) { color: #1a6b1a; background: #f0faf0; }' +
    '.disc-table td:nth-child(3) { color: #888; background: #fafafa; }' +

    // Header/footer for print
    '.header { padding: 16px 48px; border-bottom: 2px solid ' + GOLD + '; display: flex; justify-content: space-between; align-items: center; }' +
    '.header-logo { font-family: "Playfair Display", serif; font-size: 18px; font-weight: 900; color: ' + GOLD + '; }' +
    '.header-title { font-size: 12px; color: #999; }' +
    '.footer { padding: 12px 48px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #bbb; }' +

    // Print button
    '.print-btn { position: fixed; top: 20px; right: 20px; padding: 12px 24px; background: ' + GOLD + '; color: ' + NAVY + '; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; z-index: 1000; font-family: inherit; }' +
    '.print-btn:hover { background: #B8933F; }' +
  '</style></head><body>' +

  // Print button
  '<button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>' +

  // COVER PAGE
  '<div class="cover">' +
    '<div class="cover-label">PROPOSAL</div>' +
    '<div class="cover-title">' + (o.title || 'Professional Services') + '</div>' +
    '<div class="cover-sub">Comprehensive Disaster Recovery Project Management</div>' +
    '<div class="cover-line"></div>' +
    '<div class="cover-to">Submitted to</div>' +
    '<div class="cover-agency">' + (o.agency || '') + ', Louisiana</div>' +
    '<div class="cover-from-label">Submitted by</div>' +
    '<div class="cover-hgi">HGI Global, Inc.</div>' +
    '<div class="cover-tagline">Hammerman & Gainer LLC — 97 Years of Fiduciary Excellence</div>' +
    '<div class="cover-date">' + (o.due_date ? o.due_date.split(' ')[0].replace(/-/g, ' ') : 'April 2026') + '</div>' +
    '<div class="cover-validity">Proposal valid for ninety (90) days from submission</div>' +
  '</div>' +

  // HEADER
  '<div class="header"><div class="header-logo">HGI Global</div><div class="header-title">' + (o.agency || '') + ' — Disaster Recovery PM Services</div></div>' +

  '<div class="content">' +

  // STATS BAR
  '<div class="stats">' +
    '<div class="stat"><div class="stat-num">97</div><div class="stat-label">Years in Business</div></div>' +
    '<div class="stat"><div class="stat-num">$12B</div><div class="stat-label">Federal Funds Managed</div></div>' +
    '<div class="stat"><div class="stat-num">0</div><div class="stat-label">Misappropriations</div></div>' +
    '<div class="stat"><div class="stat-num">34M</div><div class="stat-label">Beneficiaries Served</div></div>' +
    '<div class="stat"><div class="stat-num">150+</div><div class="stat-label">Professionals</div></div>' +
  '</div>' +

  // VALUE PROPOSITION CALLOUT
  '<div class="callout">' +
    '<div class="callout-label">Value Proposition</div>' +
    '<div class="callout-text">HGI\'s approach to Project Worksheet optimization and Section 406 hazard mitigation integration typically identifies <strong>15–25% in additional eligible reimbursement</strong> beyond initial damage estimates — translating to potentially <strong>millions of dollars</strong> in additional federal funding for ' + (o.agency || 'your community') + '.</div>' +
  '</div>' +

  // EXECUTIVE SUMMARY
  '<h2 class="section-title">Executive Summary</h2>' +
  '<p>' + md(o.description || '') + '</p>' +

  // PROCESS FLOW
  '<h2 class="section-title">Our Disaster Recovery Methodology</h2>' +
  '<div class="process">' + processFlow + '</div>' +

  // SCOPE ANALYSIS
  (o.scope_analysis ? '<h2 class="section-title">Scope Analysis</h2><div>' + md(o.scope_analysis) + '</div>' : '') +

  // ORG CHART
  '<h2 class="section-title">Proposed Team Structure</h2>' +
  '<div class="org">' +
    '<div class="org-level"><div class="org-box exec"><div class="org-title">Program Director</div><div class="org-rate">$165/hr</div></div></div>' +
    '<div class="org-connector"></div>' +
    '<div class="org-level">' +
      '<div class="org-box"><div class="org-title">PA Subject Matter Expert</div><div class="org-rate">$155/hr</div></div>' +
      '<div class="org-box"><div class="org-title">Sr Grant Manager</div><div class="org-rate">$150/hr</div></div>' +
      '<div class="org-box"><div class="org-title">Sr Project Manager</div><div class="org-rate">$150/hr</div></div>' +
    '</div>' +
    '<div class="org-connector"></div>' +
    '<div class="org-level">' +
      '<div class="org-box"><div class="org-title">Grant Manager</div><div class="org-rate">$120/hr</div></div>' +
      '<div class="org-box"><div class="org-title">Cost Estimator</div><div class="org-rate">$125/hr</div></div>' +
      '<div class="org-box"><div class="org-title">Appeals Specialist</div><div class="org-rate">$145/hr</div></div>' +
      '<div class="org-box"><div class="org-title">Admin Support</div><div class="org-rate">$65/hr</div></div>' +
    '</div>' +
  '</div>' +

  // PAST PERFORMANCE
  '<h2 class="section-title">Past Performance</h2>' +
  '<div class="pp-grid">' + ppRows + '</div>' +

  // FINANCIAL ANALYSIS
  (o.financial_analysis ? '<div class="page-break"></div><h2 class="section-title">Financial & Staffing Analysis</h2><div>' + md(o.financial_analysis) + '</div>' : '') +

  // PRICING
  '<h2 class="section-title">Pricing — Exhibit A</h2>' +
  '<p>All rates are fully burdened and inclusive of labor, overhead, profit, and administrative costs. Rates remain firm for three (3) years.</p>' +
  '<table><thead><tr><th>Position</th><th>Hourly Rate</th></tr></thead><tbody>' + rateRows + '</tbody></table>' +

  // RESEARCH
  (o.research_brief ? '<div class="page-break"></div><h2 class="section-title">Competitive Intelligence</h2><div>' + md(o.research_brief) + '</div>' : '') +

  // WINNABILITY
  (o.capture_action ? '<h2 class="section-title">Winnability Assessment</h2><div>' + md(o.capture_action) + '</div>' : '') +

  // DISCRIMINATOR TABLE
  '<h2 class="section-title">Why HGI</h2>' +
  '<table class="disc-table"><thead><tr><th>Factor</th><th>HGI Global</th><th>Typical Competitor</th></tr></thead><tbody>' +
    '<tr><td>CDBG-DR Scale</td><td>$12B Road Home — largest in U.S. history</td><td>Advisory roles on smaller programs</td></tr>' +
    '<tr><td>FEMA PA</td><td>Current GOHSEP TA contract</td><td>Past project experience only</td></tr>' +
    '<tr><td>Louisiana Presence</td><td>97 years, Kenner HQ</td><td>National firms or small local firms</td></tr>' +
    '<tr><td>Federal Scale</td><td>PBGC: 34M beneficiaries</td><td>Limited federal program admin</td></tr>' +
    '<tr><td>Audit Record</td><td>Zero misappropriation across $12B+</td><td>No comparable track record</td></tr>' +
    '<tr><td>Technology</td><td>GoBerri™ proprietary platform</td><td>Off-the-shelf tools</td></tr>' +
    '<tr><td>Client Retention</td><td>22-year OPSB, 28-year TPCIGA</td><td>Typical 2-5 year engagements</td></tr>' +
  '</tbody></table>' +

  '</div>' +

  // FOOTER
  '<div class="footer">CONFIDENTIAL — HGI Global, Inc. | Hammerman & Gainer LLC | 11207 Airline Highway, Kenner, LA 70062 | 504-982-5030</div>' +

  '</body></html>';

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}