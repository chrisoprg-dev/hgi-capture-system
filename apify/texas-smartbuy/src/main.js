Create a new file with the following content exactly:

import { Actor } from 'apify';
import { chromium } from 'playwright';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const BATCH_API_URL = 'https://hgi-capture-system.vercel.app/api/opportunities';
const ESBD_BASE = 'https://esbd.cpa.texas.gov';

const HGI_KEYWORDS = [
    'grant management', 'grants management', 'grant administration',
    'program management', 'project management services',
    'disaster recovery', 'disaster services',
    'FEMA', 'public assistance', 'CDBG', 'community development block grant',
    'hazard mitigation', 'mitigation planning',
    'emergency management', 'emergency preparedness',
    'flood', 'hurricane', 'storm', 'recovery program',
    'claims administration', 'claims processing', 'claims management',
    'third party administrator', 'TPA', 'TPA services',
    'workers compensation', 'workers comp', 'workmens compensation',
    'self-insured', 'self insured', 'insurance administration',
    'insurance fund', 'guaranty association', 'guaranty fund',
    'property casualty', 'liability claims', 'risk management',
    'loss adjustment', 'claims adjudication', 'claims handling',
    'property tax', 'tax appeal', 'ad valorem', 'tax consulting',
    'assessment appeal', 'billing appeal', 'billing dispute',
    'utility billing', 'revenue collection', 'tax administration',
    'property assessment', 'appraisal review',
    'workforce development', 'workforce services', 'workforce commission',
    'unemployment', 'job training', 'WIOA', 'employment services',
    'career services', 'reemployment', 'labor exchange',
    'public health', 'health services', 'health program',
    'behavioral health', 'human services', 'social services',
    'case management', 'benefits administration',
    'program administration', 'federal program', 'grant compliance',
    'compliance monitoring', 'audit services', 'financial management',
    'housing assistance', 'housing authority', 'homeowner assistance', 'affordable housing',
    'housing program', 'rental assistance',
    'consulting services', 'professional services', 'management consulting',
    'technical assistance', 'capacity building', 'training services',
    'data management', 'document management',
    'appeals', 'dispute resolution',
    'pension', 'retirement administration',
    'construction management', 'staffing services'
];

const SEARCH_KEYWORDS = [
    'program management', 'grant management', 'disaster recovery',
    'claims administration', 'third party administrator', 'workers compensation',
    'workforce development', 'WIOA', 'housing assistance', 'hazard mitigation',
    'CDBG', 'FEMA', 'risk management', 'program administration',
    'technical assistance', 'compliance monitoring', 'case management',
    'benefits administration', 'consulting services', 'professional services',
    'emergency management', 'housing authority', 'property tax', 'tax appeal',
    'construction management', 'financial management'
];

const isRelevant = (text) => {
    const lower = text.toLowerCase();
    return HGI_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
};

const parseDate = (dateStr) => {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
    } catch(e) {}
    return null;
};

const checkDuplicate = async (sourceUrl) => {
    try {
        const encoded = encodeURIComponent(sourceUrl);
        const res = await fetch(BATCH_API_URL + '?source_url=' + encoded);
        if (res.ok) {
            const data = await res.json();
            if (data && data.exists === true) return true;
            if (Array.isArray(data) && data.length > 0) return true;
        }
    } catch(e) {}
    return false;
};

const log = (msg) => console.log('[TX-SmartBuy] ' + msg);

const stats = {
    keywords_searched: 0,
    bids_reviewed: 0,
    relevant_found: 0,
    sent_to_intake: 0,
    filtered_out: 0,
    expired_skipped: 0,
    duplicates_skipped: 0
};

