// S162 Hygiene-1: Shared V1 cost logger.
// Writes one row per Anthropic API call to api_cost_log with source_system='v1'.
// Fire-and-forget — failure does not break the caller.
//
// Pricing is mirrored from V2 organism/index.js PRICING block. Keep in sync if V2 changes.

const PRICING = {
  'claude-sonnet-4-6': { in_per_tok: 0.000003, out_per_tok: 0.000015 },
  'claude-sonnet-4-20250514': { in_per_tok: 0.000003, out_per_tok: 0.000015 },
  'claude-haiku-4-5-20251001': { in_per_tok: 0.000001, out_per_tok: 0.000005 },
  'claude-opus-4-6': { in_per_tok: 0.000005, out_per_tok: 0.000025 },
  'claude-opus-4-7': { in_per_tok: 0.000005, out_per_tok: 0.000025 }
};
const WEB_SEARCH_USD_PER_CALL = 0.01;

// S166 H1: count only server_tool_use blocks (specifically web_search). Pre-S166
// counted both server_tool_use AND web_search_tool_result, so every real search
// counted as 2 — Anthropic emits both blocks per invocation. This 2x bug inflated
// web_searches column and tool_cost_usd in api_cost_log. Token cost was unaffected.
export function countWebSearches(responseData) {
  if (!responseData || !responseData.content || !responseData.content.length) return 0;
  var n = 0;
  for (var i = 0; i < responseData.content.length; i++) {
    var b = responseData.content[i];
    if (b && b.type === 'server_tool_use' && b.name === 'web_search') n++;
  }
  return n;
}

// Log a single Anthropic API call to api_cost_log.
// Params (all optional except response or model):
//   endpoint        — e.g. '/api/claude', '/api/process-kb'
//   agent           — e.g. 'pdf_extract', 'callClaude', or caller-supplied label
//   model           — falls back to response.model
//   response        — full Anthropic response object (used for usage + web_search count)
//   status          — 'ok' | 'error' | other (default 'ok')
//   error_message   — string if status != ok
//   request_id      — optional caller request id
//   opportunity_id  — opportunity context if known
//   metadata        — JSON object for arbitrary context (document_id, button name, etc.)
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from process.env.
// Returns a promise. Caller may await or fire-and-forget. Errors are swallowed; cost log
// failures must never break user-facing endpoints.
export async function logV1Cost(params) {
  try {
    var SUPABASE_URL = process.env.SUPABASE_URL;
    var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    var resp = params.response || {};
    var model = params.model || resp.model || 'unknown';
    var usage = resp.usage || {};
    var inTok = usage.input_tokens || 0;
    var outTok = usage.output_tokens || 0;
    var ws = countWebSearches(resp);
    var p = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
    var tokenCost = inTok * p.in_per_tok + outTok * p.out_per_tok;
    var toolCost = ws * WEB_SEARCH_USD_PER_CALL;
    var totalCost = tokenCost + toolCost;

    var row = {
      source_system: 'v1',
      endpoint: params.endpoint || null,
      agent: params.agent || null,
      model: model,
      input_tokens: inTok,
      output_tokens: outTok,
      web_searches: ws,
      token_cost_usd: tokenCost,
      tool_cost_usd: toolCost,
      total_cost_usd: totalCost,
      request_id: params.request_id || null,
      opportunity_id: params.opportunity_id || null,
      status: params.status || 'ok',
      error_message: params.error_message || null,
      metadata: params.metadata || null
    };

    await fetch(SUPABASE_URL + '/rest/v1/api_cost_log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch (_e) {
    // Cost log failure is silent. Caller is unaffected.
  }
}
