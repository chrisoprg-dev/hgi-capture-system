// api/push-components.js
// One-time endpoint to push all remaining component files to GitHub
// Run once then delete

export const config = { maxDuration: 300 };

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'chrisoprg-dev';
const REPO_NAME = 'hgi-capture-system';
const BRANCH = 'main';

const githubHeaders = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

const componentMappings = [
  { name: 'ResearchAnalysis.js', startLine: 885, endLine: 922 },
  { name: 'ProposalEngine.js', startLine: 923, endLine: 1365 },
  { name: 'RecruitingBench.js', startLine: 1366, endLine: 1441 },
  { name: 'WeeklyDigest.js', startLine: 1442, endLine: 1488 },
  { name: 'FinancialPricing.js', startLine: 1489, endLine: 2181 },
  { name: 'Dashboard.js', startLine: 2182, endLine: 2267 },
  { name: 'OpportunityDiscovery.js', startLine: 2268, endLine: 3182 },
  { name: 'App.js', startLine: 3183, endLine: 3792 },
  { name: 'KnowledgeBase.js', startLine: 3200, endLine: 3699 },
];

const getFile = async (path) => {
  const r = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`,
    { headers: githubHeaders }
  );
  if (!r.ok) return null;
  const data = await r.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha
  };
};

const createFile = async (path, content) => {
  const body = {
    message: `Add ${path}`,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: BRANCH,
  };
  
  const r = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    { method: 'PUT', headers: githubHeaders, body: JSON.stringify(body) }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Failed to create ${path}: ${err}`);
  }
  return path;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'Missing GITHUB_TOKEN' });

  try {
    const indexFile = await getFile('index.html');
    if (!indexFile) return res.status(404).json({ error: 'index.html not found' });

    const lines = indexFile.content.split('\n');
    const results = [];

    for (const component of componentMappings) {
      const componentPath = `components/${component.name}`;
      
      // Check if file already exists
      const existing = await getFile(componentPath);
      if (existing) {
        results.push({ file: component.name, status: 'skipped', reason: 'already exists' });
        continue;
      }

      // Extract lines for this component
      const componentLines = lines.slice(component.startLine - 1, component.endLine);
      const componentContent = componentLines.join('\n');

      try {
        await createFile(componentPath, componentContent);
        results.push({ file: component.name, status: 'created', lines: `${component.startLine}-${component.endLine}` });
      } catch (error) {
        results.push({ file: component.name, status: 'error', error: error.message });
      }
    }

    return res.json({ success: true, results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}