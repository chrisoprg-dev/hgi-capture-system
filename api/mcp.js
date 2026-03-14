// api/mcp.js — HGI AI Capture System MCP Server
// Exposes HGI system capabilities as MCP tools for direct Claude integration
// Connect at: https://hgi-capture-system.vercel.app/api/mcp

export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MCP_SECRET = process.env.MCP_SECRET || 'hgi-mcp-2026-secure';
const REPO_OWNER = 'chrisoprg-dev';
const REPO_NAME = 'hgi-capture-system';

const sb = async (path, opts = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...opts.headers
    },
    ...opts
  });
  if (!r.ok) throw new Error(`Supabase error: ${r.status} ${await r.text()}`);
  return r.json();
};

const ghHeaders = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

const getFile = async (path) => {
  const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=main`, { headers: ghHeaders });
  if (!r.ok) return null;
  const d = await r.json();
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha };
};

const pushFile = async (path, content, sha, message) => {
  const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: 'PUT', headers: ghHeaders,
    body: JSON.stringify({ message, content: Buffer.from(content, 'utf-8').toString('base64'), sha, branch: 'main' })
  });
  if (!r.ok) throw new Error(`GitHub push failed: ${await r.text()}`);
  return r.json();
};

const callClaude = async (prompt, system, maxTokens = 4000) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: system || 'You are a senior capture manager for HGI (Hammerman & Gainer LLC), a 95-year government contracting firm.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error(`Claude error: ${r.status}`);
  const d = await r.json();
  return d.content.filter(b => b.type === 'text').map(b => b.text).join('');
};

const TOOLS = [
  {
    name: 'modify_system',
    description: 'Modify any file in the HGI Capture System codebase. Writes the change to GitHub and Vercel deploys automatically in ~60 seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language description of what to change' },
        filename: { type: 'string', description: 'File to modify e.g. components/Dashboard.js or api/knowledge-query.js' }
      },
      required: ['instruction', 'filename']
    }
  },
  {
    name: 'query_pipeline',
    description: 'Query the HGI opportunity pipeline from Supabase. Returns opportunities with OPI scores, stages, deadlines.',
    inputSchema: {
      type: 'object',
      properties: {
        min_opi: { type: 'number', description: 'Minimum OPI score 0-100' },
        stage: { type: 'string', description: 'Pipeline stage: identified, qualifying, pursuing, proposal, submitted, won, lost' },
        vertical: { type: 'string', description: 'Vertical: disaster, tpa, workforce, health, infrastructure, tax_appeals, federal' },
        state: { type: 'string', description: 'State code: LA, TX, FL, MS, AL, GA' },
        limit: { type: 'number', description: 'Max results default 20' }
      }
    }
  },
  {
    name: 'query_knowledge_base',
    description: "Query HGI's 95-year institutional knowledge base — past performance, win themes, pricing history, and operational doctrine.",
    inputSchema: {
      type: 'object',
      properties: {
        vertical: { type: 'string', description: 'Vertical: disaster_recovery, tpa, workforce, health, infrastructure, tax_appeals, federal' },
        query: { type: 'string', description: 'Specific question or topic to search for' }
      },
      required: ['vertical']
    }
  },
  {
    name: 'generate_proposal_section',
    description: 'Generate a complete submission-ready proposal section using HGI knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Section: executive_summary, technical_approach, management_approach, staffing_plan, past_performance, transition_plan, pricing_narrative, compliance_matrix, clarifying_questions, red_team' },
        rfp_context: { type: 'string', description: 'RFP text or key requirements' },
        opportunity_title: { type: 'string', description: 'Opportunity name' },
        agency: { type: 'string', description: 'Agency name' },
        vertical: { type: 'string', description: 'Vertical for KB injection' }
      },
      required: ['section', 'rfp_context']
    }
  },
  {
    name: 'score_opportunity',
    description: 'Score an opportunity using the HGI OPI model 0-100 with GO/NO-BID recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Opportunity title' },
        agency: { type: 'string', description: 'Agency name' },
        description: { type: 'string', description: 'Scope description or RFP summary' },
        value: { type: 'string', description: 'Estimated contract value' },
        vertical: { type: 'string', description: 'Contract vertical' },
        incumbent: { type: 'string', description: 'Known incumbent' },
        deadline: { type: 'string', description: 'Proposal deadline' }
      },
      required: ['title', 'agency', 'description']
    }
  },
  {
    name: 'add_to_pipeline',
    description: 'Add a new opportunity directly to the HGI pipeline in Supabase.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Opportunity title' },
        agency: { type: 'string', description: 'Agency name' },
        value: { type: 'string', description: 'Estimated value' },
        deadline: { type: 'string', description: 'Deadline YYYY-MM-DD' },
        vertical: { type: 'string', description: 'Contract vertical' },
        state: { type: 'string', description: 'State code' },
        source_url: { type: 'string', description: 'Source URL' },
        description: { type: 'string', description: 'Description' },
        opi_score: { type: 'number', description: 'OPI score if calculated' }
      },
      required: ['title', 'agency']
    }
  },
  {
    name: 'get_system_status',
    description: 'Get current HGI Capture System status — KB health, pipeline counts, last hunt run.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'query_database',
    description: 'Run a read query against any HGI Supabase table.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table: opportunities, knowledge_documents, hunt_runs' },
        filters: { type: 'string', description: 'Supabase filter e.g. opi_score=gte.75' },
        select: { type: 'string', description: 'Fields to select default *' },
        limit: { type: 'number', description: 'Max results' }
      },
      required: ['table']
    }
  },
  {
    name: 'delete_records',
    description: 'Delete records from any Supabase table by ID array. Use to remove broken KB .url placeholder records.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name e.g. knowledge_documents' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Array of record IDs to delete' }
      },
      required: ['table', 'ids']
    }
  },
  {
    name: 'generate_weekly_digest',
    description: 'Generate the HGI weekly capture intelligence digest.',
    inputSchema: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'Optional special focus area' }
      }
    }
  },
  {
    name: 'restore_file_from_git',
    description: 'Restore any file to its last known good version from git history. Use when a file gets corrupted by a bad modification.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename to restore' },
        commit_sha: { type: 'string', description: 'Optional specific commit SHA to restore from' }
      },
      required: ['filename']
    }
  },
  {
    name: 'research_opportunity',
    description: 'Generate full competitive intelligence and capture research pack for an opportunity.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Opportunity title' },
        agency: { type: 'string', description: 'Agency name' },
        vertical: { type: 'string', description: 'Contract vertical' },
        value: { type: 'string', description: 'Estimated value' },
        context: { type: 'string', description: 'Additional context' }
      },
      required: ['title', 'agency']
    }
  },
  {
    name: 'delete_kb_records',
    description: 'Delete knowledge base records by ID array. Use to remove broken .url shortcut placeholder records.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Array of document IDs to delete' }
      },
      required: ['ids']
    }
  }
];

const handleTool = async (name, input) => {
  switch (name) {

    case 'modify_system': {
      const { instruction, filename } = input;
      const file = await getFile(filename);
      if (!file) { const newContent = await callClaude(`Create a new file called ${filename} for the HGI Capture System.\n\nINSTRUCTION: ${instruction}\n\nWrite the complete file content. Raw code only. No markdown.`, 'You are a senior software engineer. Write complete, production-ready code.', 8000); const createR = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filename}`, { method: 'PUT', headers: ghHeaders, body: JSON.stringify({ message: `MCP: Create ${filename}`, content: Buffer.from(newContent, 'utf-8').toString('base64'), branch: 'main' }) }); if (!createR.ok) return { error: `Failed to create file: ${await createR.text()}` }; return { success: true, message: `Created ${filename}. Deploying in ~60 seconds.`, created: true }; }
      const isLarge = file.content.length > 50000;
      let prompt;
      if (isLarge) {
        prompt = `You are modifying the HGI Capture System. File: ${filename}\n\nINSTRUCTION: ${instruction}\n\nCURRENT FILE:\n${file.content.slice(0, 80000)}\n\nReturn ONLY valid JSON: {"find": "exact string to find", "replace": "exact replacement string"}. No markdown.`;
      } else {
        prompt = `You are modifying the HGI Capture System. File: ${filename}\n\nINSTRUCTION: ${instruction}\n\nCURRENT FILE:\n${file.content}\n\nReturn the COMPLETE modified file. Raw code only. No markdown.`;
      }
      const result = await callClaude(prompt, 'You are a senior software engineer. Return only code.', 8000);
      let finalContent;
      if (isLarge) {
        const clean = result.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(clean);
        if (!file.content.includes(parsed.find)) return { error: 'Find string not found in file' };
        finalContent = file.content.replace(parsed.find, parsed.replace);
        if (finalContent.includes('const //') || finalContent.includes('var //') || finalContent.includes('let //')) {
          return { error: 'Validation failed: broken replacement detected. Aborted.' };
        }
      } else {
        finalContent = result;
      }
      await pushFile(filename, finalContent, file.sha, `MCP: ${instruction.slice(0, 72)}`);
      return { success: true, message: `Modified ${filename}. Deploying in ~60 seconds.` };
    }

    case 'query_pipeline': {
      const { min_opi, stage, vertical, state, limit = 20 } = input;
      let path = `opportunities?limit=${limit}&order=opi_score.desc`;
      if (min_opi) path += `&opi_score=gte.${min_opi}`;
      if (stage) path += `&stage=eq.${stage}`;
      if (vertical) path += `&vertical=eq.${vertical}`;
      if (state) path += `&state=eq.${state}`;
      const data = await sb(path);
      return { count: data.length, opportunities: data };
    }

    case 'query_knowledge_base': {
      const { vertical, query } = input;
      const r = await fetch(`https://hgi-capture-system.vercel.app/api/knowledge-query?vertical=${encodeURIComponent(vertical)}`);
      const data = await r.json();
      if (query && data.prompt_injection) {
        const answer = await callClaude(`From HGI's knowledge base for vertical "${vertical}", answer: ${query}\n\nKNOWLEDGE BASE:\n${data.prompt_injection}`, 'You are an expert on HGI institutional knowledge.');
        return { vertical, query, answer };
      }
      return { vertical, prompt_injection: data.prompt_injection, found: data.found };
    }

    case 'generate_proposal_section': {
      const { section, rfp_context, opportunity_title, agency, vertical = 'disaster_recovery' } = input;
      const kbR = await fetch(`https://hgi-capture-system.vercel.app/api/knowledge-query?vertical=${encodeURIComponent(vertical)}`);
      const kbData = await kbR.json();
      const kb = kbData.prompt_injection || '';
      const labels = { executive_summary: 'Executive Summary', technical_approach: 'Technical Approach', management_approach: 'Management Approach', staffing_plan: 'Staffing Plan', past_performance: 'Past Performance Matrix', transition_plan: 'Transition Plan', pricing_narrative: 'Pricing Narrative', compliance_matrix: 'Compliance Matrix', clarifying_questions: 'Clarifying Questions', red_team: 'Red Team Critique' };
      const label = labels[section] || section;
      const content = await callClaude(
        `Write a complete submission-ready ${label} for HGI.\nOpportunity: ${opportunity_title || 'Government Contract'}\nAgency: ${agency || 'Government Agency'}\nRFP: ${rfp_context}\n\nHGI KB:\n${kb.slice(0, 3000)}\n\nWrite at least 600 words. Use real HGI past performance from KB.`,
        `You are HGI's senior proposal writer. Use ONLY verified past performance: Road Home $13B, Restore Louisiana, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20+ years. ${kb.slice(0, 2000)}`
      );
      return { section: label, content, word_count: content.split(' ').length };
    }

    case 'score_opportunity': {
      const { title, agency, description, value, vertical, incumbent, deadline } = input;
      const scoring = await callClaude(
        `Score for HGI OPI model:\nTitle: ${title}\nAgency: ${agency}\nDescription: ${description}\nValue: ${value}\nVertical: ${vertical}\nIncumbent: ${incumbent}\nDeadline: ${deadline}\n\nScore 6 factors:\n1. Past Performance Match 0-30\n2. Technical Capability 0-20\n3. Competitive Position 0-15\n4. Relationship Intel 0-15\n5. Strategic Value 0-10\n6. Financial Fit 0-10\n\nReturn: OPI total, sub-scores, GO/CONDITIONAL GO/NO-BID/WATCHLIST, top 3 win themes, top 3 risks, 48-hour action plan.`,
        'You are HGI chief capture strategist. Be specific and decisive.'
      );
      return { title, agency, scoring };
    }

    case 'add_to_pipeline': {
      const { title, agency, value, deadline, vertical, state, source_url, description, opi_score } = input;
      const data = await sb('opportunities', {
        method: 'POST',
        body: JSON.stringify({ title, agency, estimated_value: value, due_date: deadline, vertical: vertical || 'disaster', state: state || 'LA', source_url, description, opi_score, stage: opi_score >= 75 ? 'pursuing' : 'identified', source: 'MCP_MANUAL', discovered_at: new Date().toISOString() })
      });
      return { success: true, message: `Added "${title}" to pipeline` };
    }

    case 'get_system_status': {
      const [opps, docs, hunts] = await Promise.all([
        sb('opportunities?select=stage,opi_score&limit=1000').catch(() => []),
        sb('knowledge_documents?select=status,vertical&limit=1000').catch(() => []),
        sb('hunt_runs?select=run_at,status&order=run_at.desc&limit=5').catch(() => [])
      ]);
      return {
        pipeline: { total: opps.length, tier1: opps.filter(o => o.opi_score >= 70).length, pursuing: opps.filter(o => o.stage === 'pursuing').length, proposal: opps.filter(o => o.stage === 'proposal').length },
        knowledge_base: { total: docs.length, extracted: docs.filter(d => d.status === 'extracted').length },
        recent_hunts: hunts,
        timestamp: new Date().toISOString()
      };
    }

    case 'query_database': {
      const { table, filters, select = '*', limit = 50 } = input;
      let path = `${table}?select=${select}&limit=${limit}`;
      if (filters) path += `&${filters}`;
      const data = await sb(path);
      return { table, count: data.length, data };
    }

    case 'delete_records': {
      const { table, ids } = input;
      let deleted = 0;
      const errors = [];
      for (const id of ids) {
        try {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }
          });
          if (r.ok) deleted++;
          else errors.push(`${id}: ${r.status}`);
        } catch(e) {
          errors.push(`${id}: ${e.message}`);
        }
      }
      return { deleted, total: ids.length, errors };
    }

    case 'generate_weekly_digest': {
      const { focus } = input;
      const opps = await sb('opportunities?order=opi_score.desc&limit=50').catch(() => []);
      const top = opps.slice(0, 10).map(o => `- ${o.title} | ${o.agency} | OPI: ${o.opi_score} | Stage: ${o.stage} | Due: ${o.due_date || 'TBD'}`).join('\n');
      const digest = await callClaude(
        `Generate HGI Weekly Capture Digest for ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\n${focus ? `FOCUS: ${focus}\n` : ''}PIPELINE:\n${top}\nTotal: ${opps.length} | Tier 1: ${opps.filter(o => o.opi_score >= 70).length} | Proposal: ${opps.filter(o => o.stage === 'proposal').length}\n\nGenerate:\n## EXECUTIVE SUMMARY\n## HOT OPPORTUNITIES\n## PRE-RFP PIPELINE\n## RECOMPETE WATCHLIST\n## PIPELINE STATUS\n## TOP 5 ACTIONS THIS WEEK`,
        'You are HGI chief intelligence analyst. Be specific and actionable. Audience: Christopher Oney, President.'
      );
      return { digest, generated_at: new Date().toISOString() };
    }

    case 'restore_file_from_git': {
      const { filename, commit_sha } = input;
      const commitsR = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?path=${encodeURIComponent(filename)}&per_page=20`, { headers: ghHeaders });
      const commits = await commitsR.json();
      const goodCommit = commits.find(c => !c.commit.message.startsWith('MCP:') && !c.commit.message.startsWith('AI modification:'));
      if (!goodCommit) return { error: 'No pre-MCP commits found for this file' };
      const sha = commit_sha || goodCommit.sha;
      const fileR = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filename}?ref=${sha}`, { headers: ghHeaders });
      const fileData = await fileR.json();
      const restoredContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const currentFile = await getFile(filename);
      if (!currentFile) return { error: 'Current file not found' };
      await pushFile(filename, restoredContent, currentFile.sha, `MCP: Restore ${filename} to pre-MCP state`);
      return { restored: true, filename, from_commit: goodCommit.commit.message, sha };
    }

    case 'delete_kb_records': {
      const ids = ["doc-1772790201895-WORD------HGI-Proposal------SWBNO------Appeal-Management-Services-------08-Decem","doc-1772831317625-Restore-PA-Management-9-24-2021-email-pdf-url","doc-1772831329017-Homeowners-Assistance-Program-pdf-url","doc-1772833559581-DSS-Deepwater-Horizon-Oil-Spill-Claims-Analysis-Final-Submitted-pdf-url","doc-1772833563376-Final-Draft---TPCIGA-2024-0102-Proposal-Response---Hammerman-and-Gainer--LLC-pdf","doc-1772833566965-RFP-for-Program-Management-of-Disaster-Response-and-Recovery-Housing-Programs-FI","doc-1772833569256-HGI-Response-to-RFP-2024-19-FEMA-Public-Assistance-Services---FINAL-pdf-url","doc-1772833572692-HGI-GOHSEP-Technical-Proposal-4-23-25-FINAL-pdf-url","doc-1772833576950-HGI-Response-to-RFP-2024-19-FEMA-Public-Assistance-Services---FINAL-pdf-url","doc-1772833580803-TPG-Proposal-Final-pdf-url","doc-1772833582697-WORD------HGI-Proposal------SWBNO------Appeal-Management-Services-------08-Decem","doc-1772833805264-LWC-Rapid-Response-RFP--October-28--2021--docx-url"];
      let deleted = 0;
      for (const id of ids) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        if (r.ok) deleted++;
      }
      return { deleted, total: ids.length };
    }

    case 'research_opportunity': {
      const { title, agency, vertical, value, context } = input;
      const research = await callClaude(
        `Capture intelligence research for HGI:\nOpportunity: ${title}\nAgency: ${agency}\nVertical: ${vertical}\nValue: ${value}\nContext: ${context}\n\nProvide:\n1. AGENCY PROFILE\n2. DECISION-MAKER INTELLIGENCE\n3. COMPETITIVE INTELLIGENCE\n4. HGI WIN STRATEGY\n5. RED FLAGS\n6. 48-HOUR ACTION PLAN\n7. RELATIONSHIP GAP ANALYSIS`,
        'You are HGI senior capture intelligence analyst. Be specific and actionable.'
      );
      return { title, agency, research };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-mcp-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'endpoint', endpoint: '/api/mcp' })}\n\n`);
    const interval = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => clearInterval(interval));
    return;
  }

  if (req.method === 'POST') {
    const { method, params, id } = req.body || {};

    if (method === 'initialize') {
      return res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'HGI Capture System', version: '1.0.0' } } });
    }
    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      try {
        const result = await handleTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
      } catch (e) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } });
      }
    }

    if (req.body?.tool) {
      try {
        const result = await handleTool(req.body.tool, req.body.input || {});
        return res.json({ success: true, result });
      } catch (e) {
        return res.json({ success: false, error: e.message });
      }
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}