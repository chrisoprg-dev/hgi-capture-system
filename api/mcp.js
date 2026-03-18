// api/mcp.mjs — HGI AI Capture System MCP Server v2
// Single self-contained file. All tools inline.
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'chrisoprg-dev';
const REPO_NAME = 'hgi-capture-system';

const ghHeaders = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

const supabaseHeaders = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

const supabaseGet = async (path) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseHeaders });
  if (!r.ok) throw new Error(`Supabase: ${r.status} ${await r.text()}`);
  return r.json();
};

const sb = async (path, opts = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...opts.headers },
    ...opts
  });
  if (!r.ok) throw new Error(`Supabase: ${r.status} ${await r.text()}`);
  return r.json();
};

const getFile = async (path) => {
  const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=main`, { headers: ghHeaders });
  if (!r.ok) return null;
  const d = await r.json();
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha };
};

const pushFile = async (path, content, sha, message) => {
  const body = { message, content: Buffer.from(content, 'utf-8').toString('base64'), branch: 'main' };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`GitHub: ${await r.text()}`);
  return r.json();
};

const callClaude = async (prompt, system, maxTokens = 4000) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system: system || 'You are a senior capture manager for HGI.', messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) throw new Error(`Claude: ${r.status}`);
  const d = await r.json();
  return d.content.filter(b => b.type === 'text').map(b => b.text).join('');
};

const TOOLS = [
  { name: 'read_file', description: 'Read the current raw content of any file in the HGI codebase from GitHub. Always call this before modify_system to avoid blind edits.', inputSchema: { type: 'object', properties: { filename: { type: 'string', description: 'File path e.g. api/intake.js or components/Dashboard.js' } }, required: ['filename'] } },
  { name: 'modify_system', description: 'Modify or create any file in the HGI Capture System. Deploys in ~60 seconds.', inputSchema: { type: 'object', properties: { instruction: { type: 'string' }, filename: { type: 'string' } }, required: ['instruction', 'filename'] } },
  { name: 'restore_file_from_git', description: 'Restore any file to its last known good version before MCP modifications. Use when a file gets corrupted.', inputSchema: { type: 'object', properties: { filename: { type: 'string', description: 'File to restore e.g. components/KnowledgeBase.js' } }, required: ['filename'] } },
  { name: 'query_pipeline', description: 'Query the HGI opportunity pipeline.', inputSchema: { type: 'object', properties: { min_opi: { type: 'number' }, stage: { type: 'string' }, vertical: { type: 'string' }, state: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'query_knowledge_base', description: "Query HGI's 95-year institutional knowledge base.", inputSchema: { type: 'object', properties: { vertical: { type: 'string' }, query: { type: 'string' } }, required: ['vertical'] } },
  { name: 'generate_proposal_section', description: 'Generate a submission-ready proposal section using HGI KB.', inputSchema: { type: 'object', properties: { section: { type: 'string' }, rfp_context: { type: 'string' }, opportunity_title: { type: 'string' }, agency: { type: 'string' }, vertical: { type: 'string' } }, required: ['section', 'rfp_context'] } },
  { name: 'score_opportunity', description: 'Score an opportunity using HGI OPI model 0-100.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, agency: { type: 'string' }, description: { type: 'string' }, value: { type: 'string' }, vertical: { type: 'string' }, incumbent: { type: 'string' }, deadline: { type: 'string' } }, required: ['title', 'agency', 'description'] } },
  { name: 'add_to_pipeline', description: 'Add a new opportunity to the HGI pipeline.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, agency: { type: 'string' }, value: { type: 'string' }, deadline: { type: 'string' }, vertical: { type: 'string' }, state: { type: 'string' }, source_url: { type: 'string' }, description: { type: 'string' }, opi_score: { type: 'number' } }, required: ['title', 'agency'] } },
  { name: 'get_system_status', description: 'Get current HGI system status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'query_database', description: 'Read any HGI Supabase table.', inputSchema: { type: 'object', properties: { table: { type: 'string' }, filters: { type: 'string' }, select: { type: 'string' }, limit: { type: 'number' } }, required: ['table'] } },
  { name: 'delete_records', description: 'Delete records from any Supabase table by ID array.', inputSchema: { type: 'object', properties: { table: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } }, required: ['table', 'ids'] } },
  { name: 'delete_kb_records', description: 'Delete knowledge base records by ID array.', inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } },
  { name: 'generate_weekly_digest', description: 'Generate HGI weekly capture intelligence digest.', inputSchema: { type: 'object', properties: { focus: { type: 'string' } } } },
  { name: 'research_opportunity', description: 'Generate full competitive intelligence pack for an opportunity.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, agency: { type: 'string' }, vertical: { type: 'string' }, value: { type: 'string' }, context: { type: 'string' } }, required: ['title', 'agency'] } },
  { name: 'check_apify_status', description: 'Check Apify scraper status, last run details, and recent log output.', inputSchema: { type: 'object', properties: {} } },
  { name: 'run_orchestrator', description: 'Run the full intelligence orchestration workflow on an opportunity. Executes: scope analysis → financial analysis → research → revised OPI score → winnability → auto-proposal (if GO). Returns all results including revised score and GO/NO-GO recommendation.', inputSchema: { type: 'object', properties: { opportunity_id: { type: 'string', description: 'The opportunity ID from the pipeline' } }, required: ['opportunity_id'] } },
  { name: 'update_opportunity', description: 'Update any field on an opportunity record in the pipeline.', inputSchema: { type: 'object', properties: { opportunity_id: { type: 'string' }, updates: { type: 'object', description: 'Key-value pairs to update, e.g. {opi_score: 75, status: "active"}' } }, required: ['opportunity_id', 'updates'] } },
  { name: 'fetch_source_page', description: 'Fetch and extract text content from an RFP source URL.', inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'The URL to fetch' } }, required: ['url'] } },
  { name: 'search_opportunities', description: 'Fuzzy search opportunities by title or agency name.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search term to match against title or agency' }, status: { type: 'string', description: 'Filter by status (active, filtered, no_bid)' } }, required: ['query'] } },
  { name: 'mark_stage', description: 'Set the stage of an opportunity (identified, qualifying, pursuing, proposal, submitted, won, lost, no_bid).', inputSchema: { type: 'object', properties: { opportunity_id: { type: 'string' }, stage: { type: 'string', description: 'New stage: identified, qualifying, pursuing, proposal, submitted, won, lost, no_bid' } }, required: ['opportunity_id', 'stage'] } }
];

const handleTool = async (name, input) => {
  switch (name) {

    case 'read_file': {
      const { filename } = input;
      const file = await getFile(filename);
      if (!file) return { content: [{ type: 'text', text: 'File not found: ' + filename }] };
      const lines = file.content.split('\n').length;
      const size = Buffer.byteLength(file.content, 'utf8');
      return { content: [{ type: 'text', text: 'File: ' + filename + '\nSize: ' + size + ' bytes | ' + lines + ' lines\n\n' + file.content }] };
    }

    case 'modify_system': {
      const { instruction, filename } = input;
      const file = await getFile(filename);
      if (!file) {
        await pushFile(filename, instruction, null, 'MCP: Create ' + filename);
        return { success: true, created: true, message: 'Created ' + filename + '. Deploying in ~60 seconds.' };
      }
      let parsed;
      try {
        const clean = instruction.replace(/```json|```/gi, '').trim();
        parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
      } catch(e) {
        return { error: 'instruction must be JSON: {"find": "...", "replace": "..."}' };
      }
      if (!file.content.includes(parsed.find)) return { error: 'Find string not found in ' + filename };
      const finalContent = file.content.replace(parsed.find, parsed.replace);
      await pushFile(filename, finalContent, file.sha, 'MCP: edit ' + filename);
      return { success: true, message: 'Modified ' + filename + '. Deploying in ~60 seconds.' };
    }

    case 'restore_file_from_git': {
      const { filename } = input;
      const commitsR = await fetch('https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/commits?path=' + encodeURIComponent(filename) + '&per_page=30', { headers: ghHeaders });
      const commits = await commitsR.json();
      const good = commits.find(c => !c.commit.message.startsWith('MCP:') && !c.commit.message.startsWith('AI modification:'));
      if (!good) return { error: 'No pre-MCP commits found for this file' };
      const fileR = await fetch('https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + encodeURIComponent(filename) + '?ref=' + good.sha, { headers: ghHeaders });
      const fileData = await fileR.json();
      const restored = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const current = await getFile(filename);
      if (!current) return { error: 'Current file not found' };
      await pushFile(filename, restored, current.sha, 'MCP: Restore ' + filename + ' to pre-MCP state');
      return { restored: true, filename, from_commit: good.commit.message };
    }

    case 'query_pipeline': {
      const { min_opi, stage, vertical, state, limit = 20 } = input;
      let path = 'opportunities?limit=' + limit + '&order=opi_score.desc';
      if (min_opi) path += '&opi_score=gte.' + min_opi;
      if (stage) path += '&stage=eq.' + stage;
      if (vertical) path += '&vertical=eq.' + vertical;
      if (state) path += '&state=eq.' + state;
      const data = await sb(path);
      return { count: data.length, opportunities: data };
    }

    case 'query_knowledge_base': {
      const { vertical, query } = input;
      const r = await fetch('https://hgi-capture-system.vercel.app/api/knowledge-query?vertical=' + encodeURIComponent(vertical));
      const data = await r.json();
      if (query && data.prompt_injection) {
        const answer = await callClaude('From HGI KB for "' + vertical + '", answer: ' + query + '\n\nKB:\n' + data.prompt_injection, 'Expert on HGI institutional knowledge.');
        return { vertical, query, answer };
      }
      return { vertical, prompt_injection: data.prompt_injection, found: data.found };
    }

    case 'generate_proposal_section': {
      const { section, rfp_context, opportunity_title, agency, vertical = 'disaster_recovery' } = input;
      const kbR = await fetch('https://hgi-capture-system.vercel.app/api/knowledge-query?vertical=' + encodeURIComponent(vertical));
      const kb = (await kbR.json()).prompt_injection || '';
      const labels = { executive_summary: 'Executive Summary', technical_approach: 'Technical Approach', management_approach: 'Management Approach', staffing_plan: 'Staffing Plan', past_performance: 'Past Performance Matrix', transition_plan: 'Transition Plan', pricing_narrative: 'Pricing Narrative', compliance_matrix: 'Compliance Matrix', clarifying_questions: 'Clarifying Questions', red_team: 'Red Team Critique' };
      const content = await callClaude('Write complete ' + (labels[section] || section) + ' for HGI.\nOpportunity: ' + (opportunity_title || 'Government Contract') + '\nAgency: ' + (agency || 'Agency') + '\nRFP: ' + rfp_context + '\n\nHGI KB:\n' + kb.slice(0, 3000) + '\n\nWrite 600+ words. Use real HGI past performance.', 'HGI senior proposal writer. Use ONLY: Road Home $13B, Restore Louisiana, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20+ years. ' + kb.slice(0, 2000));
      return { section: labels[section] || section, content, word_count: content.split(' ').length };
    }

    case 'score_opportunity': {
      const { title, agency, description, value, vertical, incumbent, deadline } = input;
      const scoring = await callClaude('Score for HGI OPI:\nTitle: ' + title + '\nAgency: ' + agency + '\nDescription: ' + description + '\nValue: ' + value + '\nVertical: ' + vertical + '\nIncumbent: ' + incumbent + '\nDeadline: ' + deadline + '\n\nScore: Past Performance(30) Technical(20) Competitive(15) Relationship(15) Strategic(10) Financial(10)\n\nReturn: total OPI, sub-scores, GO/CONDITIONAL GO/NO-BID/WATCHLIST, win themes, risks, 48hr action plan.', 'HGI chief capture strategist.');
      return { title, agency, scoring };
    }

    case 'add_to_pipeline': {
      const { title, agency, value, deadline, vertical, state, source_url, description, opi_score } = input;
      await sb('opportunities', { method: 'POST', body: JSON.stringify({ title, agency, estimated_value: value, due_date: deadline, vertical: vertical || 'disaster', state: state || 'LA', source_url, description, opi_score, stage: opi_score >= 75 ? 'pursuing' : 'identified', source: 'MCP_MANUAL', discovered_at: new Date().toISOString() }) });
      return { success: true, message: 'Added "' + title + '" to pipeline' };
    }

    case 'get_system_status': {
      // HTHA self-heal: fix missing due_date
      try {
        const hthaCheck = await supabaseGet('opportunities?id=eq.manualtest-manual-htha-2026-03-04-001&select=due_date,state,urgency');
        if (hthaCheck && hthaCheck.length > 0 && (!hthaCheck[0].due_date || hthaCheck[0].due_date === '')) {
          await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.manualtest-manual-htha-2026-03-04-001', {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ due_date: '2026-03-19', state: 'LA', urgency: 'IMMEDIATE', last_updated: new Date().toISOString() })
          });
        }
      } catch(e) { console.warn('HTHA heal failed:', e.message); }

      // Self-heal: fix null stages on active pursuing opportunities
      try {
        await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.manualtest-manual-htha-2026-03-04-001&stage=is.null', {
          method: 'PATCH',
          headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ stage: 'pursuing', last_updated: new Date().toISOString() })
        });
        await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu&stage=is.null', {
          method: 'PATCH',
          headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ stage: 'pursuing', last_updated: new Date().toISOString() })
        });
      } catch(e) { console.warn('Stage heal failed:', e.message); }

      const [opps, docs, hunts] = await Promise.all([
        sb('opportunities?select=stage,opi_score&limit=1000').catch(() => []),
        sb('knowledge_documents?select=status,vertical,filename&limit=1000').catch(() => []),
        sb('hunt_runs?select=run_at,status&order=run_at.desc&limit=5').catch(() => [])
      ]);

      // Apify scraper status check
      let apifyStatus = null;
      try {
        const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
        const actsRes = await fetch('https://api.apify.com/v2/acts?token=' + APIFY_TOKEN + '&my=true');
        if (actsRes.ok) {
          const actsData = await actsRes.json();
          const actor = (actsData.data?.items || []).find(a => a.name === 'hgi-central-bidding-scraper');
          if (actor) {
            const runsRes = await fetch('https://api.apify.com/v2/acts/' + actor.id + '/runs?token=' + APIFY_TOKEN + '&limit=1&desc=true');
            if (runsRes.ok) {
              const runsData = await runsRes.json();
              const lastRun = runsData.data?.items?.[0];
              if (lastRun) {
                const logRes = await fetch('https://api.apify.com/v2/actor-runs/' + lastRun.id + '/log?token=' + APIFY_TOKEN);
                const logText = logRes.ok ? await logRes.text() : '';
                apifyStatus = {
                  actorId: actor.id,
                  lastRunId: lastRun.id,
                  status: lastRun.status,
                  startedAt: lastRun.startedAt,
                  finishedAt: lastRun.finishedAt,
                  buildId: lastRun.buildId,
                  log_tail: logText.slice(-3000)
                };
              }
            }
          }
        } else {
          apifyStatus = { error: 'Apify API returned ' + actsRes.status, statusText: actsRes.statusText };
        }
      } catch(e) { apifyStatus = { error: e.message, stack: e.stack }; }

      return { pipeline: { total: opps.length, tier1: opps.filter(o => o.opi_score >= 70).length, pursuing: opps.filter(o => o.stage === 'pursuing').length, proposal: opps.filter(o => o.stage === 'proposal').length }, knowledge_base: { total: docs.length, extracted: docs.filter(d => d.status === 'extracted').length }, recent_hunts: hunts, apify: apifyStatus, timestamp: new Date().toISOString() };
    }

    case 'query_database': {
      const { table, filters, select = '*', limit = 50 } = input;
      let path = table + '?select=' + select + '&limit=' + limit + '&order=uploaded_at.desc';
      if (filters) path += '&' + filters;
      const data = await sb(path);
      return { table, data, _debug_path: path };
    }

    case 'delete_records': {
      const { table, ids } = input;
      let deleted = 0;
      for (const id of ids) {
        const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        if (r.ok) deleted++;
      }
      return { deleted, total: ids.length };
    }

    case 'delete_kb_records': {
      const { ids } = input;
      let deleted = 0;
      for (const id of ids) {
        const r = await fetch(SUPABASE_URL + '/rest/v1/knowledge_documents?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        if (r.ok) deleted++;
      }
      return { deleted, total: ids.length };
    }

    case 'generate_weekly_digest': {
      const { focus } = input;
      const opps = await sb('opportunities?status=eq.active&order=opi_score.desc&limit=50').catch(() => []);
      const top = opps.slice(0, 10).map(o => '- ' + o.title + ' | ' + o.agency + ' | OPI: ' + o.opi_score + ' | Stage: ' + o.stage + ' | Due: ' + (o.due_date || 'TBD')).join('\n');
      const digest = await callClaude('HGI Weekly Digest ' + new Date().toLocaleDateString() + '.\n' + (focus ? 'FOCUS: ' + focus + '\n' : '') + 'PIPELINE:\n' + top + '\nTotal: ' + opps.length + ' | Tier1: ' + opps.filter(o => o.opi_score >= 70).length + '\n\n## EXECUTIVE SUMMARY\n## HOT OPPORTUNITIES\n## PRE-RFP PIPELINE\n## RECOMPETE WATCHLIST\n## TOP 5 ACTIONS THIS WEEK', 'HGI chief intelligence analyst. Audience: Christopher Oney, President.');
      return { digest, generated_at: new Date().toISOString() };
    }

    case 'research_opportunity': {
      const { title, agency, vertical, value, context } = input;
      const research = await callClaude('Capture intel for HGI:\nOpportunity: ' + title + '\nAgency: ' + agency + '\nVertical: ' + vertical + '\nValue: ' + value + '\nContext: ' + context + '\n\n1. AGENCY PROFILE\n2. DECISION-MAKER INTEL\n3. COMPETITIVE INTEL\n4. HGI WIN STRATEGY\n5. RED FLAGS\n6. 48-HOUR ACTION PLAN\n7. RELATIONSHIP GAPS', 'HGI senior capture intelligence analyst.');
      return { title, agency, research };
    }

    case 'check_apify_status': {
      const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
      const actsRes = await fetch('https://api.apify.com/v2/acts?token=' + APIFY_TOKEN + '&my=true');
      if (!actsRes.ok) return { error: 'Apify auth failed: ' + actsRes.status };
      const actsData = await actsRes.json();
      const actors = actsData.data?.items || [];
      const actor = actors.find(a => a.name === 'hgi-central-bidding-scraper') || actors.find(a => a.name === 'hgi-lapac-scraper');
      if (!actor) return { error: 'No HGI actors found', available: actors.map(a => a.name) };
      const runsRes = await fetch('https://api.apify.com/v2/acts/' + actor.id + '/runs?token=' + APIFY_TOKEN + '&limit=3&desc=true');
      const runsData = await runsRes.json();
      const runs = runsData.data?.items || [];
      const lastRun = runs[0];
      const logRes = await fetch('https://api.apify.com/v2/actor-runs/' + (lastRun?.id) + '/log?token=' + APIFY_TOKEN);
      const logText = logRes.ok ? (await logRes.text()).slice(-2000) : '';
      return { actor: actor.name, actorId: actor.id, lastRun, recentRuns: runs.map(r => ({id:r.id,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt})), log_tail: logText };
    }

    case 'run_orchestrator': {
      const { opportunity_id } = input;
      const r = await fetch('https://hgi-capture-system.vercel.app/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id, trigger: 'mcp' })
      });
      if (!r.ok) throw new Error('Orchestrator returned ' + r.status);
      return await r.json();
    }

    case 'update_opportunity': {
      const { opportunity_id, updates } = input;
      await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id), {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ ...updates, last_updated: new Date().toISOString() })
      });
      return { success: true, opportunity_id, updated_fields: Object.keys(updates) };
    }

    case 'fetch_source_page': {
      const { url } = input;
      
      // Determine endpoint based on URL domain
      const isCentralBidding = url.includes('centralauctionhouse.com') || url.includes('centralbidding.com');
      const endpoint = isCentralBidding ? '/api/fetch-central-bidding' : '/api/fetch-rfp';
      
      const r = await fetch('https://hgi-capture-system.vercel.app' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!r.ok) return { error: 'Fetch failed: ' + r.status };
      const d = await r.json();
      return { url, textContent: (d.textContent || '').slice(0, 5000), length: (d.textContent || '').length };
    }

    default:
      return { error: 'Unknown tool: ' + name };
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: ' + JSON.stringify({ type: 'endpoint', endpoint: '/api/mcp' }) + '\n\n');
    const interval = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => clearInterval(interval));
    return;
  }

  if (req.method === 'POST') {
    const { method, params, id } = req.body || {};
    if (method === 'initialize') return res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'HGI Capture System', version: '2.0.0' } } });
    if (method === 'tools/list') return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      try {
        const result = await handleTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
      } catch (e) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } });
      }
    }
    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method: ' + method } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
