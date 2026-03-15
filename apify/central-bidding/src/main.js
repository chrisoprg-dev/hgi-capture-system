import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const crawler = new PlaywrightCrawler({
    requestHandler: async ({ page, request, log }) => {
        if (request.label === 'LOGIN') {
            await page.fill('input[name="username"]', 'HGIGLOBAL');
            await page.fill('input[type="password"]', 'Whatever1340!');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000);
            log.info('Current URL: ' + page.url());
            
            await page.goto('https://www.centralauctionhouse.com/rfpc1-Louisiana.html');
            await page.waitForTimeout(5000);
            log.info('Page title: ' + await page.title());
            
            const hrefs = await page.$$eval('a', links => 
                links.map(link => link.href)
                     .filter(href => href && href.includes('rfp'))
                     .slice(0, 10)
            );
            
            hrefs.forEach((href, index) => {
                log.info(`RFP Link ${index + 1}: ${href}`);
            });
        }
    }
});

await crawler.run([{ url: 'https://www.centralauctionhouse.com/SignIn', label: 'LOGIN' }]);

await Actor.exit();