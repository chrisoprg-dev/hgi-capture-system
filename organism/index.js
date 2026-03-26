// HGI Living Organism V2 — Intelligence Session Engine
// Runs on Railway. No timeout. Always alive.
// Phase 2: First real agent — Intelligence Engine perspective
// 37 agents. One shared brain. All into all.

import http from 'http';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

const supabase = createClient(SB_URL, SB_KEY);
const anthropic = new Anthropic({ apiKey: AK });

// ── HEALTH SERVER ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'alive',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: 'V2.1.0-intelligence'
    }));
    return;
  }

  if (req.url === '/run-session' && req.method === 'POST') {
    runSession('manual').catch(console.error);
    res.writeHead(202);
    res.end(JSON.stringify({ accepted: true, message: 'Session triggered' }));
    return;
  }

  res.writeHead(200);
  res.end(JSON.stringify({ status: 'alive', uptime: Math.floor(process.uptime()) }));
});

server.listen(PORT, () => log('Health server listening on port ' + PORT));

// ── LOGGING ────────────────────────────────────────────────────────
function log(msg) { console.log('[' + new Date().toISOString() + '] [ORGANISM] ' + msg); }

// ── STORE MEMORY ───────────────────────────────────────────────────
async function storeMemory(agent, oppId, tags, observation, memType) {
  try {
    await supabase.from('organism_memory').insert({
      id: agent + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      agent, opportunity_id: oppId || null,
      entity_tags: tags, observation,
      memory_type: memType || 'analysis',
      created_at: new Date().toISOString()
    });
  } catch(e) { log('Memory store error: ' + e.message); }
}

// ── LOAD SYSTEM STATE ──────────────────────────────────────────────
async function loadState() {
  log('Loading system state...');
  const [{ data: pipeline }, { data: memories }, { data: competitive }, { data: relationships }] = await Promise.all([
    supabase.from('opportunities').select('*').neq('status','filtered').neq('outcome','cancelled').order('opi_score', { ascending: false }).limit(10),
    supabase.from('organism_memory').select('*').neq('memory_type','decision_point').order('created_at', { ascending: false }).limit(100),
    supabase.from('competitive_intelligence').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('relationship_graph').select('*').order('updated_at', { ascending: false }).limit(50),
  ]);
  const state = { pipeline: pipeline||[], memories: memories||[], competitive: competitive||[], relationships: relationships||[] };
  log('State loaded: ' + state.pipeline.length + ' opps | ' + state.memories.length + ' memories | ' + state.competitive.length + ' comp intel | ' + state.relationships.length + ' relationships');
  return state;
}

