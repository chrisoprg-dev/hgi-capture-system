import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const CB_USERNAME = process.env.CB_USERNAME || 'HGIGLOBAL';
const CB_PASSWORD = process.env.CB_PASSWORD || 'Whatever1340!';

const HGI_KEYWORDS = [
    'grant management', 'program management', 'disaster recovery', 'FEMA', 'CDBG', 
    'public assistance', 'claims administration', 'TPA', 'housing', 'workforce', 
    'property tax', 'appeals', 'emergency management', 'hazard mitigation', 
    'insurance', 'flood', 'hurricane', 'recovery', 'consulting', 'professional services',
    'administrative services', 'program administration'
];

const isRelevant = (title, description) => {
    const text = `${title} ${description}`.toLowerCase();
    return HGI_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
};

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 300,
    requestHandlerTimeoutSecs: 60,
    requestHandler: async ({ page, request, log, addRequests, pushData }) => {
        if (request.label === 'LOGIN') {
            await page.fill('input[name="username"]', CB_USERNAME);
            await page.fill('input[type="password"]', CB_PASSWORD);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000);
            
            await page.goto('https://www.centralauctionhouse.com/rfpc1-Louisiana.html');
            await page.waitForTimeout(3000);
            
            const categoryLinks = await page.$$eval('a[href*="/Category/"]', links => 
                links.map(link => link.href).filter((href, index, arr) => arr.indexOf(href) === index)
            );
            
            log.info(`Found ${categoryLinks.length} category links`);
            const firstThirty = categoryLinks.slice(0, 30);
            await addRequests(firstThirty.map(url => ({ url, label: 'CATEGORY' })));
            
        } else if (request.label === 'CATEGORY') {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
            
            const bidLinks = await page.$$eval('a', links => 
                links.map(link => link.href)
                     .filter(href => href && href.includes('centralauctionhouse.com/rfp'))
                     .filter((href, index, arr) => arr.indexOf(href) === index)
            );
            
            log.info(`Found ${bidLinks.length} bid links in category`);
            if (bidLinks.length > 0) {
                log.info(`First 5 hrefs: ${bidLinks.slice(0, 5).join(', ')}`);
            }
            await addRequests(bidLinks.map(url => ({ url, label: 'BID' })));
            
        } else if (request.label === 'BID') {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
            
            const title = await page.evaluate(() => {
                return document.querySelector('h1')?.innerText || 
                       document.querySelector('h2')?.innerText || 
                       document.title || '';
            });
            
            const bodyText = await page.evaluate(() => document.body.innerText);
            
            const agencyMatch = bodyText.match(/(Entity|Agency)[:\s]+([^\n\r]+)/i);
            const agency = agencyMatch ? agencyMatch[2].trim() : '';
            
            const deadlineMatch = bodyText.match(/(Due Date|Deadline)[:\s]+([^\n\r]+)/i);
            const deadline = deadlineMatch ? deadlineMatch[2].trim() : '';
            
            const description = bodyText.slice(0, 2000);
            
            if (!isRelevant(title, description)) {
                log.info(`Not relevant: ${title}`);
                return;
            }
            
            log.info(`RELEVANT: ${title}`);
            
            const opportunity = {
                title: title,
                agency: agency,
                deadline: deadline,
                description: description,
                url: request.url
            };
            
            await pushData(opportunity);
            
            try {
                await fetch(INTAKE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-intake-secret': INTAKE_SECRET
                    },
                    body: JSON.stringify(opportunity)
                });
            } catch (error) {
                log.error(`Failed to post to intake: ${error.message}`);
            }
        }
    }
});

await crawler.run([{ url: 'https://www.centralauctionhouse.com/SignIn', label: 'LOGIN' }]);

await Actor.exit();