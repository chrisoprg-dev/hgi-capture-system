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
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 120,
    requestHandler: async ({ page, request, log, addRequests, pushData }) => {
        if (request.label === 'LOGIN') {
            const batch = await Actor.getValue('batch') || 0;
            log.info(`Starting batch ${batch}`);
            
            await page.fill('input[name="username"]', CB_USERNAME);
            await page.fill('input[type="password"]', CB_PASSWORD);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000);
            
            // Store cookies after successful login
            const cookies = await page.context().cookies();
            await Actor.setValue('cookies', cookies);
            log.info('Stored login cookies');
            
            await page.goto('https://www.centralauctionhouse.com/rfpc1-Louisiana.html');
            await page.waitForTimeout(3000);
            
            const categoryLinks = await page.$$eval('a[href*="/Category/"]', links => 
                links.map(link => link.href).filter((href, index, arr) => arr.indexOf(href) === index)
            );
            
            log.info(`Found ${categoryLinks.length} category links`);
            
            const startIndex = batch * 20;
            const endIndex = (batch + 1) * 20;
            const batchCategories = categoryLinks.slice(startIndex, endIndex);
            
            await addRequests(batchCategories.map(url => ({ url, label: 'CATEGORY' })));
            await Actor.setValue('batch', (batch + 1) % 25);
            
        } else if (request.label === 'CATEGORY') {
            // Load cookies at the start of CATEGORY handler
            const cookies = await Actor.getValue('cookies');
            if (cookies) {
                await page.context().addCookies(cookies);
                log.info('Loaded authentication cookies');
            }
            
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
            
            const bidLinks = await page.$$eval('a', links => 
                links.map(link => link.href)
                     .filter(href => href && href.includes('centralauctionhouse.com/rfp'))
                     .filter(href => href.endsWith('.html') && /\/rfp\d+/.test(href))
                     .filter((href, index, arr) => arr.indexOf(href) === index)
            );
            
            log.info(`Found ${bidLinks.length} bid links in category`);
            const limitedBidLinks = bidLinks.slice(0, 3);
            
            // Extract agency name from category URL
            const categoryUrl = request.url;
            const agencyMatch = categoryUrl.match(/\/Category\/([^\/]+)/);
            const agency = agencyMatch ? agencyMatch[1] : '';
            
            for (let i = 0; i < limitedBidLinks.length; i++) {
                const bidUrl = limitedBidLinks[i];
                log.info(`Processing bid ${i + 1}/${limitedBidLinks.length}: ${bidUrl}`);
                
                try {
                    // Add cookies before each individual bid page visit
                    const cookies = await Actor.getValue('cookies');
                    if (cookies) {
                        await page.context().addCookies(cookies);
                    }
                    
                    // Extract title from URL slug
                    const urlMatch = bidUrl.match(/\/rfp\d+-([^\/]+)/);
                    if (!urlMatch || !urlMatch[1]) {
                        log.info(`Could not extract title from URL: ${bidUrl}`);
                        continue;
                    }
                    
                    let title = urlMatch[1]
                        .replace(/\.html$/, '')
                        .replace(/-/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                    
                    if (!isRelevant(title, '')) {
                        log.info(`Not relevant: ${title}`);
                        continue;
                    }
                    
                    log.info(`RELEVANT: ${title}`);
                    
                    const opportunity = {
                        title: title,
                        agency: agency,
                        source_url: bidUrl,
                        state: 'LA',
                        vertical: 'disaster',
                        source: 'Central Bidding'
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
                    
                } catch (error) {
                    log.error(`Error processing bid ${bidUrl}: ${error.message}`);
                }
            }
        }
    }
});

await crawler.run([{ url: 'https://www.centralauctionhouse.com/SignIn', label: 'LOGIN' }]);

await Actor.exit();