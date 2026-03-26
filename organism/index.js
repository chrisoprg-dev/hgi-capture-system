// HGI Living Organism V2 — Intelligence Session Engine
// Phase 2: Intelligence Engine — first real agent perspective
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

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'alive', uptime_seconds: Math.floor(process.uptime()), timestamp: new Date().toISOString(), version: 'V2.1.0-intelligence' }));
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

function log(msg) { console.log('[' + new Date().toISOString() + '] [ORGANISM] ' + msg); }

async function storeMemory(agent, oppId, tags, observation, memType) {
  try {
    await supabase.from('organism_memory').insert({
      id: agent + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      agent: agent, opportunity_id: oppId || null,
      entity_tags: tags, observation: observation,
      memory_type: memType || 'analysis',
      created_at: new Date().toISOString()
    });
  } catch(e) { log('Memory store error: ' + e.message); }
}

async function loadState() {
  log('Loading system state...');
  const [r1, r2, r3, r4] = await Promise.all([
    supabase.from('opportunities').select('*').neq('status','filtered').neq('outcome','cancelled').order('opi_score', { ascending: false }).limit(10),
    supabase.from('organism_memory').select('*').neq('memory_type','decision_point').order('created_at', { ascending: false }).limit(100),
    supabase.from('competitive_intelligence').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('relationship_graph').select('*').order('updated_at', { ascending: false }).limit(50),
  ]);
  const state = { pipeline: r1.data||[], memories: r2.data||[], competitive: r3.data||[], relationships: r4.data||[] };
  log('State loaded: ' + state.pipeline.length + ' opps | ' + state.memories.length + ' memories | ' + state.competitive.length + ' comp intel | ' + state.relationships.length + ' relationships');
  return state;
}

async function agentIntelligenceEngine(opp, memText, compText, relText) {
  log('INTELLIGENCE ENGINE: ' + (opp.title||'?').slice(0,50));

  var prompt = 'You are the Intelligence Engine, HGI competitive intelligence analyst.' +
    ' You are 1 of 37 agents in the HGI Living Organism. Your findings compound across all 36 others.' +
    ' Be specific. Name real competitors. Never fabricate.' +
    '\n\nHGI COMPANY: Hammerman and Gainer LLC, ~95 years, 100pct minority-owned, 67 FT + 43 contract staff.' +
    '\nHGI VERTICALS: Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management' +
    '\nHGI PAST PERFORMANCE: Road Home $67M/$13B+ program, HAP $950M, Restore Louisiana $42.3M, Rebuild NJ $67.7M, TPSD $2.96M completed 2022-2025, St. John Sheriff $788K, BP GCCF $1.65M' +
    '\nCRITICAL: HGI has no current direct federal contract. All work through state/local agencies.' +
    '\n\nOPPORTUNITY:' +
    '\nTitle: ' + (opp.title||'unknown') +
    '\nAgency: ' + (opp.agency||'unknown') +
    '\nVertical: ' + (opp.vertical||'unknown') +
    '\nOPI: ' + (opp.opi_score||0) +
    '\nStage: ' + (opp.stage||'identified') +
    '\nDue: ' + (opp.due_date||'TBD') +
    '\nEst Value: ' + (opp.estimated_value||'unknown') +
    '\n\nEXISTING SCOPE/RESEARCH:' +
    '\n' + (opp.scope_analysis||'').slice(0,600) +
    '\n' + (opp.research_brief||'').slice(0,400) +
    '\n\nORGANISM MEMORY:' +
    '\n' + memText.slice(0,1200) +
    '\n\nCOMPETITIVE INTEL STORE:' +
    '\n' + compText +
    '\n\nRELATIONSHIP GRAPH:' +
    '\n' + relText +
    '\n\nMISSION - produce ALL of the following:' +
    '\n1. Named competitors most likely to bid and why each is a threat' +
    '\n2. Incumbent contractor if known' +
    '\n3. Agency procurement patterns and evaluator preferences' +
    '\n4. HGI strongest competitive angle for THIS opportunity' +
    '\n5. Intelligence gaps that could hurt us' +
    '\n6. Single highest-leverage action HGI should take THIS WEEK' +
    '\n7. Updated PWIN recommendation 0-100pct with reasoning' +
    '\n\nBe surgical. Be specific. Real money is on the line.';

  var response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'You are the Intelligence Engine agent in the HGI Living Organism. Produce competitive intelligence that compounds across 36 other agents. Be specific, cite real data, never fabricate.',
    messages: [{ role: 'user', content: prompt }]
  });

  var analysis = (response.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
  if (!analysis || analysis.length < 100) return null;

  log('INTELLIGENCE ENGINE complete: ' + analysis.length + ' chars for ' + (opp.title||'?').slice(0,40));

  await storeMemory('intelligence_engine', opp.id,
    (opp.agency||'') + ',' + (opp.vertical||'') + ',competitive_intel',
    'INTELLIGENCE ENGINE - ' + (opp.title||'').slice(0,60) + ':' + analysis,
    'competitive_intel'
  );

  await supabase.from('opportunities').update({
    research_brief: analysis.slice(0, 8000),
    last_updated: new Date().toISOString()
  }).eq('id', opp.id);

  return { agent: 'intelligence_engine', opp: opp.title, chars: analysis.length };
}

