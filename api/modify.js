// api/modify.js — HGI Self-Modification Engine
// Accepts a natural language instruction, reads current codebase,
// generates the modification, and pushes directly to GitHub
// Vercel auto-deploys on every push — changes are live in ~60 seconds

export const config = { maxDuration: 300 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'chrisoprg-dev';
const REPO_NAME = 'hgi-capture-system';
const BRANCH = 'main';

const githubHeaders = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

// Fetch a file from GitHub
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

// Push a file to GitHub
const pushFile = async (path, content, sha, message) => {
  const r = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      headers: githubHeaders,
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha,
        branch: BRANCH,
      }),
    }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`GitHub push failed: ${err}`);
  }
  return r.json();
};

// Ask Claude to make the modification (full file approach)
const claudeModify = async (instruction, currentCode, filename) => {
  const prompt = `You are the AI engine for the HGI AI Capture System. You have been given an instruction to modify the system.

INSTRUCTION FROM CHRISTOPHER ONEY (President, HGI Global):
${instruction}

CURRENT FILE: ${filename}
CURRENT CODE:
${currentCode.slice(0, 80000)}

Your job:
1. Understand exactly what Christopher wants
2. Make ONLY the changes necessary to fulfill the instruction
3. Preserve all existing functionality
4. Return the COMPLETE modified file — every line, not just the changes
5. Do not add markdown, backticks, or any explanation — return ONLY the raw code

CRITICAL RULES:
- Never remove existing features
- Never break existing functionality  
- Match the existing code style exactly
- If the instruction is ambiguous, make the most reasonable interpretation
- Return the complete file ready to deploy`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
};

// Ask Claude for surgical string replacement (large file approach)
const claudeSurgicalModify = async (instruction, currentCode, filename) => {
  const prompt = `You are the AI engine for the HGI AI Capture System. You have been given an instruction to modify the system.

INSTRUCTION FROM CHRISTOPHER ONEY (President, HGI Global):
${instruction}

CURRENT FILE: ${filename}
CURRENT CODE:
${currentCode.slice(0, 80000)}

This file is large (>50KB). You must use a surgical string replacement approach.

Your job:
1. Understand exactly what Christopher wants
2. Identify the EXACT string to find and replace
3. Return ONLY a JSON object with two fields: "find" and "replace"
4. The "find" string must match EXACTLY what exists in the file
5. The "replace" string should be the exact replacement

Example response format:
{"find": "exact string to find", "replace": "exact string to replace it with"}

CRITICAL RULES:
- Return ONLY valid JSON - no markdown, backticks, or explanation
- The "find" string must be an exact match from the existing code
- Never remove existing features or break functionality
- Make the smallest possible change to fulfill the instruction`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  let text = data.content[0].text;
  
  // More aggressive cleaning before JSON.parse
  text = text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
  
  return JSON.parse(text);
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!ANTHROPIC_KEY || !GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const { instruction, filename = 'index.html' } = req.body || {};

  if (!instruction) {
    return res.status(400).json({ error: 'instruction required' });
  }

  try {
    // Step 1: Read current file from GitHub
    console.log(`Reading ${filename} from GitHub...`);
    const file = await getFile(filename);
    if (!file) {
      return res.status(404).json({ error: `File not found: ${filename}` });
    }

    const fileSizeKB = Buffer.byteLength(file.content, 'utf8') / 1024;
    console.log(`File size: ${fileSizeKB.toFixed(2)}KB`);

    let modifiedContent;

    if (fileSizeKB > 50) {
      // Large file: Use surgical string replacement
      console.log(`Using surgical string replacement for large file...`);
      const replacement = await claudeSurgicalModify(instruction, file.content, filename);
      
      if (!replacement.find || !replacement.replace) {
        throw new Error('Claude did not return valid find/replace JSON');
      }

      // Perform the string replacement
      if (!file.content.includes(replacement.find)) {
        throw new Error('Find string not found in file content');
      }

      modifiedContent = file.content.replace(replacement.find, replacement.replace);

      if (modifiedContent === file.content) {
        throw new Error('No changes were made - find and replace strings may be identical');
      }

    } else {
      // Small file: Use full file approach
      console.log(`Using full file approach for small file...`);
      modifiedContent = await claudeModify(instruction, file.content, filename);
    }

    // Step 3: Push modified file back to GitHub
    console.log(`Pushing modified ${filename} to GitHub...`);
    const commitMessage = `AI modification: ${instruction.slice(0, 72)}`;
    await pushFile(filename, modifiedContent, file.sha, commitMessage);

    return res.status(200).json({
      success: true,
      message: `Successfully modified ${filename}. Vercel is deploying — live in ~60 seconds.`,
      instruction,
      filename,
      commit_message: commitMessage,
      approach: fileSizeKB > 50 ? 'surgical' : 'full-file',
      file_size_kb: Math.round(fileSizeKB * 100) / 100,
    });

  } catch (e) {
    console.error('Modification error:', e);
    return res.status(500).json({
      error: e.message,
      instruction,
      filename,
    });
  }
}