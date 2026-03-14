const { createClient } = require('@supabase/supabase-js');
const { Anthropic } = require('@anthropic-ai/sdk');

// Initialize clients
const sb = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const REPO_OWNER = 'chrisoprg-dev';
const REPO_NAME = 'hgi-capture-system';

// GitHub helper functions
async function getFile(path, ref = 'main') {
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${ref}`,
    {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha
  };
}

async function pushFile(path, content, message) {
  try {
    const { sha } = await getFile(path);
    
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          content: Buffer.from(content).toString('base64'),
          sha
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error.message.includes('404')) {
      const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            content: Buffer.from(content).toString('base64')
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      return await response.json();
    }
    throw error;
  }
}

// Claude helper function
async function callClaude(prompt, systemPrompt = '') {
  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return message.content[0].text;
}

// Tool definitions
const TOOLS = [
  {
    name: 'modify_system',
    description: 'Modify system files directly through GitHub API',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to modify' },
        content: { type: 'string', description: 'New file content' },
        message: { type: 'string', description: 'Commit message' }
      },
      required: ['path', 'content', 'message']
    }
  },
  {
    name: 'query_pipeline',
    description: 'Query the sales pipeline data',
    inputSchema: {
      type: 'object',
      properties: {
        filters: { type: 'object', description: 'Filters to apply' },
        limit: { type: 'number', description: 'Number of records to return', default: 10 }
      }
    }
  },
  {
    name: 'query_knowledge_base',
    description: 'Search and query the knowledge base',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Knowledge base category' },
        limit: { type: 'number', description: 'Number of results to return', default: 5 }
      },
      required: ['query']
    }
  },
  {
    name: 'generate_proposal_section',
    description: 'Generate a specific section of a proposal using AI',
    inputSchema: {
      type: 'object',
      properties: {
        section_type: { type: 'string', description: 'Type of section to generate' },
        opportunity_data: { type: 'object', description: 'Opportunity information' },
        requirements: { type: 'string', description: 'Specific requirements or context' }
      },
      required: ['section_type', 'opportunity_data']
    }
  },
  {
    name: 'score_opportunity',
    description: 'Score an opportunity using AI analysis',
    inputSchema: {
      type: 'object',
      properties: {
        opportunity_id: { type: 'string', description: 'Opportunity ID to score' },
        criteria: { type: 'array', items: { type: 'string' }, description: 'Scoring criteria' }
      },
      required: ['opportunity_id']
    }
  },
  {
    name: 'add_to_pipeline',
    description: 'Add a new opportunity to the sales pipeline',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name' },
        contact_name: { type: 'string', description: 'Contact person name' },
        email: { type: 'string', description: 'Contact email' },
        opportunity_value: { type: 'number', description: 'Estimated value' },
        stage: { type: 'string', description: 'Pipeline stage' },
        description: { type: 'string', description: 'Opportunity description' },
        source: { type: 'string', description: 'Lead source' }
      },
      required: ['company', 'contact_name', 'email', 'opportunity_value', 'stage']
    }
  },
  {
    name: 'get_system_status',
    description: 'Get current system status and health metrics',
    inputSchema: {
      type: 'object',
      properties: {
        include_metrics: { type: 'boolean', description: 'Include detailed metrics', default: true }
      }
    }
  },
  {
    name: 'query_database',
    description: 'Execute a database query',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        select: { type: 'string', description: 'Columns to select' },
        filters: { type: 'object', description: 'Query filters' },
        limit: { type: 'number', description: 'Number of records to return', default: 10 }
      },
      required: ['table']
    }
  },
  {
    name: 'delete_records',
    description: 'Delete records from database',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        filters: { type: 'object', description: 'Conditions for deletion' }
      },
      required: ['table', 'filters']
    }
  },
  {
    name: 'generate_weekly_digest',
    description: 'Generate a weekly digest of pipeline activities',
    inputSchema: {
      type: 'object',
      properties: {
        week_offset: { type: 'number', description: 'Weeks back from current (0 = this week)', default: 0 },
        include_metrics: { type: 'boolean', description: 'Include performance metrics', default: true }
      }
    }
  },
  {
    name: 'research_opportunity',
    description: 'Research a company/opportunity using AI and external data',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name to research' },
        focus_areas: { type: 'array', items: { type: 'string' }, description: 'Specific areas to focus research on' },
        opportunity_context: { type: 'string', description: 'Context about the opportunity' }
      },
      required: ['company']
    }
  },
  {
    name: 'restore_file_from_git',
    description: 'Restore a file to its last version before AI modifications',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to restore' },
        commit_message: { type: 'string', description: 'Custom commit message for restoration', default: 'Restore file from git history' }
      },
      required: ['file_path']
    }
  }
];

// Tool handlers
async function handleTool(name, args) {
  try {
    switch (name) {
      case 'modify_system':
        return await handleModifySystem(args);
      case 'query_pipeline':
        return await handleQueryPipeline(args);
      case 'query_knowledge_base':
        return await handleQueryKnowledgeBase(args);
      case 'generate_proposal_section':
        return await handleGenerateProposalSection(args);
      case 'score_opportunity':
        return await handleScoreOpportunity(args);
      case 'add_to_pipeline':
        return await handleAddToPipeline(args);
      case 'get_system_status':
        return await handleGetSystemStatus(args);
      case 'query_database':
        return await handleQueryDatabase(args);
      case 'delete_records':
        return await handleDeleteRecords(args);
      case 'generate_weekly_digest':
        return await handleGenerateWeeklyDigest(args);
      case 'research_opportunity':
        return await handleResearchOpportunity(args);
      case 'restore_file_from_git':
        return await handleRestoreFileFromGit(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function handleModifySystem(args) {
  const { path, content, message } = args;
  
  const result = await pushFile(path, content, message);
  
  return {
    success: true,
    message: `File ${path} modified successfully`,
    commit_sha: result.commit.sha,
    timestamp: new Date().toISOString()
  };
}

async function handleQueryPipeline(args) {
  const { filters = {}, limit = 10 } = args;
  
  let query = sb().from('opportunities').select('*');
  
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  
  const { data, error } = await query.limit(limit);
  
  if (error) throw error;
  
  return {
    success: true,
    data,
    count: data.length,
    timestamp: new Date().toISOString()
  };
}

async function handleQueryKnowledgeBase(args) {
  const { query, category, limit = 5 } = args;
  
  let dbQuery = sb().from('knowledge_base').select('*');
  
  if (category) {
    dbQuery = dbQuery.eq('category', category);
  }
  
  if (query) {
    dbQuery = dbQuery.textSearch('content', query);
  }
  
  const { data, error } = await dbQuery.limit(limit);
  
  if (error) throw error;
  
  return {
    success: true,
    data,
    count: data.length,
    query,
    category,
    timestamp: new Date().toISOString()
  };
}

async function handleGenerateProposalSection(args) {
  const { section_type, opportunity_data, requirements = '' } = args;
  
  const systemPrompt = `You are an expert proposal writer specializing in ${section_type} sections. Create professional, compelling content that addresses the client's needs while highlighting our capabilities.`;
  
  const prompt = `Generate a ${section_type} section for a proposal with the following opportunity data:
${JSON.stringify(opportunity_data, null, 2)}

Requirements: ${requirements}

Please provide a well-structured, professional section that would be suitable for inclusion in a business proposal.`;
  
  const content = await callClaude(prompt, systemPrompt);
  
  return {
    success: true,
    section_type,
    content,
    opportunity_id: opportunity_data.id,
    timestamp: new Date().toISOString()
  };
}

