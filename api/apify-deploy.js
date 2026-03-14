import { chromium } from 'playwright';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apifyToken = 'apify_api_CFeI1ZehZ3HHClJFJfsVypn0KMPJSQ1b7nmO';
  const actorId = 'Qfb4C0KiRbnsuv6jo';

  const mainJsContent = `import { chromium } from 'playwright';

async function scrapeOpportunities() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // Login
        await page.goto('https://centralauctionhouse.com/login');
        await page.fill('input[name="username"]', 'HGIGLOBAL');
        await page.fill('input[name="password"]', 'Whatever1340!');
        await page.click('button[type="submit"]');
        await page.waitForNavigation();

        // Navigate to Louisiana listings
        await page.goto('https://centralauctionhouse.com/louisiana');
        
        // Find all RFP links
        const rfpLinks = await page.$$eval('a[href*="/rfp"]', links => 
            links.map(link => link.href).filter(href => /\/rfp\\d+.*\\.html/.test(href))
        );

        console.log(\`Found \${rfpLinks.length} RFP links\`);

        const hgiKeywords = [
            'grant management', 'program management', 'disaster recovery', 'FEMA', 
            'CDBG', 'public assistance', 'claims administration', 'TPA', 'housing', 
            'workforce', 'property tax', 'appeals', 'emergency management'
        ];

        for (const link of rfpLinks) {
            try {
                await page.goto(link);
                
                const title = await page.textContent('h1') || '';
                const description = await page.textContent('body') || '';
                const content = (title + ' ' + description).toLowerCase();
                
                const isRelevant = hgiKeywords.some(keyword => 
                    content.includes(keyword.toLowerCase())
                );

                if (isRelevant) {
                    const opportunityData = {
                        title: title.trim(),
                        description: description.trim(),
                        url: link,
                        source: 'centralauctionhouse.com',
                        matchedKeywords: hgiKeywords.filter(keyword => 
                            content.includes(keyword.toLowerCase())
                        )
                    };

                    // Send to intake system
                    const response = await fetch('https://hgi-capture-system.vercel.app/api/intake', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-intake-secret': 'hgi-intake-2026-secure'
                        },
                        body: JSON.stringify(opportunityData)
                    });

                    if (response.ok) {
                        console.log(\`Successfully sent opportunity: \${title}\`);
                    } else {
                        console.error(\`Failed to send opportunity: \${response.status}\`);
                    }
                }
            } catch (error) {
                console.error(\`Error processing link \${link}:\`, error);
            }
        }
    } finally {
        await browser.close();
    }
}

await scrapeOpportunities();`;

  const sourceCode = {
    "files": {
      "src/main.js": {
        "content": mainJsContent
      }
    }
  };

  try {
    const response = await fetch(`https://api.apify.com/v2/acts/${actorId}/versions/0.0`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apifyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sourceCode)
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