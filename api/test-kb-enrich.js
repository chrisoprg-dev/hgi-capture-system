export const config = { maxDuration: 90 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var base = 'https://hgi-capture-system.vercel.app';
  var SB = process.env.SUPABASE_URL;
  var SK = process.env.SUPABASE_SERVICE_KEY;
  var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
  var results = {};

  // Load St George draft + gate output from memory
  var stGeorgeId = 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu';
  var proposal = '';
  var gateOutput = '';
  try {
    var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(stGeorgeId) + '&select=staffing_plan', { headers: H });
    var opps = await oppR.json();
    proposal = (opps[0] && opps[0].staffing_plan) || '';
    results.draft_chars = proposal.length;
  } catch(e) { results.draft_load_error = e.message; }

  try {
    var memR = await fetch(SB + '/rest/v1/organism_memory?agent=eq.quality_gate&opportunity_id=eq.' + encodeURIComponent(stGeorgeId) + '&order=created_at.desc&limit=1&select=observation', { headers: H });
    var mems = await memR.json();
    gateOutput = (mems[0] && mems[0].observation) || '';
    results.gate_chars = gateOutput.length;
  } catch(e) { results.gate_load_error = e.message; }

  if (proposal.length < 500) { results.verdict = 'SKIP — no draft'; return res.status(200).json(results); }

  // Count KB docs before
  var kbBefore = 0;
  try {
    var kbR = await fetch(SB + '/rest/v1/knowledge_documents?select=id', { headers: H });
    var kbDocs = await kbR.json();
    kbBefore = (kbDocs||[]).length;
    results.kb_docs_before = kbBefore;
  } catch(e) {}

  // Call kb-enrich
  try {
    var enrichR = await fetch(base + '/api/kb-enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal: proposal,
        gate_output: gateOutput || 'No gate output available — extract strongest 2 sections',
        vertical: 'disaster',
        opp_title: 'St. George Disaster Recovery PM',
        agency: 'City of St. George'
      })
    });
    var enrichD = await enrichR.json();
    results.kb_enrich = {
      ok: enrichR.ok,
      status: enrichR.status,
      success: enrichD.success,
      skipped: enrichD.skipped,
      reason: enrichD.reason,
      doc_id: enrichD.doc_id,
      chunk_count: enrichD.chunk_count,
      extracted_chars: enrichD.extracted_chars,
      vertical: enrichD.vertical
    };
  } catch(e) { results.kb_enrich = { error: e.message }; }

  // Count KB docs after
  try {
    var kbR2 = await fetch(SB + '/rest/v1/knowledge_documents?select=id', { headers: H });
    var kbDocs2 = await kbR2.json();
    results.kb_docs_after = (kbDocs2||[]).length;
    results.kb_docs_added = results.kb_docs_after - kbBefore;
  } catch(e) {}

  results.verdict = [
    results.kb_enrich && results.kb_enrich.success ? 'kb-enrich OK — doc created' : ('kb-enrich ISSUE: ' + (results.kb_enrich && (results.kb_enrich.reason || results.kb_enrich.error) || 'unknown')),
    results.kb_docs_added > 0 ? 'KB doc count increased by ' + results.kb_docs_added : 'KB doc count unchanged (may still be processing)'
  ];
  results.timestamp = new Date().toISOString();
  return res.status(200).json(results);
}