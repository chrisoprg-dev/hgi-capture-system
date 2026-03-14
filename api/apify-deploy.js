export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apifyToken = 'apify_api_CFeI1ZehZ3HHClJFJfsVypn0KMPJSQ1b7nmO';
  const actorId = 'Qfb4C0KiRbnsuv6jo';

  const mainJsContent = `import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },
    async requestHandler({ page, request, enqueueLinks }) {
        console.log(\`Processing: \${request.url}\`);
        
        if (request.label === 'LOGIN') {
            // Login to centralauctionhouse.com
            await page.fill('input[name="username"]', 'HGIGLOBAL');
            await page.fill('input[name="password"]', 'Whatever1340!');
            await page.click('button[type="submit"]');
            await page.waitForLoadState('networkidle');
            
            // Navigate to Louisiana listings
            await page.goto('https://centralauctionhouse.com/rfpc1-Louisiana.html');
            
            // Find and enqueue RFP links
            await enqueueLinks({
                selector: 'a[href*="/rfp"]',
                globs: ['**/*.html'],
                label: 'BID',
            });
        } else if (request.label === 'BID') {
            // Check if page is relevant
            const title = await page.textContent('h1') || '';
            const bodyText = await page.textContent('body') || '';
            const content = (title + ' ' + bodyText).toLowerCase();
            
            const keywords = [
                'grant management', 'program management', 'disaster recovery', 
                'FEMA', 'CDBG', 'public assistance', 'TPA', 'housing', 
                'workforce', 'property tax', 'emergency management'
            ];
            
            const matchedKeywords = keywords.filter(keyword => 
                content.includes(keyword.toLowerCase())
            );
            
            if (matchedKeywords.length > 0) {
                const opportunityData = {
                    title: title.trim(),
                    description: bodyText.trim(),
                    url: request.url,
                    source: 'centralauctionhouse.com',
                    matchedKeywords: matchedKeywords
                };
                
                // Send to intake system
                try {
                    const response = await page.evaluate(async (data) => {
                        const res = await fetch('https://hgi-capture-system.vercel.app/api/intake', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-intake-secret': 'hgi-intake-2026-secure'
                            },
                            body: JSON.stringify(data)
                        });
                        return { ok: res.ok, status: res.status };
                    }, opportunityData);
                    
                    if (response.ok) {
                        console.log(\`Successfully sent opportunity: \${title}\`);
                    } else {
                        console.error(\`Failed to send opportunity: \${response.status}\`);
                    }
                } catch (error) {
                    console.error('Error sending to intake system:', error);
                }
            }
        }
    },
    failedRequestHandler({ request }) {
        console.error(\`Request \${request.url} failed multiple times\`);
    },
});

// Start with login
await crawler.run(['https://centralauctionhouse.com/login'], { label: 'LOGIN' });

await Actor.exit();`;

  const packageJsonContent = `{
    "name": "hgi-central-bidding-scraper",
    "version": "1.0.0",
    "type": "module",
    "dependencies": {
        "apify": "^3.0.0",
        "crawlee": "^3.0.0",
        "playwright": "^1.40.0"
    },
    "scripts": {
        "start": "node src/main.js"
    }
}`;

  const sourceFiles = [
    {
      name: "src/main.js",
      content: mainJsContent
    },
    {
      name: "package.json", 
      content: packageJsonContent
    }
  ];

  try {
    const response = await fetch(`https://api.apify.com/v2/acts/${actorId}/versions/0/source-files`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apifyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: sourceFiles })
    });

    const result = await response.json();
    
    if (response.ok) {
      return res.status(200).json(result);
    } else {
      return res.status(response.status).json(result);
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}