import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const CB_USERNAME = process.env.CB_USERNAME || 'HGIGLOBAL';
const CB_PASSWORD = process.env.CB_PASSWORD || 'Whatever1340!';

const HGI_KEYWORDS = [
    'grant management', 'grants management', 'program management', 'program administration', 
    'disaster recovery', 'FEMA', 'CDBG', 'public assistance', 'claims administration', 
    'third party administrator', 'TPA', 'housing assistance', 'workforce development', 
    'workforce services', 'property tax appeal', 'hazard mitigation', 'HMGP', 'BRIC', 
    'emergency management services', 'recovery program', 'community development block grant', 
    'homeowner assistance', 'flood recovery', 'hurricane recovery', 'case management services', 
    'benefits administration'
];

const isRelevant = (title, description) => {
    const text = `${title} ${description}`.toLowerCase();
    return HGI_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
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
                    
                    // Take first 1
                    const limitedBidLinks = bidLinks.slice(0, 1);
                    
                    // For each bid link
                    for (const bidUrl of limitedBidLinks) {
                        log.info(`Processing bid: ${bidUrl}`);
                        
                        try {
                            // Navigate to bid with page.goto
                            await page.goto(bidUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
                            await page.waitForTimeout(1000);
                            
                            // Get full page text
                            const fullPageText = await page.evaluate(() => document.body.innerText);
                            
                            // Extract data using page.evaluate
                            const bidData = await page.evaluate(() => {
                                // Extract agency - text after "Louisiana >"
                                let agency = '';
                                const fullText = document.body.innerText;
                                const agencyMatch = fullText.match(/Louisiana\s*>\s*([^\n\r>]+)/i);
                                if (agencyMatch) {
                                    agency = agencyMatch[1].trim();
                                }
                                
                                // Extract deadline - text after various patterns
                                let deadline = '';
                                const deadlineMatch = fullText.match(/(?:Ends:|Due Date:|Bid Date:|Closing Date:)\s*([^\n\r]+)/i);
                                if (deadlineMatch) {
                                    deadline = deadlineMatch[1].trim();
                                }
                                
                                // Extract value - text after various patterns
                                let value = '';
                                const valueMatch = fullText.match(/(?:Estimated Value:|Budget:|Amount:)\s*([^\n\r]+)/i);
                                if (valueMatch) {
                                    value = valueMatch[1].trim();
                                }
                                
                                // Extract description - text between specific markers
                                let description = '';
                                const descMatch = fullText.match(/Listing Information\/Advertisement(.*?)BID SUBMITTAL INFORMATION/is);
                                if (descMatch) {
                                    description = descMatch[1].trim();
                                }
                                
                                return { agency, deadline, value, description };
                            });
                            
                            // Extract title using the specified method
                            const title = await page.evaluate(() => {
                                const h1 = document.querySelector('h1');
                                if (h1 && h1.textContent.trim().length > 3 && !h1.textContent.includes('99')) return h1.textContent.trim();
                                const h2 = document.querySelector('h2');
                                if (h2 && h2.textContent.trim().length > 3 && !h2.textContent.includes('99')) return h2.textContent.trim();
                                return '';
                            });
                            
                            // Use extracted title, or fall back to URL parsing
                            let finalTitle = title;
                            if (!finalTitle) {
                                const urlMatch = bidUrl.match(/\/rfp\d+-([^\/]+)/);
                                if (urlMatch && urlMatch[1]) {
                                    finalTitle = urlMatch[1]
                                        .replace(/\.html$/, '')
                                        .replace(/-/g, ' ')
                                        .split(' ')
                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                        .join(' ');
                                }
                            }
                            
                            if (!finalTitle) {
                                log.info(`Could not extract title from URL or page: ${bidUrl}`);
                                continue;
                            }
                            
                            // Check isRelevant against title + description combined
                            if (!isRelevant(finalTitle, bidData.description || '')) {
                                log.info(`Not relevant: ${finalTitle}`);
                                continue;
                            }
                            
                            log.info(`RELEVANT: ${finalTitle}`);
                            
                            // Prepare complete opportunity data
                            const opportunity = {
                                title: finalTitle,
                                agency: bidData.agency || '',
                                deadline: bidData.deadline || '',
                                value: bidData.value || '',
                                description: bidData.description || '',
                                source_url: bidUrl,
                                state: 'LA',
                                vertical: 'disaster',
                                source: 'Central Bidding'
                            };
                            
                            // Send ALL data to intake endpoint
                            try {
                                const response = await fetch(INTAKE_URL, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'x-intake-secret': INTAKE_SECRET
                                    },
                                    body: JSON.stringify(opportunity)
                                });
                                
                                if (response.ok) {
                                    log.info(`SENT TO HGI: ${finalTitle}`);
                                } else {
                                    log.error(`Failed to send to HGI: ${response.status} ${response.statusText}`);
                                }
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
            await Actor.setValue('batch', (batch + 1) % 24);
            
            log.info(`Completed batch ${batch}. Next batch: ${(batch + 1) % 24}`);
        }
    }
});

await crawler.run([{ url: 'https://www.centralauctionhouse.com/SignIn', label: 'LOGIN' }]);

await Actor.exit();