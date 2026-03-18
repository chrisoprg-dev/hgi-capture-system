import { Actor } from 'apify';
import { chromium } from 'playwright';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const BATCH_API_URL = 'https://hgi-capture-system.vercel.app/api/opportunities';
const LAPAC_BASE = 'https://wwwcfprd.doa.louisiana.gov/osp/lapac';

const TARGET_DEPARTMENTS = [
    'State - GOHSEP',
    'State - DOA Office of Community Development',
    'State - La. Workforce Commission',
    'State - LDH',
    'State - LDOL- Office of Workers Compensation',
    'State - Office of Risk Management',
    'State - Office of Group Benefits',
    'State - La. Department of Insurance',
    'State - La. Rehabilitation Services',
    'State - Department of Children & Family Services',
    'State - Capital Area Human Services District',
    'State - Florida Parishes Human Services Authority',
    'State - Imperial Calcasieu Human Services Authority',
    'State - Office of the Governor/Office of Community Programs',
    'State - Recovery School District',
    'Non State - Orleans Parish School Board',
    'Non State - Jefferson Parish Purchasing Department',
    'Non State - Terrebonne Parish Consolidated Government',
    'Non State - East Baton Rouge City Parish Purchasing',
    'Non State - St. Tammany Parish Government',
    'Non State - New Orleans Regional Transit Authority',
    'Non State - Sewerage & Water Board of New Orleans'
];

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

const log = (msg) => console.log('[LaPAC] ' + msg);

const stats = {
    departments_searched: 0,
    keywords_searched: 0,
    bids_reviewed: 0,
    relevant_found: 0,
    sent_to_intake: 0,
    filtered_out: 0,
    expired_skipped: 0,
    duplicates_skipped: 0
};