// ── BUILD CONTEXT STRING ───────────────────────────────────────────
function buildContext(state) {
  const memText = state.memories.slice(0, 30).map(m =>
    '[' + (m.agent||'?') + '|' + (m.memory_type||'') + ']: ' + (m.observation||'').slice(0, 200)
  ).join('

');

  const compText = state.competitive.slice(0, 15).map(c =>
    (c.competitor_name||'?') + ' | ' + (c.agency||'') + ' | ' + (c.vertical||'') + ': ' + (c.strategic_notes||'').slice(0, 150)
  ).join('
');

  const relText = state.relationships.slice(0, 15).map(r =>
    (r.contact_name||'?') + ' | ' + (r.organization||'') + ' | ' + (r.relationship_strength||'cold')
  ).join('
');

  return { memText, compText, relText };
}

// ── AGENT: INTELLIGENCE ENGINE ─────────────────────────────────────
// First of the 37 perspectives. Competitive analyst. Sees everything.
// Produces findings that shift how all other 36 agents think.
async function agentIntelligenceEngine(opp, ctx, memText) {
  log('INTELLIGENCE ENGINE firing on: ' + (opp.title||'?').slice(0,50));

  const prompt = `You are the Intelligence Engine — HGI's dedicated competitive intelligence analyst.
You are one of 37 agents in the HGI Living Organism. Your findings will be read by all 36 other agents.
Every insight you produce compounds. Be specific. Name real competitors. Cite verifiable facts.
Never fabricate. If you don't know, say so.

HGI COMPANY: Hammerman & Gainer LLC (~95 years, 100% minority-owned, 67 FT + 43 contract staff)
HGI VERTICALS: Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management
HGI CONFIRMED PAST PERFORMANCE: Road Home $67M direct/$13B+ program, HAP $950M, Restore Louisiana $42.3M, Rebuild NJ $67.7M, TPSD $2.96M (completed 2022-2025), St. John Sheriff $788K, BP GCCF $1.65M
CRITICAL: HGI has no current direct federal contract. All work through state/local agencies.

OPPORTUNITY:
Title: ${opp.title}
Agency: ${opp.agency}
Vertical: ${opp.vertical||'unknown'}
OPI Score: ${opp.opi_score}
Stage: ${opp.stage||'identified'}
Due: ${opp.due_date||'TBD'}
Est Value: ${opp.estimated_value||'unknown'}

EXISTING RESEARCH (scope/financial/competitive already in record):
${(opp.scope_analysis||'').slice(0,800)}
${(opp.research_brief||'').slice(0,600)}

ORGANISM MEMORY (what all agents know):
${memText.slice(0,1500)}

COMPETITIVE INTELLIGENCE STORE:
${ctx.compText}

RELATIONSHIP GRAPH:
${ctx.relText}

YOUR INTELLIGENCE MISSION — produce ALL of the following:
1. Named competitors most likely to bid on THIS specific opportunity and why each is a threat
2. Any known incumbent — who holds this contract now if it exists
3. Agency procurement patterns — how does this agency typically evaluate and select
4. HGI's strongest competitive angle for THIS opportunity specifically
5. Any intelligence gaps — what do we NOT know that could hurt us
6. Single highest-leverage action HGI should take THIS WEEK to improve competitive position
7. Updated PWIN recommendation with reasoning (0-100%)

Be surgical. Be specific. This is real money on the line.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'You are the Intelligence Engine agent in the HGI Living Organism. You produce competitive intelligence that compounds across all 36 other agents. Be specific, cite real data, never fabricate.',
    messages: [{ role: 'user', content: prompt }]
  });

  const analysis = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!analysis || analysis.length < 100) return null;

  log('INTELLIGENCE ENGINE complete: ' + analysis.length + ' chars for ' + (opp.title||'?').slice(0,40));

  // Write to organism_memory — all 36 other agents will read this
  await storeMemory(
    'intelligence_engine', opp.id,
    (opp.agency||'') + ',' + (opp.vertical||'') + ',competitive_intel',
    'INTELLIGENCE ENGINE — ' + (opp.title||'').slice(0,60) + ':\n' + analysis,
    'competitive_intel'
  );

  // Also update the opportunity record with fresh competitive intel
  await supabase.from('opportunities').update({
    research_brief: analysis.slice(0, 8000),
    last_updated: new Date().toISOString()
  }).eq('id', opp.id);

  return { agent: 'intelligence_engine', opp: opp.title, chars: analysis.length };
}

// ── SESSION ────────────────────────────────────────────────────────
async function runSession(trigger) {
  const id = 'v2-' + Date.now();
  log('=== SESSION START: ' + id + ' | trigger: ' + trigger + ' ===');

  try {
    const state = await loadState();

    if (state.pipeline.length === 0) {
      log('No active pipeline records found. Session complete.');
      await storeMemory('v2_engine', null, 'v2,session', 'V2 SESSION — no active pipeline records. Trigger: ' + trigger, 'analysis');
      return;
    }

    log('Pipeline:');
    state.pipeline.forEach(o => log('  OPI:' + o.opi_score + ' | ' + (o.stage||'?') + ' | ' + (o.title||'').slice(0, 55)));

    const ctx = buildContext(state);

    // ── PHASE 1: Intelligence Engine fires on all active opps OPI 65+
    const activeOpps = state.pipeline.filter(o => (o.opi_score||0) >= 65);
    log('Running Intelligence Engine on ' + activeOpps.length + ' opportunities OPI 65+...');

    const intelResults = [];
    for (const opp of activeOpps) {
      try {
        const result = await agentIntelligenceEngine(opp, ctx, ctx.memText);
        if (result) intelResults.push(result);
      } catch(e) {
        log('Intelligence Engine error on ' + (opp.title||'?').slice(0,40) + ': ' + e.message);
      }
    }

    log('Intelligence Engine complete: ' + intelResults.length + '/' + activeOpps.length + ' opportunities analyzed');

    // Write session summary
    await storeMemory('v2_engine', null, 'v2,session,intelligence',
      'V2 SESSION COMPLETE — trigger:' + trigger + ' | pipeline:' + state.pipeline.length + ' opps | intel_analyzed:' + intelResults.length + ' | memories:' + state.memories.length + ' | uptime:' + Math.floor(process.uptime()) + 's',
      'analysis'
    );

    log('=== SESSION COMPLETE: ' + id + ' ===');
    log('Intelligence analyzed: ' + intelResults.map(r => (r.opp||'?').slice(0,30)).join(', '));

  } catch(e) {
    log('SESSION ERROR: ' + e.message);
  }
}

// ── SCHEDULED + STARTUP ────────────────────────────────────────────
log('═══════════════════════════════════════════════');
log('HGI LIVING ORGANISM V2 — STARTING');
log('37 agents. One shared brain. All into all.');
log('This server never sleeps. It never times out.');
log('Phase 2: Intelligence Engine LIVE');
log('═══════════════════════════════════════════════');

setTimeout(() => runSession('startup').catch(console.error), 3000);

setInterval(() => {
  const hour = new Date().getUTCHours();
  const min = new Date().getUTCMinutes();
  if (hour === 12 && min === 0) {
    log('Daily scheduled session firing');
    runSession('scheduled_daily').catch(console.error);
  }
}, 60000);

log('Startup complete. First intelligence session in 3s...');
