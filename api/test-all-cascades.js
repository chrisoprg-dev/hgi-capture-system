export const config = { maxDuration: 300 };
var BASE = 'https://hgi-capture-system.vercel.app';
var OPP_ID = 'manualtest-manual-htha-2026-03-04-001';

async function fireCascade(eventType, extraData) {
  var start = Date.now();
  try {
    var r = await fetch(BASE + '/api/cascade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        opportunity_id: OPP_ID,
        opportunity_title: 'HTHA Grant and Project Management',
        agency: 'Houma Terrebonne Housing Authority',
        data: extraData || {}
      })
    });
    var result = await r.json();
    var elapsed = ((Date.now() - start) / 1000).toFixed(1);
    var summary = (result.results || []).map(function(x) {
      return x.agent + ':' + x.status + (x.tier ? '(t' + x.tier + ')' : '');
    }).join(', ');
    return { event: eventType, elapsed: elapsed + 's', tier1: result.tier1_count || 0, tier2: result.tier2_count || 0, insights: result.prior_insights_passed || 0, total: result.cascades || 0, agents: summary };
  } catch(e) {
    return { event: eventType, elapsed: ((Date.now() - start) / 1000).toFixed(1) + 's', error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var startAll = Date.now();
  var results = [];

  // Group 1: Signal-only cascades (fast, no Claude calls)
  results.push(await fireCascade('opportunity.discovered'));
  results.push(await fireCascade('opportunity.scope_analyzed'));
  results.push(await fireCascade('opportunity.financial_analyzed'));
  results.push(await fireCascade('opportunity.researched'));
  results.push(await fireCascade('proposal.briefing_generated'));
  results.push(await fireCascade('opportunity.stage_changed', { new_stage: 'proposal' }));
  results.push(await fireCascade('self_assess.completed'));

  // Group 2: Light react cascades (1-2 reacts)
  results.push(await fireCascade('opportunity.won', { outcome: 'won', winner_name: 'HGI Global' }));
  results.push(await fireCascade('self_assess.recommendation_approved', { recommendation: 'Recalibrate housing authority pricing model', approved: true }));
  results.push(await fireCascade('batch.completed', { new_count: 3, tier1_count: 1, source: 'central_bidding' }));

  // Group 3: Medium react cascades (2-3 reacts)
  results.push(await fireCascade('opportunity.lost', { outcome: 'lost', winner_name: 'Hagerty Consulting', winner_amount: '450000' }));
  results.push(await fireCascade('kb.document_processed', { document_id: 'doc-htha-v4', filename: 'HTHA_WorkingDraft_v4_Final.pdf', vertical: 'disaster', chunk_count: 22 }));
  results.push(await fireCascade('quality_gate.completed', { status: 'FAIL', deficiencies: ['Missing Section C staffing requirement', 'Rate card uses standard rates not RFP-specific', 'Executive Summary exceeds 2 pages'] }));

  // Group 4: Heavy react cascades (3-5 reacts with tiers)
  results.push(await fireCascade('proposal.section_drafted', { section: 'Technical Approach', content_preview: 'HGI proposes a comprehensive disaster recovery grant management program...' }));
  results.push(await fireCascade('proposal.edited', { section: 'Technical Approach', original_text: 'HGI proposes innovative solutions', edited_text: 'HGI delivers proven regulatory compliance frameworks', editor: 'Christopher' }));
  results.push(await fireCascade('disaster.declared', { declaration: 'DR-4950', state: 'Louisiana', affected_parishes: 'Terrebonne, Lafourche, St. Mary', disaster_type: 'Hurricane', fema_url: 'https://www.fema.gov/disaster/4950' }));
  results.push(await fireCascade('opportunity.winnability_scored', { recommendation: 'GO', pwin: 72 }));

  // Skip tier1_discovered — it fires the full orchestrator which takes 2-5 min and costs $2+
  // Skip proposal.exported — it fires quality gate API which is already tested above

  var totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);
  var reactCount = results.reduce(function(s, r) { return s + (r.tier1 || 0) + (r.tier2 || 0); }, 0);
  var errorCount = results.filter(function(r) { return r.error; }).length;

  return res.status(200).json({
    test: 'all_cascades_v1',
    total_elapsed: totalElapsed + 's',
    cascades_tested: results.length,
    total_react_calls: reactCount,
    errors: errorCount,
    skipped: ['opportunity.tier1_discovered (fires full orchestrator)', 'proposal.exported (fires quality gate already tested)', 'opportunity.outcome_recorded (already proven)'],
    results: results
  });
}