async function runSession(trigger) {
  var id = 'v2-' + Date.now();
  log('=== SESSION START: ' + id + ' | trigger: ' + trigger + ' ===');

  try {
    var state = await loadState();

    if (state.pipeline.length === 0) {
      log('No pipeline records. Session complete.');
      await storeMemory('v2_engine', null, 'v2,session', 'V2 SESSION - no pipeline records. Trigger: ' + trigger, 'analysis');
      return;
    }

    log('Pipeline:');
    state.pipeline.forEach(function(o) { log('  OPI:' + o.opi_score + ' | ' + (o.stage||'?') + ' | ' + (o.title||'').slice(0,55)); });

    var memText = state.memories.slice(0,30).map(function(m) { return '[' + (m.agent||'?') + ']: ' + (m.observation||'').slice(0,200); }).join('\n\n');
    var compText = state.competitive.slice(0,15).map(function(c) { return (c.competitor_name||'?') + ' | ' + (c.agency||'') + ': ' + (c.strategic_notes||'').slice(0,120); }).join('\n');
    var relText = state.relationships.slice(0,15).map(function(r) { return (r.contact_name||'?') + ' | ' + (r.organization||'') + ' | ' + (r.relationship_strength||'cold'); }).join('\n');

    var activeOpps = state.pipeline.filter(function(o) { return (o.opi_score||0) >= 65; });
    log('Intelligence Engine firing on ' + activeOpps.length + ' opportunities OPI 65+...');

    var intelResults = [];
    for (var i = 0; i < activeOpps.length; i++) {
      try {
        var result = await agentIntelligenceEngine(activeOpps[i], memText, compText, relText);
        if (result) intelResults.push(result);
      } catch(e) {
        log('Intel error on ' + (activeOpps[i].title||'?').slice(0,30) + ': ' + e.message);
      }
    }

    log('Intelligence Engine complete: ' + intelResults.length + '/' + activeOpps.length + ' analyzed');

    await storeMemory('v2_engine', null, 'v2,session,phase2',
      'V2 SESSION - trigger:' + trigger + ' pipeline:' + state.pipeline.length + ' intel_analyzed:' + intelResults.length + ' memories:' + state.memories.length + ' uptime:' + Math.floor(process.uptime()) + 's',
      'analysis'
    );

    log('=== SESSION COMPLETE: ' + id + ' ===');

  } catch(e) {
    log('SESSION ERROR: ' + e.message);
  }
}

log('==========================================================');
log('HGI LIVING ORGANISM V2 - STARTING');
log('37 agents. One shared brain. All into all.');
log('This server never sleeps. It never times out.');
log('Phase 2: Intelligence Engine LIVE');
log('==========================================================');

setTimeout(function() { runSession('startup').catch(console.error); }, 3000);

setInterval(function() {
  var hour = new Date().getUTCHours();
  var min = new Date().getUTCMinutes();
  if (hour === 12 && min === 0) {
    log('Daily scheduled session firing');
    runSession('scheduled_daily').catch(console.error);
  }
}, 60000);

log('Startup complete. Intelligence session in 3s...');