const parseBidLinks = (html, agency) => {
    const bids = [];
    const seen = new Set();
    // LaPAC uses onclick popups: dspBidContact.cfm?bidno=XXXX
    const onclickRegex = /dspBidContact\.cfm\?bidno=([^'"&]+)/gi;
    let match;
    while ((match = onclickRegex.exec(html)) !== null) {
        const bidno = decodeURIComponent(match[1].trim());
        if (!bidno || bidno.length < 2) continue;
        if (seen.has(bidno)) continue;
        seen.add(bidno);
        const fullUrl = LAPAC_BASE + '/dspBid.cfm?search=openBid&term=' + encodeURIComponent(bidno);
        bids.push({ url: fullUrl, bidNumber: bidno, agency });
    }
    return bids;
};

const fetchBidDetail = async (bidUrl, bidNumber, agency, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto(bidUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();
        const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();
        const fullText = stripTags(html);

        if (fullText.includes('No bid documents found')) {
            log('No bid doc at: ' + bidUrl);
            return null;
        }

        const titleMatch = html.match(/<b>([^<]{10,200})<\/b>/i) || html.match(/<strong>([^<]{10,200})<\/strong>/i);
        const title = titleMatch ? stripTags(titleMatch[1]) : bidNumber;

        let deadline = '';
        const deadlineMatch = fullText.match(/(?:Opening Date\/Time|Bid Opening Date|Due Date|Closing Date)[\:\s]+([^\n\r]{5,30})/i);
        if (deadlineMatch) deadline = deadlineMatch[1].trim();

        const descMatch = fullText.match(/(?:Description|Scope|Summary|Advertisement)[\:\s]*([^\n]{20,500})/i);
        const description = descMatch ? descMatch[1].trim() : fullText.substring(0, 800);

        let finalAgency = agency;
        if (!finalAgency) {
            const agencyMatch = fullText.match(/(?:Agency|Department|Issuing Agency)[\:\s]+([^\n\r]{3,80})/i);
            if (agencyMatch) finalAgency = agencyMatch[1].trim();
        }

        log('Detail fetched: ' + title + ' | ' + fullText.length + ' chars');
        return { title, deadline, description, agency: finalAgency, fullText };
    } catch(e) {
        log('Error fetching bid detail ' + bidUrl + ': ' + e.message);
        return null;
    } finally {
        await context.close();
    }
};

const fetchBidsByKeyword = async (keyword, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = [];
    try {
        const searchUrl = LAPAC_BASE + '/srchopen.cfm';
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.fill('input[name="keywords"]', keyword);
        try { await page.selectOption('select[name="dateType"]', 'O'); } catch(e) {}
        await page.click('input[type="submit"], button[type="submit"]');
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        const html = await page.content();
        log('Keyword "' + keyword + '" length: ' + html.length + ', dspBid: ' + html.includes('dspBid'));

        // Extract bidnos from HTML using regex — no DOM queries
        const bidnoRegex = /dspBidContact\.cfm\?bidno=([^'"&]+)/gi;
        const bidnos = [];
        const seenBidnos = new Set();
        let bm;
        while ((bm = bidnoRegex.exec(html)) !== null) {
            const bidno = decodeURIComponent(bm[1].trim());
            if (bidno && bidno.length > 2 && !seenBidnos.has(bidno)) {
                seenBidnos.add(bidno);
                bidnos.push(bidno);
            }
        }
        log('Bidnos found: ' + bidnos.length + (bidnos.length ? ' first: ' + bidnos[0] : ''));

        for (const bidno of bidnos) {
            try {
                // The bid doc link is under 'Original: BIDNO' in the Description column
                await page.click('a[href*="dspBid"]', { timeout: 5000 });
                await page.waitForLoadState('networkidle', { timeout: 20000 });
                const detailUrl = page.url();
                const detailHtml = await page.content();
                const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
                const fullText = stripTags(detailHtml);
                log('Detail page: ' + detailUrl + ' length: ' + fullText.length);
                if (!fullText.includes('No bid documents found') && fullText.length > 500) {
                    results.push({ url: detailUrl, bidNumber: bidno, agency: '', fullText, html: detailHtml });
                }
                // Go back to results for next bid
                await page.goBack({ waitUntil: 'networkidle', timeout: 20000 });
            } catch(e) {
                log('Error clicking ' + bidno + ': ' + e.message);
            }
        }
        return results;
    } catch(e) {
        log('Error searching keyword ' + keyword + ': ' + e.message);
        return [];
    } finally {
        await context.close();
    }
};

const fetchBidsByDepartment = async (department, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto(LAPAC_BASE + '/deptbids.cfm', { waitUntil: 'networkidle', timeout: 30000 });
        try {
            await page.click('a:has-text("' + department.substring(0, 20) + '")', { timeout: 5000 });
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch(e) {
            log('Could not click dept link for: ' + department);
            return [];
        }
        const html = await page.content();
        return parseBidLinks(html, department);
    } catch(e) {
        log('Error fetching department ' + department + ': ' + e.message);
        return [];
    } finally {
        await context.close();
    }
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
        } else {
            const err = await res.text();
            log('Intake rejected: ' + res.status + ' ' + err);
        }
    } catch(e) {
        log('Intake error: ' + e.message);
    }
};

const processBid = async (bid, agencyOverride, browser) => {
    let detail;
    if (bid.fullText) {
        const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
        const html = bid.html || '';
        const titleMatch = html.match(/<b>([^<]{10,200})<\/b>/i) || html.match(/<strong>([^<]{10,200})<\/strong>/i);
        const title = titleMatch ? stripTags(titleMatch[1]) : bid.bidNumber;
        const deadlineMatch = bid.fullText.match(/(?:Opening Date\/Time|Bid Opening Date|Due Date|Closing Date)[\:\s]+([^\n\r]{5,30})/i);
        const deadline = deadlineMatch ? deadlineMatch[1].trim() : '';
        const descMatch = bid.fullText.match(/(?:Description|Scope|Summary|Advertisement)[\:\s]*([^\n]{20,500})/i);
        const description = descMatch ? descMatch[1].trim() : bid.fullText.substring(0, 800);
        const agencyMatch = bid.fullText.match(/(?:Agency|Department|Issuing Agency)[\:\s]+([^\n\r]{3,80})/i);
        const agency = agencyOverride || (agencyMatch ? agencyMatch[1].trim() : '');
        detail = { title, deadline, description, agency, fullText: bid.fullText };
    } else {
        detail = await fetchBidDetail(bid.url, bid.bidNumber, agencyOverride || bid.agency, browser);
    }
    if (!detail) return;
    stats.bids_reviewed++;

    if (!isRelevant(detail.fullText)) {
        log('Not relevant: ' + detail.title);
        stats.filtered_out++;
        return;
    }

    if (detail.deadline) {
        const endDate = parseDate(detail.deadline);
        if (endDate && endDate < new Date()) {
            log('Expired: ' + detail.title);
            stats.expired_skipped++;
            return;
        }
    }

    log('RELEVANT: ' + detail.title);
    stats.relevant_found++;

    const opportunity = {
        title: detail.title,
        agency: detail.agency || '',
        deadline: detail.deadline || '',
        description: detail.description || '',
        url: bid.url,
        source: 'LaPAC',
        source_id: 'lapac-' + bid.bidNumber.replace(/\s+/g, '-'),
        response_deadline: detail.deadline || '',
        state: 'LA'
    };

    await sendToIntake(opportunity);
    await Actor.pushData(opportunity);
    await new Promise(r => setTimeout(r, 800));
};

// ---- MAIN ----

log('Starting LaPAC Playwright scraper');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
log('Browser launched');

const SEARCH_KEYWORDS = [
    'program management', 'grant management', 'disaster recovery',
    'claims administration', 'third party administrator', 'workers compensation',
    'workforce development', 'WIOA', 'housing assistance', 'hazard mitigation',
    'CDBG', 'FEMA', 'risk management', 'program administration',
    'technical assistance', 'compliance monitoring', 'case management',
    'benefits administration', 'consulting services', 'professional services'
];

const seenUrls = new Set();

for (const keyword of SEARCH_KEYWORDS) {
    log('Searching keyword: ' + keyword);
    const bids = await fetchBidsByKeyword(keyword, browser);
    stats.keywords_searched++;
    for (const bid of bids) {
        if (seenUrls.has(bid.url)) continue;
        seenUrls.add(bid.url);
        if (await checkDuplicate(bid.url)) { stats.duplicates_skipped++; continue; }
        await processBid(bid, '', browser);
    }
    await new Promise(r => setTimeout(r, 1000));
}

for (const dept of TARGET_DEPARTMENTS) {
    log('Scanning department: ' + dept);
    const bids = await fetchBidsByDepartment(dept, browser);
    stats.departments_searched++;
    for (const bid of bids) {
        if (seenUrls.has(bid.url)) continue;
        seenUrls.add(bid.url);
        if (await checkDuplicate(bid.url)) { stats.duplicates_skipped++; continue; }
        await processBid(bid, dept, browser);
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
        body: JSON.stringify({ ...stats, secret: 'hgi-intake-2026-secure', source: 'lapac' })
    });
} catch(e) {
    log('Analytics error: ' + e.message);
}

await Actor.exit();
