export const config = { maxDuration: 60 };

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
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: system || 'You are the HGI Capture Intelligence coordinator. Be directive, specific, and brief.', messages: [{ role: 'user', content: prompt }] })
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
    due_date: opp.due_date
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Pull full pipeline state
    const [opportunities, recentHunts, femaDeclarations] = await Promise.allSettled([
      sbGet('opportunities?status=eq.active&order=opi_score.desc&limit=50'),
      sbGet('hunt_runs?order=run_at.desc&limit=20'),
      fetch("https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=5&$filter=stateCode%20in%20('LA','TX','FL','MS','AL','GA')")
        .then(r => r.ok ? r.json() : { DisasterDeclarationsSummaries: [] })
        .then(d => d.DisasterDeclarationsSummaries || [])
        .catch(() => [])
    ]);

    const opps = opportunities.status === 'fulfilled' ? opportunities.value || [] : [];
    const hunts = recentHunts.status === 'fulfilled' ? recentHunts.value || [] : [];
    const declarations = femaDeclarations.status === 'fulfilled' ? femaDeclarations.value || [] : [];

    const now = new Date();

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
          days_until_deadline: days
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
          days_since_activity: daysSince
        });
      }
    });

    // 3. HIGH: New Tier 1 opportunities discovered recently (last 24 hours)
    opps.filter(o => {
      const hoursOld = (now - new Date(o.discovered_at)) / (1000*60*60);
      return hoursOld <= 24 && (o.opi_score || 0) >= 70;
    }).forEach(o => {
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
        opi: o.opi_score
      });
    });

    // 4. MEDIUM: Pursuing stage opportunities with no proposal started
    opps.filter(o => o.stage === 'pursuing').forEach(o => {
      const daysSince = o.last_updated ? Math.floor((now - new Date(o.last_updated)) / (1000*60*60*24)) : 999;
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
        opi: o.opi_score
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
      last_scraper_run: hunts.find(h => h.source === 'apify_batch')?.run_at || null,
      new_today: opps.filter(o => (now - new Date(o.discovered_at)) < 24*60*60*1000).length
    };

    // 7. Generate AI-powered top recommendation using Claude
    let topRecommendation = null;
    if (actions.length > 0 && opps.length > 0) {
      try {
        const topOpps = opps.slice(0, 5).map(o => o.title + ' | OPI:' + o.opi_score + ' | Stage:' + o.stage + ' | Due:' + (o.due_date || 'TBD') + ' | Agency:' + o.agency).join('\n');
        const actionSummary = actions.slice(0, 5).map(a => a.icon + ' ' + a.headline).join('\n');
        
        const brief = await callClaude(
          'You are the HGI capture team coordinator. Based on this pipeline state, write a 2-3 sentence directive morning briefing for Christopher Oney, President of HGI. Be direct, specific, and tell him exactly what the single most important thing he should do TODAY is and why.\n\nTOP OPPORTUNITIES:\n' + topOpps + '\n\nPENDING ACTIONS:\n' + actionSummary + '\n\nHGI context: disaster recovery, FEMA PA, CDBG-DR, TPA/claims. Louisiana-based.',
          'You are a world-class capture manager briefing an executive. 2-3 sentences maximum. Lead with the single most urgent action. Be direct and specific — name the opportunity, agency, and exact action.'
        );
        topRecommendation = brief;
      } catch(e) {
        topRecommendation = null;
      }
    }

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

    return res.status(200).json({
      generated_at: now.toISOString(),
      top_recommendation: topRecommendation,
      actions: deduped,
      pipeline_stats: pipelineStats,
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