export const config = { maxDuration: 300 };
var BASE = 'https://hgi-capture-system.vercel.app';
var OPP = 'manualtest-manual-htha-2026-03-04-001';

async function fireCascade(eventType, extraData) {
  var start = Date.now();
  try {
    var r = await fetch(BASE + '/api/cascade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        opportunity_id: OPP,
        opportunity_title: 'HTHA Grant and Project Management',
        agency: 'Houma Terrebonne Housing Authority',
        data: extraData || null
      })
    });
    var result = await r.json();
    var elapsed = ((Date.now() - start) / 1000).toFixed(1);
    var summary = (result.results || []).map(function(x) {
      return x.agent + ':' + x.status + (x.tier ? '(t' + x.tier + ')' : '');
    }).join(', ');
    return { event: eventType, elapsed: elapsed + 's', tier1: result.tier1_count || 0, tier2: result.tier2_count || 0, insights: result.prior_insights_passed || 0, total: result.cascades || 0, summary: summary };
  } catch(e) {
    return { event: eventType, elapsed: ((Date.now() - start) / 1000).toFixed(1) + 's', error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var startAll = Date.now();
  var results = [];

  // 1. opportunity.discovered (signals only)
  results.push(await fireCascade('opportunity.discovered'));

  // 2. opportunity.tier1_discovered (1 react + api_call to orchestrator)
  // NOTE: skip orchestrator api_call by not awaiting it — fires and forgets
  results.push(await fireCascade('opportunity.tier1_discovered'));

  // 3-5. Orchestrator internal (signals only)
  results.push(await fireCascade('opportunity.scope_analyzed'));
  results.push(await fireCascade('opportunity.financial_analyzed'));
  results.push(await fireCascade('opportunity.researched'));

  // 6. winnability_scored — conditional on GO
  results.push(await fireCascade('opportunity.winnability_scored', { recommendation: 'GO', pwin: 72 }));

  // 7. proposal.section_drafted (2 reacts)
  results.push(await fireCascade('proposal.section_drafted', { section: 'Technical Approach', content_excerpt: 'HGI brings 96 years of experience...' }));

  // 8. proposal.edited (4 reacts including tier 2)
  results.push(await fireCascade('proposal.edited', { section: 'Executive Summary', original: 'innovative approach', edited: 'proven methodology', editor: 'Christopher' }));

  // 9. proposal.exported (api_call only)
  results.push(await fireCascade('proposal.exported'));

  // 10. proposal.briefing_generated (signals only)
  results.push(await fireCascade('proposal.briefing_generated'));

  // 11. opportunity.won (data_update + 1 react)
  // Already recorded as won — this tests the won-specific cascade
  results.push(await fireCascade('opportunity.won', { outcome: 'won' }));

  // 12. opportunity.lost (2 reacts including tier 2)
  results.push(await fireCascade('opportunity.lost', { outcome: 'lost', winner_name: 'Hagerty Consulting', winner_amount: '350000' }));

  // 13. stage_changed (signals only)
  results.push(await fireCascade('opportunity.stage_changed', { new_stage: 'proposal', old_stage: 'qualifying' }));

  // 14. disaster.declared (3 reacts including tier 2)
  results.push(await fireCascade('disaster.declared', { disaster_number: 'DR-4900', state: 'Louisiana', counties: 'Terrebonne, Lafourche, St. Mary', type: 'Hurricane', declaration_date: '2026-03-15' }));

  // 15. kb.document_processed (2 reacts including tier 2)
  results.push(await fireCascade('kb.document_processed', { document_id: 'doc-htha-v4', filename: 'HTHA_WorkingDraft_v4_Final.pdf', chunk_count: 22, vertical: 'disaster' }));

  // 16. self_assess.completed (signals only)
  results.push(await fireCascade('self_assess.completed', { health_score: 72, agents_healthy: 15, agents_degraded: 5 }));

  // 17. self_assess.recommendation_approved (1 react)
  results.push(await fireCascade('self_assess.recommendation_approved', { recommendation: 'Recalibrate financial model for housing authority contracts', approved_by: 'Christopher' }));

  // 18. batch.completed (1 react tier 2)
  results.push(await fireCascade('batch.completed', { source: 'central_bidding', new_count: 3, tier1_count: 1, total_processed: 47 }));

  // 19. quality_gate.completed (2 reacts including tier 2)
  results.push(await fireCascade('quality_gate.completed', { status: 'FAIL', deficiencies: ['Missing eval criteria coverage in Section C', 'Rate card uses standard rates not RFP-specific', 'Executive Summary exceeds 2 pages'], opportunity_id: OPP }));

  var totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);
  var passed = results.filter(function(r) { return !r.error; }).length;
  var failed = results.filter(function(r) { return r.error; }).length;
  var totalReacts = results.reduce(function(s, r) { return s + (r.tier1 || 0) + (r.tier2 || 0); }, 0);

  return res.status(200).json({
    test: 'all_19_cascades',
    total_elapsed: totalElapsed + 's',
    passed: passed,
    failed: failed,
    total_react_calls: totalReacts,
    results: results
  });
}