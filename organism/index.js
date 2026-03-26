// HGI Living Organism V2 — Persistent Session Engine
// Runs on Railway. No timeout. Always alive.
// Phase 1: Foundation — proves persistent server + Supabase connection
// Phase 2+: 37 agents, one shared brain, all into all

import http from 'http';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const PORT = process.env.PORT || 3000;

const supabase = createClient(SB_URL, SB_KEY);

// ── HEALTH SERVER ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'alive',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: 'V2.0.1-foundation'
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

server.listen(PORT, () => {
  log('Health server listening on port ' + PORT);
});

// ── LOGGING ────────────────────────────────────────────────────────────────
function log(msg) {
  console.log('[' + new Date().toISOString() + '] [ORGANISM] ' + msg);
}

// ── LOAD SYSTEM STATE ──────────────────────────────────────────────────────
async function loadState() {
  log('Loading system state...');

  const [{ data: pipeline }, { data: memories }, { data: competitive }, { data: relationships }] = await Promise.all([
    supabase.from('opportunities').select('*').in('status', ['active']).gte('opi_score', 60).order('opi_score', { ascending: false }).limit(10),
    supabase.from('organism_memory').select('*').neq('memory_type', 'decision_point').order('created_at', { ascending: false }).limit(100),
    supabase.from('competitive_intelligence').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('relationship_graph').select('*').order('updated_at', { ascending: false }).limit(50),
  ]);

  log('State loaded: ' + (pipeline||[]).length + ' opps | ' + (memories||[]).length + ' memories | ' + (competitive||[]).length + ' comp intel | ' + (relationships||[]).length + ' relationships');

  return { pipeline: pipeline||[], memories: memories||[], competitive: competitive||[], relationships: relationships||[] };
}

// ── SESSION ────────────────────────────────────────────────────────────────
async function runSession(trigger) {
  const id = 'v2-' + Date.now();
  log('=== SESSION START: ' + id + ' | trigger: ' + trigger + ' ===');

  try {
    const state = await loadState();

    log('Pipeline:');
    state.pipeline.forEach(o => log('  OPI:' + o.opi_score + ' | ' + (o.stage||'?') + ' | ' + (o.title||'').slice(0, 55)));

    // Write proof to organism_memory
    await supabase.from('organism_memory').insert({
      id: id,
      agent: 'v2_engine',
      entity_tags: 'v2,session,foundation',
      observation: 'V2 FOUNDATION SESSION — trigger:' + trigger + ' | pipeline:' + state.pipeline.length + ' opps | memories:' + state.memories.length + ' | competitive:' + state.competitive.length + ' | relationships:' + state.relationships.length + ' | uptime:' + Math.floor(process.uptime()) + 's | SERVER RUNNING CONTINUOUSLY WITH NO TIMEOUT — 37 agents being wired in Phase 2',
      memory_type: 'analysis',
      created_at: new Date().toISOString()
    });

    log('Session record written to organism_memory. Proof: ' + id);
    log('=== SESSION COMPLETE ===');
  } catch(e) {
    log('SESSION ERROR: ' + e.message);
  }
}

// ── STARTUP ────────────────────────────────────────────────────────────────
log('═══════════════════════════════════════════════');
log('HGI LIVING ORGANISM V2 — STARTING');
log('37 agents. One shared brain. All into all.');
log('This server never sleeps. It never times out.');
log('═══════════════════════════════════════════════');

// Run startup session after 3 seconds
setTimeout(() => runSession('startup').catch(console.error), 3000);

// Daily session at 6 AM CST
const SIX_AM_CST_UTC = 12; // 6 AM CST = 12 UTC
setInterval(() => {
  const hour = new Date().getUTCHours();
  const min = new Date().getUTCMinutes();
  if (hour === SIX_AM_CST_UTC && min === 0) {
    log('Daily scheduled session firing');
    runSession('scheduled_daily').catch(console.error);
  }
}, 60000); // check every minute

log('Startup complete. Waiting 3s before first session...');