async function handleScoreOpportunity(args) {
  const { opportunity_id, criteria = [] } = args;
  
  const { data: opportunity, error } = await sb()
    .from('opportunities')
    .select('*')
    .eq('id', opportunity_id)
    .single();
  
  if (error) throw error;
  
  const defaultCriteria = [
    'Budget alignment',
    'Decision timeline',
    'Stakeholder engagement',
    'Technical fit',
    'Competitive position'
  ];
  
  const scoringCriteria = criteria.length > 0 ? criteria : defaultCriteria;
  
  const prompt = `Score this sales opportunity on a scale of 1-10 for each criterion and provide an overall score and analysis:

Opportunity: ${JSON.stringify(opportunity, null, 2)}

Criteria to evaluate:
${scoringCriteria.map(c => `- ${c}`).join('\n')}

Provide your response in JSON format with individual scores, overall score (1-10), confidence level (1-10), and detailed analysis.`;
  
  const response = await callClaude(prompt, 'You are an expert sales analyst. Provide objective, data-driven opportunity scoring.');
  
  const scoring = JSON.parse(response);
  
  await sb()
    .from('opportunity_scores')
    .upsert({
      opportunity_id,
      scores: scoring,
      scored_at: new Date().toISOString()
    });
  
  return {
    success: true,
    opportunity_id,
    scoring,
    timestamp: new Date().toISOString()
  };
}

async function handleAddToPipeline(args) {
  const {
    company,
    contact_name,
    email,
    opportunity_value,
    stage,
    description = '',
    source = 'MCP'
  } = args;
  
  const opportunity = {
    company,
    contact_name,
    email,
    opportunity_value,
    stage,
    description,
    source,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const { data, error } = await sb()
    .from('opportunities')
    .insert(opportunity)
    .select()
    .single();
  
  if (error) throw error;
  
  return {
    success: true,
    message: 'Opportunity added to pipeline',
    opportunity: data,
    timestamp: new Date().toISOString()
  };
}

async function handleGetSystemStatus(args) {
  const { include_metrics = true } = args;
  
  const status = {
    system: 'HGI Capture System',
    status: 'operational',
    timestamp: new Date().toISOString()
  };
  
  if (include_metrics) {
    const { count: opportunityCount } = await sb()
      .from('opportunities')
      .select('*', { count: 'exact', head: true });
    
    const { count: knowledgeCount } = await sb()
      .from('knowledge_base')
      .select('*', { count: 'exact', head: true });
    
    const { data: recentActivity } = await sb()
      .from('opportunities')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5);
    
    status.metrics = {
      total_opportunities: opportunityCount,
      knowledge_base_entries: knowledgeCount,
      recent_activity: recentActivity
    };
  }
  
  return status;
}

