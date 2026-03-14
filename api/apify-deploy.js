export default async function handler(req, res) {
  const APIFY_TOKEN = 'apify_api_CFeI1ZehZ3HHClJFJfsVypn0KMPJSQ1b7nmO';
  const ACTOR_ID = 'Qfb4C0KiRbnsuv6jo';
  
  const code = `import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const CB_USER = 'HGIGLOBAL';
const CB_PASS = 'Whatever1340!';

const KEYWORDS = ['grant management','program management','disaster recovery','FEMA','CDBG','public assistance','TPA','housing','workforce','property tax','emergency management','hazard mitigation'];

const relevant = (t,d) => KEYWORDS.some(k => (t+d).toLowerCase().includes(k));

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 500,
    requestHandlerTimeoutSecs: 90,
    requestHandler: async ({page,request,log}) => {
        if (request.label === 'LOGIN') {
            await page.waitForLoadState('networkidle');
            await page.fill('input[name="username"]', CB_USER);
            await page.fill('input[type="password"]', CB_PASS);
            await Promise.all([
                page.waitForNavigation({waitUntil:'networkidle'}),
                page.click('input[type="submit"]')
            ]);
            
            await page.goto('https://www.centralauctionhouse.com/rfpc1-Louisiana.html',{waitUntil:'networkidle'});
            
            const cats = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a[href*="/Category/"]')).map(a=>a.href)
            );
            
            log.info('Categories: '+cats.length);
            
            for (const u of [...new Set(cats)]) {
                await crawler.addRequests([{url:u,label:'CAT'}]);
            }
        } else if (request.label === 'CAT') {
            await page.waitForLoadState('networkidle');
            
            const bids = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a'))
                    .map(a=>a.href)
                    .filter(h=>h.includes('centralauctionhouse.com/rfp')&&h.endsWith('.html'))
            );
            
            for (const u of [...new Set(bids)]) {
                await crawler.addRequests([{url:u,label:'BID'}]);
            }
        } else if (request.label === 'BID') {
            await page.waitForLoadState('networkidle');
            
            const d = await page.evaluate(() => {
                const t=document.body.innerText;
                const g=ls=>{
                    for(const l of ls){
                        const m=t.match(new RegExp(l+'[:\\\\s]+([^\\\\n]+)','i'));
                        if(m)return m[1].trim();
                    }
                    return '';
                };
                return {
                    title:(document.querySelector('h1,h2')||{}).textContent||document.title,
                    agency:g(['Entity','Agency','Owner']),
                    deadline:g(['Due Date','Deadline','Bid Date']),
                    value:g(['Estimated Value','Budget','Amount']),
                    desc:t.slice(0,2000)
                };
            });
            
            if(!relevant(d.title,d.desc)){
                log.info('Skip: '+d.title);
                return;
            }
            
            log.info('RELEVANT: '+d.title);
            await Actor.pushData(d);
            
            await fetch(INTAKE_URL,{
                method:'POST',
                headers:{
                    'Content-Type':'application/json',
                    'x-intake-secret':INTAKE_SECRET
                },
                body:JSON.stringify({
                    source:'central_bidding',
                    opportunities:[{
                        title:d.title,
                        agency:d.agency,
                        due_date:d.deadline,
                        estimated_value:d.value,
                        description:d.desc,
                        source_url:request.url,
                        state:'LA',
                        vertical:'disaster',
                        source:'Central Bidding',
                        discovered_at:new Date().toISOString()
                    }]
                })
            });
        }
    },
    failedRequestHandler: async({request,log})=>log.error('Failed: '+request.url)
});

await crawler.run([{url:'https://www.centralauctionhouse.com/SignIn',label:'LOGIN'}]);

await Actor.exit();`;

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/versions/0`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APIFY_TOKEN}`
      },
      body: JSON.stringify({
        versionNumber: '0.0',
        sourceType: 'SOURCE_FILES',
        sourceFiles: [
          {
            name: 'src/main.js',
            format: 'TEXT',
            content: code
          },
          {
            name: 'package.json',
            format: 'TEXT',
            content: JSON.stringify({
              name: 'hgi-scraper',
              version: '0.0.1',
              type: 'module',
              dependencies: {
                apify: '^3.0.0',
                crawlee: '^3.0.0',
                playwright: '^1.40.0'
              },
              engines: {
                node: '>=18.0.0'
              }
            })
          }
        ]
      })
    });

    const data = await r.json();
    return res.json({ status: r.status, data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}