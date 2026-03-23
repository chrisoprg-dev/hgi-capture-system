import { HGI_CONTEXT } from './hgi-master-context.js';
export const config = { maxDuration: 120 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function sbGet(path) {
  const r = await fetch(SB + '/rest/v1/' + path, { headers: H });
  return r.json();
}

async function callClaude(prompt, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system: system || 'You are the HGI Capture Intelligence coordinator. Be directive, specific, and brief.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
}

// Evaluate a single opportunity and determine what action is needed next
function evaluateOpportunity(opp) {
  const now = new Date();
  const daysUntilDeadline = opp.due_date ? Math.ceil((new Date(opp.due_date) - now) / (1000*60*60*24)) : null;
  const daysSinceActivity = opp.last_updated ? Math.floor((now - new Date(opp.last_updated)) / (1000*60*60*24)) : 999;
  const stage = opp.stage || 'identified';
  const opi = opp.opi_score || 0;

  // Determine urgency color
  let urgency = 'low';
  if (daysUntilDeadline !== null && daysUntilDeadline <= 7) urgency = 'critical';
  else if (daysUntilDeadline !== null && daysUntilDeadline <= 14) urgency = 'high';
  else if (daysSinceActivity > 7 && opi >= 70) urgency = 'high';
  else if (opi >= 75) urgency = 'medium';

  // Determine what the next action is based on stage and what's been done
  let nextAction = null;
  let actionLabel = null;
  let actionModule = null;
  let actionPrompt = null;

  if (stage === 'identified' || stage === 'qualifying') {
    if (!opp.rfp_text || opp.rfp_text.length < 100) {
      nextAction = 'fetch_rfp';
      actionLabel = 'Retrieve RFP Documents';
      actionModule = 'discovery';
      actionPrompt = 'RFP not yet retrieved. Go to Opportunity Discovery → Retrieve Docs and paste the source URL to pull the full RFP.';
    } else if (!opp.description || opp.description.length < 50) {
      nextAction = 'run_workflow';
      actionLabel = 'Run Full Workflow';
      actionModule = 'workflow';
      actionPrompt = 'RFP is loaded. Run Full Workflow to get decomposition, executive brief, and OPI score.';
    } else {
      nextAction = 'run_workflow';
      actionLabel = 'Run Full Workflow';
      actionModule = 'workflow';
      actionPrompt = 'Ready for Full Workflow — decompose RFP, generate executive brief, score opportunity.';
    }
  } else if (stage === 'pursuing') {
    nextAction = 'start_proposal';
    actionLabel = 'Start Proposal Draft';
    actionModule = 'proposal';
    actionPrompt = 'Pursuing stage — time to start drafting. Auto-generate all sections takes ~' + (10*2) + ' minutes.';
  } else if (stage === 'proposal') {
    nextAction = 'continue_proposal';
    actionLabel = 'Continue Proposal';
    actionModule = 'proposal';
    actionPrompt = 'Proposal in progress. Run Compliance Scan when sections are complete, then Export to Word.';
  }

  return {
    id: opp.id,
    title: opp.title,
    agency: opp.agency,
    opi,
    stage,
    urgency,
    daysUntilDeadline,
    daysSinceActivity,
    nextAction,
    actionLabel,
    actionModule,
    actionPrompt,
    capture_action: opp.capture_action,
    vertical: opp.vertical,
    estimated_value: opp.estimated_value,
    due_date: opp.due_date,
    why_hgi_wins: opp.why_hgi_wins,
    key_requirements: opp.key_requirements,
    scope_of_work: opp.scope_of_work,
    hgi_fit: opp.hgi_fit,
    incumbent: opp.incumbent,
    recompete: opp.recompete,
    hgi_relevance: opp.hgi_relevance,
    source_url: opp.source_url,
    description: opp.description
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Pull full pipeline state
    const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
    const [opportunities, recentHunts, femaDeclarations, lapacStatus] = await Promise.allSettled([
      sbGet('opportunities?status=eq.active&order=opi_score.desc&limit=50'),
      sbGet('hunt_runs?order=run_at.desc&limit=50'),
      fetch("https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=5&$filter=stateCode%20in%20('LA','TX','FL','MS','AL','GA')")
        .then(r => r.ok ? r.json() : { DisasterDeclarationsSummaries: [] })
        .then(d => d.DisasterDeclarationsSummaries || [])
        .catch(() => []),
      APIFY_TOKEN ? fetch('https://api.apify.com/v2/acts/hVmvojDyPeJ799Suf/runs/last?token=' + APIFY_TOKEN)
        .then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null)
    ]);

    const opps = opportunities.status === 'fulfilled' ? opportunities.value || [] : [];
    const hunts = recentHunts.status === 'fulfilled' ? recentHunts.value || [] : [];
    const declarations = femaDeclarations.status === 'fulfilled' ? femaDeclarations.value || [] : [];
    const lapacRun = lapacStatus && lapacStatus.status === 'fulfilled' ? lapacStatus.value : null;

    const now = new Date();

    // ── SELF-HEAL: Patch any active opportunity with missing due_date that has known deadline ──
    try {
      const missingDeadline = (opportunities.status === 'fulfilled' ? opportunities.value || [] : [])
        .filter(o => !o.due_date && o.rfp_text && o.rfp_text.match(/march 19|3\/19\/2026|2026-03-19/i));
      for (const o of missingDeadline) {
        await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(o.id), {
          method: 'PATCH',
          headers: { ...H, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ due_date: '2026-03-19', urgency: 'IMMEDIATE', last_updated: new Date().toISOString() })
        });
      }
    } catch(healErr) {
      console.warn('Self-heal patch failed:', healErr.message);
    }

    // ── GENERATE ACTION ITEMS ──────────────────────────────────────────────

    const actions = [];

    // 1. CRITICAL: Deadlines within 7 days
    opps.filter(o => o.due_date).forEach(o => {
      const days = Math.ceil((new Date(o.due_date) - now) / (1000*60*60*24));
      if (days > 0 && days <= 7) {
        const evaluated = evaluateOpportunity(o);
        actions.push({
          priority: 1,
          urgency: 'critical',
          icon: '🔴',
          title: o.title,
          agency: o.agency,
          opportunity_id: o.id,
          headline: days + ' day' + (days === 1 ? '' : 's') + ' until deadline — ' + o.agency,
          detail: evaluated.actionPrompt || o.capture_action || 'Immediate attention required.',
          action_label: evaluated.actionLabel || 'Review Now',
          action_module: evaluated.actionModule || 'tracker',
          opi: o.opi_score,
          days_until_deadline: days,
          why_hgi_wins: evaluated.why_hgi_wins,
          key_requirements: evaluated.key_requirements,
          scope_of_work: evaluated.scope_of_work,
          hgi_fit: evaluated.hgi_fit,
          incumbent: evaluated.incumbent,
          recompete: evaluated.recompete,
          estimated_value: evaluated.estimated_value || o.estimated_value,
          source_url: evaluated.source_url,
          description: evaluated.description || o.description
        });
      }
    });

    // 2. HIGH: New high-OPI opportunities with no workflow activity (stale)
    opps.filter(o => (o.opi_score || 0) >= 70 && (o.stage === 'identified' || o.stage === 'qualifying')).forEach(o => {
      const daysSince = o.last_updated ? Math.floor((now - new Date(o.last_updated)) / (1000*60*60*24)) : 999;
      if (daysSince >= 3) {
        const evaluated = evaluateOpportunity(o);
        actions.push({
          priority: 2,
          urgency: 'high',
          icon: '🟡',
          title: o.title,
          agency: o.agency,
          opportunity_id: o.id,
          headline: 'OPI ' + o.opi_score + ' — no activity in ' + daysSince + ' days',
          detail: evaluated.actionPrompt || 'High-value opportunity going stale. ' + (o.capture_action || ''),
          action_label: evaluated.actionLabel || 'Start Workflow',
          action_module: evaluated.actionModule || 'workflow',
          opi: o.opi_score,
          days_since_activity: daysSince,
          why_hgi_wins: evaluated.why_hgi_wins,
          key_requirements: evaluated.key_requirements,
          scope_of_work: evaluated.scope_of_work,
          hgi_fit: evaluated.hgi_fit,
          incumbent: evaluated.incumbent,
          recompete: evaluated.recompete,
          estimated_value: evaluated.estimated_value || o.estimated_value,
          source_url: evaluated.source_url,
          description: evaluated.description || o.description
        });
      }
    });

    // 3. HIGH: New Tier 1 opportunities discovered recently (last 24 hours)
    opps.filter(o => {
      const hoursOld = (now - new Date(o.discovered_at)) / (1000*60*60);
      return hoursOld <= 24 && (o.opi_score || 0) >= 70;
    }).forEach(o => {
      const evaluated = evaluateOpportunity(o);
      actions.push({
        priority: 2,
        urgency: 'high',
        icon: '⚡',
        title: o.title,
        agency: o.agency,
        opportunity_id: o.id,
        headline: 'New Tier 1 discovered — OPI ' + o.opi_score,
        detail: (o.description || '') + (o.capture_action ? ' Action: ' + o.capture_action : ''),
        action_label: 'Start Full Workflow',
        action_module: 'workflow',
        opi: o.opi_score,
        why_hgi_wins: evaluated.why_hgi_wins,
        key_requirements: evaluated.key_requirements,
        scope_of_work: evaluated.scope_of_work,
        hgi_fit: evaluated.hgi_fit,
        incumbent: evaluated.incumbent,
        recompete: evaluated.recompete,
        estimated_value: evaluated.estimated_value || o.estimated_value,
        source_url: evaluated.source_url,
        description: evaluated.description || o.description
      });
    });

    // 4. MEDIUM: Pursuing stage opportunities with no proposal started
    opps.filter(o => o.stage === 'pursuing').forEach(o => {
      const daysSince = o.last_updated ? Math.floor((now - new Date(o.last_updated)) / (1000*60*60*24)) : 999;
      const evaluated = evaluateOpportunity(o);
      actions.push({
        priority: 3,
        urgency: 'medium',
        icon: '🔵',
        title: o.title,
        agency: o.agency,
        opportunity_id: o.id,
        headline: 'Pursuing — proposal not started, ' + daysSince + ' days since last activity',
        detail: 'Ready to draft. Auto-generate all sections in ~20 minutes. ' + (o.capture_action || ''),
        action_label: 'Start Proposal',
        action_module: 'proposal',
        opi: o.opi_score,
        why_hgi_wins: evaluated.why_hgi_wins,
        key_requirements: evaluated.key_requirements,
        scope_of_work: evaluated.scope_of_work,
        hgi_fit: evaluated.hgi_fit,
        incumbent: evaluated.incumbent,
        recompete: evaluated.recompete,
        estimated_value: evaluated.estimated_value || o.estimated_value,
        source_url: evaluated.source_url,
        description: evaluated.description || o.description
      });
    });
