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

let firstBidProcessed = false;

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
            const limitedBidLinks = bidLinks.slice(0, 2); // Limit to 2 bid pages per category
            
            // Extract agency name from category URL
            const categoryUrl = request.url;
            const agencyMatch = categoryUrl.match(/\/Category\/([^\/]+)/);
            const categoryAgency = agencyMatch ? agencyMatch[1] : '';
            
            for (let i = 0; i < limitedBidLinks.length; i++) {
                const bidUrl = limitedBidLinks[i];
                log.info(`Processing bid ${i + 1}/${limitedBidLinks.length}: ${bidUrl}`);
                
                try {
                    // Add cookies before each individual bid page visit
                    const cookies = await Actor.getValue('cookies');
                    if (cookies) {
                        await page.context().addCookies(cookies);
                    }
                    
                    // 1) Load each bid page
                    await page.goto(bidUrl, {waitUntil: 'domcontentloaded', timeout: 10000});
                    
                    // Screenshot and debug for first bid only
                    if (!firstBidProcessed) {
                        // Log the full page URL
                        log.info(`Full page URL after navigation: ${page.url()}`);
                        
                        // Get page text and log first 500 characters
                        const pageText = await page.evaluate(() => document.body.innerText);
                        log.info(`First 500 characters of page text: ${pageText.substring(0, 500)}`);
                        
                        // Take screenshot and save to key-value store
                        await page.screenshot({path: 'bid-page.png'});
                        await Actor.setValue('bid-screenshot', await page.screenshot(), {contentType: 'image/png'});
                        log.info('Screenshot saved to key-value store');
                        
                        firstBidProcessed = true;
                        break; // Break out of the loop after the first bid
                    }
                    
                    // 2) Extract the full page text
                    const fullPageText = await page.evaluate(() => document.body.innerText);
                    
                    // 3) Extract title from h1 or h2 first, fall back to URL slug
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
                    
                    // 4) Check isRelevant against BOTH the title AND the full page text
                    if (!isRelevant(title, fullPageText)) {
                        log.info(`Not relevant: ${title}`);
                        continue;
                    }
                    
                    log.info(`RELEVANT: ${title}`);
                    
                    // 5) If relevant, extract agency/deadline/value from the page text
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