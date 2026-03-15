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

const extractDetailsFromText = (text) => {
    let agency = '';
    let deadline = '';
    let value = '';
    
    // Extract agency - look for patterns like "Agency:" or "Department:"
    const agencyMatch = text.match(/(?:agency|department|entity|organization):\s*([^\n\r]+)/i);
    if (agencyMatch) {
        agency = agencyMatch[1].trim();
    }
    
    // Extract deadline - look for date patterns
    const deadlineMatch = text.match(/(?:due|deadline|submission|closing)(?:\s+date)?:\s*([^\n\r]+)/i) ||
                         text.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},\s+\d{4})/);
    if (deadlineMatch) {
        deadline = deadlineMatch[1].trim();
    }
    
    // Extract value - look for dollar amounts
    const valueMatch = text.match(/\$[\d,]+(?:\.\d{2})?/g);
    if (valueMatch && valueMatch.length > 0) {
        value = valueMatch[valueMatch.length - 1]; // Take the last/largest value found
    }
    
    return { agency, deadline, value };
};

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 300,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 120,
    requestHandler: async ({ page, request, log }) => {
        if (request.label === 'LOGIN') {
            const batch = await Actor.getValue('batch') || 0;
            log.info(`Starting batch ${batch}`);
            
            // Login on the same page
            await page.fill('input[name="username"]', CB_USERNAME);
            await page.fill('input[type="password"]', CB_PASSWORD);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000);
            
            log.info('Login completed');
            
            // Inject auth cookies after login and before any page.goto calls
            await page.context().addCookies([
                {
                    name: 'centralbidding[username]',
                    value: 'CAJXPGRVBBhWd34lEgQHEiMA',
                    domain: '.centralauctionhouse.com',
                    path: '/'
                },
                {
                    name: 'centralbidding[userid]',
                    value: 'Dn1STGUtAGIFUA%3D%3D',
                    domain: '.centralauctionhouse.com',
                    path: '/'
                },
                {
                    name: 'centralbidding[password]',
                    value: 'Xn0EEWN%2FBmkBX3NWFncAMCx2MUcFNCJuBiYBT1ZTDmNvF3dmRGklW3EMHkEMO2BzUiVfABthIntGBDEAXClRVg%3D%3D',
                    domain: '.centralauctionhouse.com',
                    path: '/'
                },
                {
                    name: 'centralbidding[lastvisit]',
                    value: '2026-03-14%2020%3A23%3A18',
                    domain: '.centralauctionhouse.com',
                    path: '/'
                },
                {
                    name: 'centralbidding[lastactivity]',
                    value: '2026-03-14%2020%3A27%3A13',
                    domain: '.centralauctionhouse.com',
                    path: '/'
                }
            ]);
            
            log.info('Injected auth cookies');
            
            // Navigate to the Louisiana page
            await page.goto('https://www.centralauctionhouse.com/rfpc1-Louisiana.html');
            await page.waitForTimeout(3000);
            
            // Get all category links
            const categoryLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href*="/Category/"]'));
                return links.map(link => link.href).filter((href, index, arr) => arr.indexOf(href) === index);
            });
            
            log.info(`Found ${categoryLinks.length} category links`);
            
            // Take only categories from index (batch*20) to ((batch+1)*20)
            const startIndex = batch * 20;
            const endIndex = (batch + 1) * 20;
            const batchCategories = categoryLinks.slice(startIndex, endIndex);
            
            log.info(`Processing categories ${startIndex} to ${endIndex - 1} (${batchCategories.length} categories)`);
            
            // For each category
            for (const categoryUrl of batchCategories) {
                log.info(`Processing category: ${categoryUrl}`);
                
                try {
                    // Navigate to category with page.goto
                    await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await page.waitForTimeout(2000);
                    
                    // Get all rfp links ending in .html
                    const bidLinks = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(link => link.href)
                                   .filter(href => href && href.includes('centralauctionhouse.com/rfp'))
                                   .filter(href => href.endsWith('.html') && /\/rfp\d+/.test(href))
                                   .filter((href, index, arr) => arr.indexOf(href) === index);
                    });
                    
                    log.info(`Found ${bidLinks.length} bid links in category`);
                    
                    // Take first 2
                    const limitedBidLinks = bidLinks.slice(0, 2);
                    
                    // Extract agency name from category URL
                    const agencyMatch = categoryUrl.match(/\/Category\/([^\/]+)/);
                    const categoryAgency = agencyMatch ? agencyMatch[1] : '';
                    
                    // For each bid link
                    for (const bidUrl of limitedBidLinks) {
                        log.info(`Processing bid: ${bidUrl}`);
                        
                        try {
                            // Navigate to bid with page.goto
                            await page.goto(bidUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
                            await page.waitForTimeout(1000);
                            
                            // DIAGNOSTIC: Log page details
                            const currentUrl = page.url();
                            log.info(`Full page URL after loading: ${currentUrl}`);
                            
                            const fullPageText = await page.evaluate(() => document.body.innerText);
                            const first500Chars = fullPageText.substring(0, 500);
                            log.info(`First 500 characters of page text: ${first500Chars}`);
                            
                            const contains99 = fullPageText.includes('99.99');
                            const containsPlaceBid = fullPageText.includes('Place a Bid');
                            const containsDownload = fullPageText.includes('Download');
                            log.info(`Page contains "99.99": ${contains99}, "Place a Bid": ${containsPlaceBid}, "Download": ${containsDownload}`);
                            
                            // Extract title from h1/h2
                            let title = '';
                            try {
                                title = await page.evaluate(() => {
                                    const h1 = document.querySelector('h1');
                                    if (h1 && h1.innerText.trim()) {
                                        return h1.innerText.trim();
                                    }
                                    const h2 = document.querySelector('h2');
                                    if (h2 && h2.innerText.trim()) {
                                        return h2.innerText.trim();
                                    }
                                    return '';
                                });
                            } catch (error) {
                                log.info(`Could not extract title from page elements: ${error.message}`);
                            }
                            
                            // Fall back to URL slug if no title found
                            if (!title) {
                                const urlMatch = bidUrl.match(/\/rfp\d+-([^\/]+)/);
                                if (urlMatch && urlMatch[1]) {
                                    title = urlMatch[1]
                                        .replace(/\.html$/, '')
                                        .replace(/-/g, ' ')
                                        .split(' ')
                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                        .join(' ');
                                }
                            }
                            
                            if (!title) {
                                log.info(`Could not extract title from URL or page: ${bidUrl}`);
                                continue;
                            }
                            
                            // Check isRelevant against full text
                            if (!isRelevant(title, fullPageText)) {
                                log.info(`Not relevant: ${title}`);
                                continue;
                            }
                            
                            log.info(`RELEVANT: ${title}`);
                            
                            // Extract agency/deadline/value
                            const extractedDetails = extractDetailsFromText(fullPageText);
                            
                            const opportunity = {
                                title: title,
                                agency: extractedDetails.agency || categoryAgency,
                                source_url: bidUrl,
                                state: 'LA',
                                vertical: 'disaster',
                                source: 'Central Bidding',
                                deadline: extractedDetails.deadline,
                                value: extractedDetails.value
                            };
                            
                            // POST to intake URL
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
                            
                            // Call Actor.pushData
                            await Actor.pushData(opportunity);
                            
                        } catch (error) {
                            log.error(`Error processing bid ${bidUrl}: ${error.message}`);
                        }
                    }
                    
                } catch (error) {
                    log.error(`Error processing category ${categoryUrl}: ${error.message}`);
                }
            }
            
            // Save next batch to key-value store
            await Actor.setValue('batch', (batch + 1) % 25);
            
            log.info(`Completed batch ${batch}. Next batch: ${(batch + 1) % 25}`);
        }
    }
});

await crawler.run([{ url: 'https://www.centralauctionhouse.com/SignIn', label: 'LOGIN' }]);

await Actor.exit();