// 4b. MEDIUM: Proposal-stage opportunities actively in progress
    opps.filter(o => o.stage === 'proposal').forEach(o => {
      const daysUntilDeadline = o.due_date ? Math.ceil((new Date(o.due_date) - now) / (1000*60*60*24)) : null;
      const daysSince = o.last_updated ? Math.floor((now - new Date(o.last_updated)) / (1000*60*60*24)) : 999;
      const evaluated = evaluateOpportunity(o);
      actions.push({
        priority: 3,
        urgency: 'medium',
        icon: '✦',
        title: o.title,
        agency: o.agency,
        opportunity_id: o.id,
        headline: 'Proposal in progress' + (daysUntilDeadline ? ' — ' + daysUntilDeadline + ' days until deadline' : '') + (daysSince > 0 ? ' · last updated ' + daysSince + 'd ago' : ''),
        detail: 'Proposal draft active. Complete all sections, run Compliance Scan, then Export to Word for final review.',
        action_label: 'Continue Proposal',
        action_module: 'proposal',
        opi: o.opi_score,
        days_until_deadline: daysUntilDeadline,
        why_hgi_wins: evaluated.why_hgi_wins,
        key_requirements: evaluated.key_requirements,
        scope_of_work: evaluated.scope_of_work,
        hgi_fit: evaluated.hgi_fit,
        incumbent: evaluated.incumbent,
        recompete: evaluated.recompete,
        estimated_value: evaluated.estimated_value || o.estimated_value,
        source_url: evaluated.source_url,
        description: evaluated.description || o.description
      });
    });
    // 5. INTELLIGENCE: New FEMA declarations in HGI states
    const recentDeclarations = declarations.filter(d => {
      const daysSince = Math.floor((now - new Date(d.declarationDate)) / (1000*60*60*24));
      return daysSince <= 7;
    });
    recentDeclarations.forEach(d => {
      actions.push({
        priority: 2,
        urgency: 'high',
        icon: '🚨',
        title: 'FEMA Declaration: ' + d.declarationTitle,
        agency: 'FEMA / ' + d.stateCode,
        headline: 'New disaster declaration in ' + d.stateCode + ' — contracts will follow',
        detail: d.incidentType + ' — ' + d.declarationTitle + '. HGI FEMA PA experience directly applicable. Generate your 48-hour response package now.',
        action_label: 'Generate Response Package',
        action_module: 'content',
        declaration_number: d.disasterNumber
      });
    });

    // 6. PIPELINE HEALTH: Summary stats
    const pipelineStats = {
      total_active: opps.length,
      tier1: opps.filter(o => (o.opi_score || 0) >= 75).length,
      pursuing: opps.filter(o => o.stage === 'pursuing').length,
      proposal: opps.filter(o => o.stage === 'proposal').length,
      submitted: opps.filter(o => o.stage === 'submitted').length,
      stale: opps.filter(o => {
        const days = o.last_updated ? Math.floor((now - new Date(o.last_updated)) / (1000*60*60*24)) : 999;
        return days > 7 && (o.opi_score || 0) >= 60;
      }).length,
      last_scraper_run: hunts.find(h => h.source === 'apify_batch' || h.source === 'apify_central_bidding')?.run_at || null,
      new_today: opps.filter(o => (now - new Date(o.discovered_at)) < 24*60*60*1000).length,
      // Scraper deep stats — real data from hunt_runs
      scraper_batches_today: hunts.filter(h => (h.source === 'apify_batch' || h.source === 'apify_central_bidding') && (now - new Date(h.run_at)) < 86400000).length,
      scraper_batches_total: hunts.filter(h => h.source === 'apify_batch' || h.source === 'apify_central_bidding').length,
      scraper_last_batch_scanned: (() => { const latest = hunts.find(h => h.source === 'apify_batch' || h.source === 'apify_central_bidding'); return latest ? (latest.scanned || latest.opportunities_found || 0) : 0; })(),
      scraper_rfps_reviewed_today: (() => { const t = hunts.filter(h => (h.source === 'apify_batch' || h.source === 'apify_central_bidding') && (now - new Date(h.run_at)) < 86400000); return t.reduce((s, h) => s + (h.scanned || h.opportunities_found || 0), 0); })(),
      scraper_net_new_today: (() => { const t = hunts.filter(h => (h.source === 'apify_batch' || h.source === 'apify_central_bidding') && (now - new Date(h.run_at)) < 86400000); return t.reduce((s, h) => s + (h.net_new || h.opportunities_new || 0), 0); })(),
      scraper_total_categories: 479,
      scraper_categories_covered: (() => { const latest = hunts.find(h => h.source === 'apify_batch' || h.source === 'apify_central_bidding'); return latest ? (latest.scanned || latest.opportunities_found || 0) : 0; })(),
      opportunities_filtered_today: 0,
      opportunities_active_today: opps.filter(o => (now - new Date(o.discovered_at)) < 86400000 && o.status === 'active').length,
      opportunities_pending_review: opps.filter(o => o.status === 'active' && (!o.stage || o.stage === 'identified')).length,
      top_verticals_today: (() => { const v = {}; opps.forEach(o => { if(o.vertical) v[o.vertical] = (v[o.vertical]||0)+1; }); return Object.entries(v).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>k+':'+n).join(', ') || 'none'; })(),
      // Multi-scraper sources for dashboard display
      scraper_sources: [
        {
          name: 'Central Bidding',
          schedule: 'Every 6 min',
          last_run: hunts.find(h => h.source === 'apify_batch' || h.source === 'apify_central_bidding')?.run_at || null,
          runs_today: hunts.filter(h => (h.source === 'apify_batch' || h.source === 'apify_central_bidding') && (now - new Date(h.run_at)) < 86400000).length,
          status: (() => { const r = hunts.find(h => h.source === 'apify_batch' || h.source === 'apify_central_bidding'); return r && (now - new Date(r.run_at)) < 1200000 ? 'live' : r ? 'delayed' : 'unknown'; })()
        },
        {
          name: 'LaPAC',
          schedule: 'On demand',
          last_run: lapacRun ? (lapacRun.data ? lapacRun.data.finishedAt || lapacRun.data.startedAt : null) : null,
          runs_today: 0,
          status: lapacRun && lapacRun.data && lapacRun.data.status === 'SUCCEEDED' ? 'live' : 'unknown'
        },
        {
          name: 'Grants.gov',
          schedule: '4x daily',
          last_run: hunts.find(h => h.source === 'grants_gov')?.run_at || null,
          runs_today: hunts.filter(h => h.source === 'grants_gov' && (now - new Date(h.run_at)) < 86400000).length,
          status: (() => { const r = hunts.find(h => h.source === 'grants_gov'); return r && (now - new Date(r.run_at)) < 21600000 ? 'live' : r ? 'scheduled' : 'unknown'; })()
        },
        {
          name: 'Alabama',
          schedule: '2x daily',
          last_run: hunts.find(h => h.source === 'scrape_alabama')?.run_at || null,
          runs_today: hunts.filter(h => h.source === 'scrape_alabama' && (now - new Date(h.run_at)) < 86400000).length,
          status: 'setup'
        },
        {
          name: 'Georgia GPR',
          schedule: '2x daily',
          last_run: hunts.find(h => h.source === 'scrape_georgia')?.run_at || null,
          runs_today: hunts.filter(h => h.source === 'scrape_georgia' && (now - new Date(h.run_at)) < 86400000).length,
          status: 'setup'
        }
      ]
    };

    // Sort actions by priority then urgency
    actions.sort((a, b) => a.priority - b.priority);

    // Remove duplicates (same opportunity_id)
    const seen = new Set();
    const deduped = actions.filter(a => {
      if (!a.opportunity_id) return true;
      if (seen.has(a.opportunity_id)) return false;
      seen.add(a.opportunity_id);
      return true;
    });

    // 7. Generate AI intelligence packages
    let topRecommendation = null;
    let opportunityBriefs = {};

    if (opps.length > 0) {
      try {
        const topOpps = opps.slice(0, 5).map(o =>
          o.title + ' | OPI:' + o.opi_score + ' | Stage:' + o.stage +
          ' | Due:' + (o.due_date || 'TBD') + ' | Agency:' + o.agency +
          ' | Value:' + (o.estimated_value || 'TBD') +
          ' | Vertical:' + o.vertical +
          ' | Why HGI wins:' + (Array.isArray(o.why_hgi_wins) ? o.why_hgi_wins.join('; ') : (o.why_hgi_wins || 'TBD')) +
          ' | Incumbent:' + (o.incumbent || 'Unknown') +
          ' | Capture action:' + (o.capture_action || 'TBD')
        ).join('\n');
        const actionSummary = deduped.slice(0, 5).map(a => a.icon + ' ' + a.headline).join('\n');
        const declarationSummary = recentDeclarations.length > 0
          ? '\nNEW FEMA DECLARATIONS: ' + recentDeclarations.map(d => d.declarationTitle + ' (' + d.stateCode + ')').join(', ')
          : '';

        const currentDateStr = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
        const currentMonth = now.toLocaleString('en-US', { month:'long' });
        const currentYear = now.getFullYear();

        // Build real-data context for market pulse
        const scraperContext = hunts.length > 0
          ? 'Scraper last ran: ' + new Date(hunts[0].run_at).toLocaleString() + '. CB batches today: ' + hunts.filter(h => (h.source === 'apify_central_bidding' || h.source === 'apify_batch') && (now - new Date(h.run_at)) < 86400000).length + '. Grants.gov runs today: ' + hunts.filter(h => h.source === 'grants_gov' && (now - new Date(h.run_at)) < 86400000).length
          : 'Scraper status unknown';

        const declarationContext = declarations.length > 0
          ? 'Recent FEMA declarations in HGI states: ' + declarations.slice(0,3).map(d => d.declarationTitle + ' (' + d.stateCode + ', declared ' + new Date(d.declarationDate).toLocaleDateString() + ')').join('; ')
          : 'No recent FEMA declarations in LA/TX/FL/MS/AL/GA';

        const verticalBreakdown = opps.length > 0
          ? Object.entries(opps.reduce((acc, o) => { acc[o.vertical||'unknown'] = (acc[o.vertical||'unknown']||0)+1; return acc; }, {})).map(([k,v]) => v + ' ' + k).join(', ')
          : 'No active pipeline';

        const fullBrief = await callClaude(
          'TODAY IS ' + currentDateStr + '. You are generating a REAL-TIME intelligence briefing. The current year is ' + currentYear + ', current month is ' + currentMonth + '. Do NOT reference 2024 or any past year as current.\n\nYou are the HGI capture intelligence coordinator briefing Christopher Oney, President of HGI Global / Hammerman & Gainer LLC — a 96-year-old, 100% minority-owned program management, TPA, claims, and professional services firm. HGI operates across: disaster recovery, TPA/claims administration, property tax appeals, workforce services/WIOA, construction management, housing/HUD, grant management, mediation services, class action settlement administration, staff augmentation, call centers, DEI consulting, and more. Louisiana-based, operating in LA/TX/FL/MS/AL/GA.\n\nLIVE PIPELINE DATA (as of right now):\n' + topOpps + '\n\nLIVE PENDING ACTIONS:\n' + actionSummary + '\n\nLIVE FEMA DATA: ' + declarationContext + '\n\nLIVE SCRAPER STATUS: ' + scraperContext + '\n\nPIPELINE VERTICAL MIX: ' + verticalBreakdown + '\n\nSEASONAL CONTEXT: It is ' + currentMonth + ' ' + currentYear + '. In Louisiana and Gulf Coast states, this is the period leading into the ' + currentYear + ' severe weather season. Any market pulse commentary must reflect conditions in ' + currentMonth + ' ' + currentYear + ', not any prior year.\n\nGenerate a JSON response with this exact structure:\n{\n  "top_recommendation": "2-3 sentences, directive, names specific opportunity and exact action today",\n  "opportunity_briefs": [\n    {\n      "opportunity_id": "id from pipeline",\n      "headline": "1 sentence why this matters RIGHT NOW in ' + currentMonth + ' ' + currentYear + '",\n      "win_case": "2-3 sentences: why HGI wins this, specific past performance that applies",\n      "risk": "1 sentence: biggest risk or obstacle",\n      "competitor_intel": "1 sentence: who else is likely bidding and their position",\n      "this_week_action": "exactly what to do this week, specific and directive"\n    }\n  ],\n  "market_pulse": "2-3 sentences on real market conditions RIGHT NOW in ' + currentMonth + ' ' + currentYear + ' — based on the actual FEMA declaration data and pipeline signals above. Reference specific real data provided. Do NOT mention 2024 or prior years as current."\n}\n\nReturn ONLY valid JSON. No markdown.',
          'You are a world-class government contracting capture intelligence analyst operating in real-time on ' + currentDateStr + '. The current year is ' + currentYear + '. Never reference 2024 as the current year. Base all market commentary strictly on the live data provided. Name competitors appropriate to the SPECIFIC vertical of each opportunity — not generic disaster recovery firms for every bid. For disaster: ICF, Hagerty, CDR Maguire, Tetra Tech. For TPA/claims: Sedgwick, Gallagher Bassett, Broadspire. For workforce: Equus, ResCare. For settlement admin: Epiq, Kroll, JND Legal. Use the vertical from the pipeline data to select the right competitors. Reference HGI real past performance: Road Home ' + String.fromCharCode(36) + '67M/' + String.fromCharCode(36) + '13B+ zero misappropriation, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20+ years Texas, City of NOLA WC TPA active, SWBNO billing appeals active. Return only valid JSON.'
        );

        try {
          const clean = fullBrief.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
          topRecommendation = parsed.top_recommendation || null;
          (parsed.opportunity_briefs || []).forEach(b => {
            if (b.opportunity_id) opportunityBriefs[b.opportunity_id] = b;
          });
          // Add market_pulse to pipelineStats
          pipelineStats.market_pulse = parsed.market_pulse || null;
        } catch(parseErr) {
          // Fallback: use raw text as top recommendation
          topRecommendation = fullBrief.slice(0, 300);
        }
      } catch(e) {
        topRecommendation = null;
      }
    }

    // Enrich action cards with AI intelligence briefs
    deduped.forEach(action => {
      if (action.opportunity_id && opportunityBriefs[action.opportunity_id]) {
        const brief = opportunityBriefs[action.opportunity_id];
        action.intel_headline = brief.headline;
        action.win_case = brief.win_case;
        action.risk = brief.risk;
        action.competitor_intel = brief.competitor_intel;
        action.this_week_action = brief.this_week_action;
      }
    });

    return res.status(200).json({
      generated_at: now.toISOString(),
      top_recommendation: topRecommendation,
      market_pulse: pipelineStats.market_pulse || null,
      actions: deduped,
      pipeline_stats: pipelineStats,
      opportunity_briefs: opportunityBriefs,
      new_declarations: recentDeclarations.map(d => ({
        title: d.declarationTitle,
        state: d.stateCode,
        incident_type: d.incidentType,
        date: d.declarationDate,
        number: d.disasterNumber
      }))
    });

  } catch(e) {
    console.error('Intelligence engine error:', e);
    return res.status(500).json({ error: e.message });
  }
}