const sendToIntake = async (opportunity) => {
    try {
        const res = await fetch(INTAKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-intake-secret': INTAKE_SECRET },
            body: JSON.stringify(opportunity)
        });
        if (res.ok) {
            log('SENT TO HGI: ' + opportunity.title);
            stats.sent_to_intake++;
            return true;
        } else {
            const err = await res.text();
            log('Intake rejected: ' + res.status + ' ' + err.substring(0, 200));
            return false;
        }
    } catch(e) {
        log('Intake error: ' + e.message);
        return false;
    }
};

const fetchListingDetail = async (listingUrl, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto(listingUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();
        const fullText = await page.evaluate(() => document.body.innerText);

        const stripTags = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

        // Extract title from h1 or page header
        const title = await page.evaluate(() => {
            const h1 = document.querySelector('h1, .page-title, .bid-title, [class*="title"]');
            return h1 ? h1.textContent.trim() : '';
        });

        // Extract agency
        let agency = '';
        const agencyMatch = fullText.match(/(?:Agency|Entity|Customer|Issuing Agency|Awarding Agency)[:\s]+([^\n\r]{3,100})/i);
        if (agencyMatch) agency = agencyMatch[1].trim();

        // Extract deadline
        let deadline = '';
        const deadlineMatch = fullText.match(/(?:Close Date|Closing Date|Due Date|Bid Due|Response Due|Deadline|Opens?|Submit By)[:\s]+([^\n\r]{5,40})/i);
        if (deadlineMatch) deadline = deadlineMatch[1].trim();

        // Extract description — look for scope/description block
        let description = '';
        const descMatch = fullText.match(/(?:Description|Scope of Work|Requirements|Solicitation Details|Procurement Description)[:\s]*([^\n]{30,1000})/i);
        if (descMatch) description = descMatch[1].trim();
        if (!description) description = fullText.substring(0, 1000);

        log('Detail: ' + (title || 'no title') + ' | deadline: ' + deadline + ' | ' + fullText.length + ' chars');
        return { title, agency, deadline, description, fullText };
    } catch(e) {
        log('Error fetching detail ' + listingUrl + ': ' + e.message);
        return null;
    } finally {
        await context.close();
    }
};

const searchByKeyword = async (keyword, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = [];
    try {
        // ESBD search URL — keyword search on open solicitations
        const searchUrl = ESBD_BASE + '/bid_search.cfm';
        log('Navigating to ESBD search: ' + searchUrl);
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Try to fill keyword search field
        try {
            // ESBD uses various field names — try common ones
            const filled = await page.evaluate((kw) => {
                const inputs = Array.from(document.querySelectorAll('input[type="text"], input[name*="keyword"], input[name*="search"], input[id*="keyword"], input[id*="search"]'));
                for (const inp of inputs) {
                    if (inp.offsetParent !== null) { // visible
                        inp.value = kw;
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        inp.dispatchEvent(new Event('change', { bubbles: true }));
                        return inp.name || inp.id || 'found';
                    }
                }
                return null;
            }, keyword);

            if (!filled) {
                log('No keyword input found for: ' + keyword + ' — trying URL-based search');
                // Fallback: use URL query param search
                await page.goto(ESBD_BASE + '/bid_search.cfm?keywords=' + encodeURIComponent(keyword) + '&status=open', { waitUntil: 'networkidle', timeout: 30000 });
            } else {
                log('Filled keyword field: ' + filled + ' with: ' + keyword);
                // Submit form
                await page.evaluate(() => {
                    const btn = document.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
                    if (btn) btn.click();
                });
                await page.waitForLoadState('networkidle', { timeout: 20000 });
            }
        } catch(e) {
            log('Search form error: ' + e.message + ' — trying URL search');
            await page.goto(ESBD_BASE + '/bid_search.cfm?keywords=' + encodeURIComponent(keyword) + '&status=open', { waitUntil: 'networkidle', timeout: 30000 });
        }

        const html = await page.content();
        const pageText = await page.evaluate(() => document.body.innerText);
        log('Search results page for "' + keyword + '": ' + pageText.length + ' chars');

        // Extract listing links from results
        const listingLinks = await page.evaluate((base) => {
            const links = Array.from(document.querySelectorAll('a'));
            return links
                .map(l => ({ href: l.href, text: l.textContent.trim() }))
                .filter(l => l.href && (
                    l.href.includes('/bid_display') ||
                    l.href.includes('/solicitation') ||
                    l.href.includes('/rfp') ||
                    l.href.includes('/itb') ||
                    l.href.includes('/rfo') ||
                    l.href.includes('bid_id=') ||
                    l.href.includes('solicitation_id=') ||
                    (l.href.includes(base) && /\d{4,}/.test(l.href))
                ))
                .filter(l => l.href.indexOf(base) === 0 || l.href.indexOf('http') === 0)
                .filter((l, i, arr) => arr.findIndex(x => x.href === l.href) === i)
                .slice(0, 20); // max 20 results per keyword
        }, ESBD_BASE);

        log('Found ' + listingLinks.length + ' listing links for "' + keyword + '"');

        // Also look for any table rows with bid data we can extract inline
        const inlineRows = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr, .result-row, .bid-row, [class*="result"]'));
            return rows.map(r => r.textContent.trim()).filter(t => t.length > 20).slice(0, 30);
        });

        for (const link of listingLinks) {
            results.push({ url: link.href, title: link.text, keyword });
        }

        return results;
    } catch(e) {
        log('Error searching keyword "' + keyword + '": ' + e.message);
        return [];
    } finally {
        await context.close();
    }
};

