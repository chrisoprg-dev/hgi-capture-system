import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const CB_USERNAME = process.env.CB_USERNAME || 'HGIGLOBAL';
const CB_PASSWORD = process.env.CB_PASSWORD || 'Whatever1340!';

const HGI_KEYWORDS = [
    'grant management',
    'program management', 
    'disaster recovery',
    'FEMA',
    'CDBG',
    'public assistance',
    'claims administration',
    'TPA',
    'housing',
    'workforce',
    'property tax',
    'appeals',
    'emergency management',
    'hazard mitigation',
    'insurance',
    'flood',
    'hurricane',
    'recovery',
    'consulting',
    'professional services'
];

const isRelevant = (title, description) => {
    const text = `${title} ${description}`.toLowerCase();
    return HGI_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
};

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 500,
    requestHandlerTimeoutSecs: 90,
    requestHandler: async ({ page, request, enqueueLinks }) => {
        if (request.label === 'LOGIN') {
            await page.fill('input[name="username"]', CB_USERNAME);
            await page.fill('input[type="password"]', CB_PASSWORD);
            await page.click('input[type="submit"]');
            await page.waitForNavigation();
            
            await page.goto('https://www.centralauctionhouse.com/rfpc1-Louisiana.html');
            
            const categoryLinks = await page.$$eval('a[href*="/Category/"]', links => 
                links.map(link => link.href)
            );
            
            for (const link of categoryLinks) {
                await crawler.addRequests([{ url: link, label: 'CATEGORY' }]);
            }
        }
        
        if (request.label === 'CATEGORY') {
            const bidLinks = await page.$$eval('a', links => 
                links.map(link => link.href)
                     .filter(href => href && href.includes('centralauctionhouse.com/rfp') && href.endsWith('.html'))
            );
            
            for (const link of bidLinks) {
                await crawler.addRequests([{ url: link, label: 'BID' }]);
            }
        }
        
        if (request.label === 'BID') {
            const title = await page.$eval('h1, h2', el => el.textContent.trim()).catch(() => '');
            const bodyText = await page.textContent('body');
            
            const agencyMatch = bodyText.match(/Agency[:\s]+([^\n\r]+)/i);
            const deadlineMatch = bodyText.match(/Deadline[:\s]+([^\n\r]+)/i);
            const valueMatch = bodyText.match(/\$[\d,]+/);
            
            const agency = agencyMatch ? agencyMatch[1].trim() : '';
            const deadline = deadlineMatch ? deadlineMatch[1].trim() : '';
            const value = valueMatch ? valueMatch[0] : '';
            
            if (isRelevant(title, bodyText)) {
                const bidData = {
                    title,
                    agency,
                    deadline,
                    value,
                    url: request.url,
                    source: 'Central Bidding'
                };
                
                await Actor.pushData(bidData);
                
                await fetch(INTAKE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-intake-secret': INTAKE_SECRET
                    },
                    body: JSON.stringify(bidData)
                });
            }
        }
    }
});

await crawler.run([{ url: 'https://www.centralauctionhouse.com/SignIn', label: 'LOGIN' }]);

await Actor.exit();