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
  const existing = await getFile(path);
  const body = {
    message: `Add ${path}`,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: BRANCH,
  };
  if (existing) body.sha = existing.sha;
  
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
    const indexFile = await getFile('index.html')