// ---- MAIN ----

log('Starting Texas SmartBuy (ESBD) scraper');
log('Target: ' + ESBD_BASE);

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
log('Browser launched');

const seenUrls = new Set();

for (const keyword of SEARCH_KEYWORDS) {
    log('Searching keyword: ' + keyword);
    const listings = await searchByKeyword(keyword, browser);
    stats.keywords_searched++;

    for (const listing of listings) {
        if (seenUrls.has(listing.url)) continue;
        seenUrls.add(listing.url);

        if (await checkDuplicate(listing.url)) {
            stats.duplicates_skipped++;
            continue;
        }

        // Get detail page
        const detail = await fetchListingDetail(listing.url, browser);
        if (!detail) continue;

        stats.bids_reviewed++;

        const combinedText = (detail.title || listing.title || '') + ' ' + detail.description + ' ' + detail.fullText;

        if (!isRelevant(combinedText)) {
            log('Not relevant: ' + (detail.title || listing.title));
            stats.filtered_out++;
            continue;
        }

        if (detail.deadline) {
            const endDate = parseDate(detail.deadline);
            if (endDate && endDate < new Date()) {
                log('Expired: ' + (detail.title || listing.title));
                stats.expired_skipped++;
                continue;
            }
        }

        const finalTitle = detail.title || listing.title || listing.url;
        log('RELEVANT: ' + finalTitle);
        stats.relevant_found++;

        const sourceId = 'tx-esbd-' + listing.url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 60);

        const opportunity = {
            title: finalTitle,
            agency: detail.agency || 'Texas State Agency',
            deadline: detail.deadline || '',
            description: detail.description || combinedText.substring(0, 800),
            url: listing.url,
            source: 'Texas SmartBuy',
            source_id: sourceId,
            response_deadline: detail.deadline || '',
            state: 'TX'
        };

        await sendToIntake(opportunity);
        await Actor.pushData(opportunity);
        await new Promise(r => setTimeout(r, 800));
    }

    await new Promise(r => setTimeout(r, 1000));
}

await browser.close();
log('Browser closed');
log('Run complete: ' + JSON.stringify(stats));

try {
    await fetch('https://hgi-capture-system.vercel.app/api/hunt-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stats, secret: 'hgi-intake-2026-secure', source: 'texas-smartbuy' })
    });
} catch(e) {
    log('Analytics error: ' + e.message);
}

await Actor.exit();