async function handleQueryDatabase(args) {
  const { table, select = '*', filters = {}, limit = 10 } = args;
  
  let query = sb().from(table).select(select);
  
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  
  const { data, error } = await query.limit(limit);
  
  if (error) throw error;
  
  return {
    success: true,
    table,
    data,
    count: data.length,
    timestamp: new Date().toISOString()
  };
}

async function handleDeleteRecords(args) {
  const { table, filters } = args;
  
  let query = sb().from(table).delete();
  
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  
  const { data, error } = await query.select();
  
  if (error) throw error;
  
  return {
    success: true,
    message: `Deleted ${data.length} records from ${table}`,
    deleted_records: data,
    timestamp: new Date().toISOString()
  };
}

async function handleGenerateWeeklyDigest(args) {
  const { week_offset = 0, include_metrics = true } = args;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (7 * week_offset) - startDate.getDay());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  
  const { data: weeklyActivity } = await sb()
    .from('opportunities')
    .select('*')
    .gte('updated_at', startDate.toISOString())
    .lte('updated_at', endDate.toISOString());
  
  let digest = {
    week_period: `${startDate.toDateString()} - ${endDate.toDateString()}`,
    activities: weeklyActivity,
    summary: {
      total_activities: weeklyActivity.length
    }
  };
  
  if (include_metrics) {
    const stages = {};
    const values = [];
    
    weeklyActivity.forEach(opp => {
      stages[opp.stage] = (stages[opp.stage] || 0) + 1;
      if (opp.opportunity_value) values.push(opp.opportunity_value);
    });
    
    digest.metrics = {
      stage_breakdown: stages,
      total_value: values.reduce((sum, val) => sum + val, 0),
      average_value: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0
    };
  }
  
  const prompt = `Generate a professional weekly digest report based on this sales pipeline data:
${JSON.stringify(digest, null, 2)}

Include key insights, trends, and recommendations.`;
  
  const narrative = await callClaude(prompt, 'You are a sales analytics expert. Create insightful, actionable reports.');
  
  digest.narrative = narrative;
  digest.timestamp = new Date().toISOString();
  
  return digest;
}

async function handleResearchOpportunity(args) {
  const { company, focus_areas = [], opportunity_context = '' } = args;
  
  const defaultFocusAreas = [
    'Company background and size',
    'Recent news and developments', 
    'Technology stack and needs',
    'Key decision makers',
    'Competitive landscape'
  ];
  
  const researchAreas = focus_areas.length > 0 ? focus_areas : defaultFocusAreas;
  
  const prompt = `Research the company "${company}" and provide detailed insights for the following areas:
${researchAreas.map(area => `- ${area}`).join('\n')}

Context: ${opportunity_context}

Please provide comprehensive research that would be valuable for sales engagement. Focus on actionable insights and potential conversation starters.`;
  
  const research = await callClaude(prompt, 'You are an expert business researcher and sales intelligence analyst. Provide detailed, actionable research insights.');
  
  const researchRecord = {
    company,
    research_content: research,
    focus_areas: researchAreas,
    context: opportunity_context,
    researched_at: new Date().toISOString()
  };
  
  await sb().from('company_research').upsert(researchRecord);
  
  return {
    success: true,
    company,
    research,
    focus_areas: researchAreas,
    timestamp: new Date().toISOString()
  };
}

async function handleRestoreFileFromGit(args) {
  const { file_path, commit_message = 'Restore file from git history' } = args;
  
  // Get commit history for the file
  const commitsResponse = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?path=${file_path}&per_page=100`,
    {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );
  
  if (!commitsResponse.ok) {
    throw new Error(`Failed to fetch commits: ${commitsResponse.status}`);
  }
  
  const commits = await commitsResponse.json();
  
  // Find the most recent commit that doesn't start with "MCP:" or "AI modification:"
  const targetCommit = commits.find(commit => {
    const message = commit.commit.message;
    return !message.startsWith('MCP:') && !message.startsWith('AI modification:');
  });
  
  if (!targetCommit) {
    throw new Error('No suitable commit found for restoration');
  }
  
  // Get the file content from that commit
  const { content: restoredContent } = await getFile(file_path, targetCommit.sha);
  
  // Push the restored content
  const result = await pushFile(file_path, restoredContent, commit_message);
  
  return {
    success: true,
    message: `File ${file_path} restored from commit ${targetCommit.sha.substring(0, 8)}`,
    restored_from: {
      commit_sha: targetCommit.sha,
      commit_message: targetCommit.commit.message,
      commit_date: targetCommit.commit.committer.date
    },
    new_commit_sha: result.commit.sha,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  TOOLS,
  handleTool
};