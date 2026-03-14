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

// Global variable to store original content for restoration
let lastGoodVersion = {};

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

// Check for broken patterns after surgical replacement
const checkForBrokenPatterns = (content) => {
  const brokenPatterns = [
    /const\s+\/\//,
    /var\s+\/\//,
    /let\s+\/\//
  ];
  
  for (const pattern of brokenPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
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
const claudeSurgicalModify = async (instruction, currentCode, filename, retryCount = 0) => {
  const searchScope = retryCount === 0 ? 'exact match' : 'broader context match';
  const prompt = `You are the AI engine for the HGI AI Capture System. You must return ONLY valid JSON with no additional text.

INSTRUCTION: ${instruction}
FILE: ${filename}
CODE: ${currentCode.slice(0, 80000)}

Return ONLY this JSON format with no markdown, no backticks, no explanation:
{"find": "exact string from code", "replace": "replacement string"}

CRITICAL REQUIREMENTS:
- Response must be pure JSON only
- "find" must be an ${searchScope} from the existing code
- Make minimal changes to fulfill the instruction
- Never break existing functionality
- Return ONLY the JSON object`;

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
  
  // Aggressively clean response
  text = text.replace(/```[a-z]*\n?/gi, "")
             .replace(/```/g, "")
             .replace(/^[^{]*/, "")
             .replace(/[^}]*$/, "")
             .trim();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Claude response as JSON. Response: "${text}". Parse error: ${e.message}`);
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  if (!ANTHROPIC_KEY || !GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Server configuration error: Missing required API keys' });
  }

  const { instruction, filename = 'index.html' } = req.body || {};

  if (!instruction) {
    return res.status(400).json({ error: 'Bad request: instruction field is required' });
  }

  try {
    // Step 1: Read current file from GitHub
    console.log(`Reading ${filename} from GitHub...`);
    const file = await getFile(filename);
    if (!file) {
      return res.status(404).json({ error: `File not found: ${filename}. Check that the file exists in the repository.` });
    }

    // Step 2: Save original content to global variable
    lastGoodVersion[filename] = file.content;

    const fileSizeKB = Buffer.byteLength(file.content, 'utf8') / 1024;
    console.log(`File size: ${fileSizeKB.toFixed(2)}KB`);

    let modifiedContent;
    let approach;

    if (fileSizeKB < 20) {
      // Small file: Use full file approach
      console.log(`Using full file approach for small file (<20KB)...`);
      approach = 'full-file';
      modifiedContent = await claudeModify(instruction, file.content, filename);
    } else if (fileSizeKB <= 100) {
      // Medium file: Use surgical string replacement with retry
      console.log(`Using surgical string replacement for medium file (20-100KB)...`);
      approach = 'surgical';
      
      let replacement;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          replacement = await claudeSurgicalModify(instruction, file.content, filename, retryCount);
          
          if (!replacement.find || replacement.replace === undefined) {
            throw new Error('Claude response missing required find/replace fields');
          }

          // Perform the string replacement
          if (!file.content.includes(replacement.find)) {
            if (retryCount < maxRetries) {
              console.log(`Find string not found, retrying with broader search (attempt ${retryCount + 2})...`);
              retryCount++;
              continue;
            } else {
              throw new Error(`Find string not found in file after ${maxRetries + 1} attempts. Last find string: "${replacement.find.substring(0, 200)}..."`);
            }
          }

          modifiedContent = file.content.replace(replacement.find, replacement.replace);

          if (modifiedContent === file.content) {
            if (retryCount < maxRetries) {
              console.log(`No changes detected, retrying with different approach (attempt ${retryCount + 2})...`);
              retryCount++;
              continue;
            } else {
              throw new Error('No changes were made after multiple attempts. The find and replace strings may be identical or the instruction may not apply to this file.');
            }
          }

          // Check for broken patterns after surgical replacement
          if (checkForBrokenPatterns(modifiedContent)) {
            throw new Error('Surgical replacement created broken code patterns (const //, var //, or let //). This indicates a malformed replacement.');
          }

          break; // Success
          
        } catch (e) {
          if (retryCount >= maxRetries) {
            throw new Error(`Surgical modification failed after ${maxRetries + 1} attempts. Last error: ${e.message}`);
          }
          console.log(`Attempt ${retryCount + 1} failed: ${e.message}`);
          retryCount++;
        }
      }
    } else {
      return res.status(413).json({
        error: `File too large: ${fileSizeKB.toFixed(2)}KB exceeds 100KB limit. Large file modifications are not supported to prevent response truncation.`,
        filename,
        file_size_kb: Math.round(fileSizeKB * 100) / 100
      });
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
      approach,
      file_size_kb: Math.round(fileSizeKB * 100) / 100,
    });

  } catch (e) {
    console.error('Modification error:', e);
    
    let errorMessage = e.message;
    if (e.message.includes('Claude API error')) {
      errorMessage = `AI service error: ${e.message}`;
    } else if (e.message.includes('GitHub push failed')) {
      errorMessage = `GitHub push failed: ${e.message}. Check repository permissions.`;
    } else if (e.message.includes('JSON')) {
      errorMessage = `AI response parsing error: ${e.message}. The AI may have returned malformed data.`;
    }
    
    return res.status(500).json({
      error: errorMessage,
      instruction,
      filename,
      details: e.message !== errorMessage ? e.message : undefined
    });
  }
}