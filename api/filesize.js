const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'chrisoprg-dev';
const GITHUB_REPO = 'hgi-capture-system';
const GITHUB_PATH = 'components';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'hgi-capture-system'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const contents = await response.json();
    
    const files = contents
      .filter(item => item.type === 'file')
      .map(file => ({
        filename: file.name,
        size_bytes: file.size,
        size_kb: Math.round((file.size / 1024) * 100) / 100
      }))
      .sort((a, b) => b.size_bytes - a.size_bytes);

    res.status(200).json(files);
  } catch (error) {
    console.error('Error fetching file sizes:', error);
    res.status(500).json({ error: 'Failed to fetch file sizes' });
  }
}