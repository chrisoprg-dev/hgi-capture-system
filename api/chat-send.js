export const config = { maxDuration: 60 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
function makeId() { return 'cb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

async function storeMemory(oppId, agency, insight) {
  try {
    await fetch(SB + '/rest/v1/organism_memory', {
      method: 'POST',
      headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        id: makeId(),
        agent: 'chat_bridge',
        opportunity_id: oppId || null,
        entity_tags: (agency || 'general') + ',chat_feedback,team_intelligence',
        observation: 'CHAT BRIDGE INSIGHT:\n' + insight,
        memory_type: 'analysis',
        created_at: new Date().toISOString()
      })
    });
    return true;
  } catch(e) { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    var body = req.body || {};
    var message = body.message || '';
    var history = body.history || [];
    var oppId = body.opp_id || null;
    if (!message) return res.status(400).json({ error: 'message required' });

    // Step 1: Build system prompt from chat-context (includes pipeline + organism memory + HGI facts + proposal draft if opp_id given)
    var systemPrompt = 'You are the HGI AI Capture System.';
    var oppAgency = '';
    try {
      var ctxUrl = 'https://hgi-capture-system.vercel.app/api/chat-context';
      if (oppId) ctxUrl += '?opp_id=' + encodeURIComponent(oppId);
      var ctxR = await fetch(ctxUrl);
      if (ctxR.ok) {
        var ctxD = await ctxR.json();
        systemPrompt = ctxD.system_prompt || systemPrompt;
        oppAgency = ctxD.opp_agency || '';
      }
    } catch(e) {}

    // Step 2: Build message history (last 10 turns for context)
    var claudeMessages = history.slice(-10).map(function(m) {
      return { role: m.role, content: String(m.content).slice(0, 2000) };
    });
    claudeMessages.push({ role: 'user', content: message });

    // Step 3: Sonnet call — full intelligence response
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system: systemPrompt, messages: claudeMessages })
    });
    if (!r.ok) return res.status(500).json({ error: 'Claude API error ' + r.status });
    var d = await r.json();
    var response = (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');

    // Step 4: Haiku feedback extraction — auto-save actionable insights to organism memory
    var memorySaved = false;
    var memorySummary = '';
    try {
      var extractR = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: 'You extract actionable intelligence from a chat exchange that would improve a government proposal. Output ONLY valid JSON: {"save": true/false, "insight": "..."}. Set save=true ONLY if the exchange contains: specific proposal feedback, competitive intelligence, pricing guidance, strategic suggestions, team preferences about content or writing, or lessons learned. Set save=false for general status questions, greetings, or vague conversation. insight must be specific and actionable.',
          messages: [{ role: 'user', content: 'USER: ' + message.slice(0, 500) + '\n\nASSISTANT: ' + response.slice(0, 800) + '\n\nExtract actionable intelligence for future proposals. Output JSON only.' }]
        })
      });
      if (extractR.ok) {
        var extractD = await extractR.json();
        var extractText = (extractD.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('').replace(/```json|```/g, '').trim();
        var extracted = JSON.parse(extractText);
        if (extracted.save === true && extracted.insight && extracted.insight.length > 20) {
          memorySaved = await storeMemory(oppId, oppAgency, extracted.insight);
          memorySummary = extracted.insight.slice(0, 150);
        }
      }
    } catch(e) {}

    return res.status(200).json({ response: response, memory_stored: memorySaved, memory_summary: memorySummary, opp_id: oppId });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}