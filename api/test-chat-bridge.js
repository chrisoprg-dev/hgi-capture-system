export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var base = 'https://hgi-capture-system.vercel.app';
  var results = {};

  // Test 1: chat-context base (no opp_id)
  try {
    var r1 = await fetch(base + '/api/chat-context');
    var d1 = await r1.json();
    results.chat_context_base = {
      ok: r1.ok,
      status: r1.status,
      pipeline_count: d1.pipeline_count,
      memory_count: d1.memory_count,
      system_prompt_length: (d1.system_prompt||'').length,
      has_rate_card: (d1.system_prompt||'').includes('Principal'),
      has_pipeline: (d1.system_prompt||'').includes('ACTIVE PIPELINE')
    };
  } catch(e) { results.chat_context_base = { error: e.message }; }

  // Test 2: chat-context with opp_id (St George)
  var stGeorgeId = 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu';
  try {
    var r2 = await fetch(base + '/api/chat-context?opp_id=' + encodeURIComponent(stGeorgeId));
    var d2 = await r2.json();
    results.chat_context_with_opp = {
      ok: r2.ok,
      status: r2.status,
      opp_agency: d2.opp_agency,
      has_draft: d2.has_draft,
      has_scope_in_prompt: (d2.system_prompt||'').includes('FOCUSED OPPORTUNITY'),
      has_draft_in_prompt: (d2.system_prompt||'').includes('CURRENT PROPOSAL DRAFT'),
      system_prompt_length: (d2.system_prompt||'').length
    };
  } catch(e) { results.chat_context_with_opp = { error: e.message }; }

  // Test 3: chat-send (lightweight message, no opp context)
  try {
    var r3 = await fetch(base + '/api/chat-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How many opportunities are in the pipeline?', history: [] })
    });
    var d3 = await r3.json();
    results.chat_send_basic = {
      ok: r3.ok,
      status: r3.status,
      response_length: (d3.response||'').length,
      response_preview: (d3.response||'').slice(0, 120),
      memory_stored: d3.memory_stored,
      error: d3.error || null
    };
  } catch(e) { results.chat_send_basic = { error: e.message }; }

  // Test 4: chat-send with actionable feedback (should trigger memory save)
  try {
    var r4 = await fetch(base + '/api/chat-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'The technical approach section for St. George needs to be more specific about FEMA PA Category A-G methodology. Evaluators will dock points if we are vague on debris removal vs. emergency protective measures.',
        history: [],
        opp_id: stGeorgeId
      })
    });
    var d4 = await r4.json();
    results.chat_send_with_feedback = {
      ok: r4.ok,
      status: r4.status,
      response_length: (d4.response||'').length,
      response_preview: (d4.response||'').slice(0, 150),
      memory_stored: d4.memory_stored,
      memory_summary: d4.memory_summary || null,
      error: d4.error || null
    };
  } catch(e) { results.chat_send_with_feedback = { error: e.message }; }

  results.timestamp = new Date().toISOString();
  results.verdict = [
    results.chat_context_base && results.chat_context_base.ok ? 'chat-context-base OK' : 'chat-context-base FAIL',
    results.chat_context_with_opp && results.chat_context_with_opp.ok ? 'chat-context-opp OK' : 'chat-context-opp FAIL',
    results.chat_send_basic && results.chat_send_basic.ok && (results.chat_send_basic.response_length||0) > 20 ? 'chat-send OK' : 'chat-send FAIL',
    results.chat_send_with_feedback && results.chat_send_with_feedback.memory_stored ? 'memory-capture OK' : 'memory-capture NO-SAVE (check extraction)'
  ];
  return res.status(200).json(results);
}