export const config = { maxDuration: 30 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

function buildCtx(opp, mem, tier) {
  var full = (tier === 'full');
  var parts = [];
  parts.push('=== OPPORTUNITY RECORD ===');
  parts.push('Title: ' + opp.title);
  parts.push('Agency: ' + opp.agency);
  parts.push('Vertical: ' + (opp.vertical||''));
  parts.push('OPI: ' + opp.opi_score);
  parts.push('Stage: ' + (opp.stage||''));
  parts.push('Due: ' + (opp.due_date||'TBD'));
  parts.push('Est Value: ' + (opp.estimated_value||'unknown'));
  if ((opp.capture_action||'').length > 20) parts.push('--- CAPTURE ACTION ---: ' + (opp.capture_action||'').slice(0, full ? 1500 : 800).length + ' chars');
  if ((opp.scope_analysis||'').length > 100) parts.push('--- SCOPE ---: ' + (opp.scope_analysis||'').slice(0, full ? 5000 : 2500).length + ' chars');
  if ((opp.financial_analysis||'').length > 100) parts.push('--- FINANCIAL ---: ' + (opp.financial_analysis||'').slice(0, full ? 2500 : 1200).length + ' chars');
  if ((opp.research_brief||'').length > 100) parts.push('--- RESEARCH ---: ' + (opp.research_brief||'').slice(0, full ? 3000 : 1500).length + ' chars');
  if ((opp.staffing_plan||'').length > 100) parts.push('--- PROPOSAL DRAFT ---: ' + (opp.staffing_plan||'').slice(0, full ? 15000 : 5000).length + ' chars');
  if (mem && mem.length > 50) parts.push('--- MEMORY ---: ' + mem.slice(0, full ? 4000 : 2500).length + ' chars');
  var ctx = parts.join('\n');
  return { total_chars: ctx.length, sections: parts };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    var opps = await (await fetch(SB + '/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.65&select=id,title,agency,vertical,opi_score,due_date,stage,capture_action,scope_analysis,financial_analysis,research_brief,staffing_plan,estimated_value&order=opi_score.desc&limit=5', { headers: H })).json();
    var mems = await (await fetch(SB + '/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=60', { headers: H })).json();
    var results = [];
    for (var i = 0; i < opps.length; i++) {
      var opp = opps[i];
      var oppMems = (mems||[]).filter(function(m) { return (m.opportunity_id === opp.id) || (m.entity_tags||'').includes(opp.agency||''); });
      var memFull = oppMems.map(function(m) { return (m.observation||'').slice(0,600); }).join('\n\n');
      var memCompact = oppMems.map(function(m) { return (m.observation||'').slice(0,250); }).join('\n\n');
      results.push({
        title: opp.title,
        agency: opp.agency,
        raw_field_sizes: {
          staffing_plan: (opp.staffing_plan||'').length,
          scope_analysis: (opp.scope_analysis||'').length,
          financial_analysis: (opp.financial_analysis||'').length,
          research_brief: (opp.research_brief||'').length,
          capture_action: (opp.capture_action||'').length
        },
        opp_memories_count: oppMems.length,
        memFull_chars: memFull.length,
        memCompact_chars: memCompact.length,
        ctxFull: buildCtx(opp, memFull, 'full'),
        ctxCompact: buildCtx(opp, memCompact, 'compact')
      });
    }
    return res.status(200).json({ opps_found: opps.length, total_memories: (mems||[]).length, contexts: results });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}