import { Actor } from 'apify';
import { chromium } from 'playwright';

await Actor.init();

const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';
const INTAKE_SECRET = 'hgi-intake-2026-secure';
const BATCH_API_URL = 'https://hgi-capture-system.vercel.app/api/opportunities';
const LAPAC_BASE = 'https://wwwcfprd.doa.louisiana.gov/osp/lapac';

// Target departments — HGI priority agencies only
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

// Target categories — HGI service lanes only
const TARGET_CATEGORIES = [
    'FINANCIAL AND INSURANCE SERVICES (84000000)',
    'MNGMNT AND BUSINESS PROFESSIONALS AND ADMINISTRATIVE SERV. (80000000)',
    'HEALTHCARE SERVICES (85000000)',
    'EDUCATION AND TRAINING SERVICES (86000000)',
    'PUBLIC UTILITIES AND PUBLIC SECTOR RELATED SERVICES (83000000)',
    'ENGINEERING AND RESEARCH AND TECHNOLOGY BASED SERVICES (81000000)',
    'NATIONAL DEFENSE, PUBLIC ORDER, SECURITY, SAFETY SERVICES (92000000)',
    'POLITICS AND CIVIC AFFAIRS SERVICES (93000000)'
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
        const res = await fetch(`${BATCH_API_URL}?source_url=${encoded}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.exists === true) return true;
            if (Array.isArray(data) && data.length > 0) return true;
        }
    } catch(e) {}
    return false;
};

// Simple HTML table parser — extracts rows from LaPAC result tables
const parseTableRows = (html) => {
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
    const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const cells = [];
        let cellMatch;
        const cellRe = new RegExp(cellRegex.source, 'gi');
        while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
            const linkMatch = linkRegex.exec(cellMatch[1]);
            cells.push({
                text: stripTags(cellMatch[1]),
                href: linkMatch ? linkMatch[1] : null
            });
        }
        if (cells.length >= 3) rows.push(cells);
    }
    return rows;
};

const log = (msg) => console.log(`[LaPAC] ${msg}`);

const stats = {
    departments_searched: 0,
    categories_searched: 0,
    bids_reviewed: 0,
    relevant_found: 0,
    sent_to_intake: 0,
    filtered_out: 0,
    expired_skipped: 0,
    duplicates_skipped: 0
};

// Fetch open bids for a given department — uses real Playwright browser session
const fetchBidsByDepartment = async (department, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        const deptPageUrl = `${LAPAC_BASE}/deptbids.cfm`;
        await page.goto(deptPageUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();

        // Find the link for this department
        const deptLinkRegex = new RegExp(`href="([^"]*dspBid\.cfm[^"]*)"[^>]*>[^<]*${department.replace(/[.*+?^${}()|[\]\\]/g, '\\// Fetch open bids for a given department name
const fetchBidsByDepartment = async (department) => {
    try {
        // First get the department list page to find the correct dept code
        const deptPageRes = await fetch(`${LAPAC_BASE}/deptbids.cfm`);
        if (!deptPageRes.ok) return [];
        const deptHtml = await deptPageRes.text();

        // Find the link for this department
        const deptLinkRegex = new RegExp(`href="([^"]*dspBid\\.cfm[^"]*)"[^>]*>[^<]*${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').substring(0, 20)}`, 'i');
        const deptMatch = deptLinkRegex.exec(deptHtml);
        if (!deptMatch) {
            log(`Could not find link for department: ${department}`);
            return [];
        }

        const deptUrl = deptMatch[1].startsWith('http') ? deptMatch[1] : `${LAPAC_BASE}/${deptMatch[1].replace(/^\/osp\/lapac\//, '')}`;
        log(`Fetching bids for ${department}: ${deptUrl}`);

        const res = await fetch(deptUrl);
        if (!res.ok) return [];
        const html = await res.text();
        return parseBidLinks(html, department);
    } catch(e) {
        log(`Error fetching department ${department}: ${e.message}`);
        return [];
    }
};').substring(0, 20)}`, 'i');
        const deptMatch = deptLinkRegex.exec(html);
        if (!deptMatch) {
            log(`Could not find link for department: ${department}`);
            return [];
        }

        const deptUrl = deptMatch[1].startsWith('http') ? deptMatch[1] : `${LAPAC_BASE}/${deptMatch[1].replace(/^\/osp\/lapac\//, '')}`;
        log(`Fetching bids for ${department}: ${deptUrl}`);

        await page.goto(deptUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const deptHtml = await page.content();
        return parseBidLinks(deptHtml, department);
    } catch(e) {
        log(`Error fetching department ${department}: ${e.message}`);
        return [];
    } finally {
        await context.close();
    }
};

// Fetch open bids for a given keyword — uses real Playwright browser session
const fetchBidsByKeyword = async (keyword, browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        const searchUrl = `${LAPAC_BASE}/srchopen.cfm`;
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.fill('input[name="keywords"]', keyword);
        // Select "Open" bids only
        try { await page.selectOption('select[name="dateType"]', 'O'); } catch(e) {}
        await page.click('input[type="submit"], button[type="submit"]');
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        const html = await page.content();
        log(`Keyword "${keyword}" response length: ${html.length}, contains dspBid: ${html.includes('dspBid')}`);
        return parseBidLinks(html, '');
    } catch(e) {
        log(`Error searching keyword ${keyword}: ${e.message}`);
        return [];
    } finally {
        await context.close();
    }
};

const parseBidLinks = (html, agency) => {
    const bids = [];
    // LaPAC search results link to dspBid.cfm with bid number in the link text
    // Pattern 1: href="dspBid.cfm?search=openBid&term=BIDNUM" or similar
    const bidLinkRegex = /href="([^"]*dspBid\.cfm[^"]*term=([^&"]+)[^"]*)"[^>]*>([^<]+)/gi;
    let match;
    while ((match = bidLinkRegex.exec(html)) !== null) {
        const href = match[1];
        const term = match[2].trim();
        const linkText = match[3].trim();
        if (!term || term.length < 2) continue;
        const fullUrl = href.startsWith('http') ? href : `${LAPAC_BASE}/${href.replace(/^\/osp\/lapac\//, '').replace(/^\//, '')}`;
        bids.push({ url: fullUrl, bidNumber: term, agency });
    }
    // Pattern 2: plain bid number links like altlist.cfm
    if (bids.length === 0) {
        const altRegex = /href="([^"]*(?:dspBid|altlist)[^"]*)[^>]*>\s*(\S[^<]{2,60})/gi;
        while ((match = altRegex.exec(html)) !== null) {
            const href = match[1];
            const bidNum = match[2].trim();
            if (!bidNum || bidNum.length < 3) continue;
            const fullUrl = href.startsWith('http') ? href : `${LAPAC_BASE}/${href.replace(/^\/osp\/lapac\//, '').replace(/^\//, '')}`;
            bids.push({ url: fullUrl, bidNumber: bidNum, agency });
        }
    }
    return bids;
};

// Fetch and parse an individual bid detail page
const fetchBidDetail = async (bidUrl, bidNumber, agency) => {
    try {
        const res = await fetch(bidUrl);
        if (!res.ok) return null;
        const html = await res.text();
        const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();
        const fullText = stripTags(html);

        // Extract title
        const titleMatch = html.match(/<b>([^<]{10,200})<\/b>/i) || html.match(/<strong>([^<]{10,200})<\/strong>/i);
        const title = titleMatch ? stripTags(titleMatch[1]) : bidNumber;

        // Extract deadline — LaPAC shows "Opening Date/Time:" or "Bid Opening:"
        let deadline = '';
        const deadlineMatch = fullText.match(/(?:Opening Date\/Time|Bid Opening Date|Due Date|Closing Date)[:\s]+([^\n\r]{5,30})/i);
        if (deadlineMatch) deadline = deadlineMatch[1].trim();

        // Extract description — grab a decent chunk of page text after title
        const descMatch = fullText.match(/(?:Description|Scope|Summary|Advertisement)[:\s]*([^\n]{20,500})/i);
        const description = descMatch ? descMatch[1].trim() : fullText.substring(0, 800);

        // Extract agency from page if not passed in
        let finalAgency = agency;
        if (!finalAgency) {
            const agencyMatch = fullText.match(/(?:Agency|Department|Issuing Agency)[:\s]+([^\n\r]{3,80})/i);
            if (agencyMatch) finalAgency = agencyMatch[1].trim();
        }

        return { title, deadline, description, agency: finalAgency, fullText };
    } catch(e) {
        log(`Error fetching bid detail ${bidUrl}: ${e.message}`);
        return null;
    }
};

// ---- MAIN ----

log('Starting LaPAC scraper');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
log('Browser launched');

// Strategy 1: Search by HGI keywords directly — catches everything regardless of department
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
    log(`Searching keyword: ${keyword}`);
    const bids = await fetchBidsByKeyword(keyword, browser);
    stats.categories_searched++;

    for (const bid of bids) {
        if (seenUrls.has(bid.url)) continue;
        seenUrls.add(bid.url);

        if (await checkDuplicate(bid.url)) {
            stats.duplicates_skipped++;
            continue;
        }

        const detail = await fetchBidDetail(bid.url, bid.bidNumber, bid.agency);
        if (!detail) continue;

        stats.bids_reviewed++;

        // Relevance check against full page text
        if (!isRelevant(detail.fullText)) {
            log(`Not relevant: ${detail.title}`);
            stats.filtered_out++;
            continue;
        }

        // Expiry check
        if (detail.deadline) {
            const endDate = parseDate(detail.deadline);
            if (endDate && endDate < new Date()) {
                log(`Expired: ${detail.title}`);
                stats.expired_skipped++;
                continue;
            }
        }

        log(`RELEVANT: ${detail.title}`);
        stats.relevant_found++;

        const opportunity = {
            title: detail.title,
            agency: detail.agency || '',
            deadline: detail.deadline || '',
            description: detail.description || '',
            url: bid.url,
            source: 'LaPAC',
            source_id: `lapac-${bid.bidNumber.replace(/\s+/g, '-')}`,
            response_deadline: detail.deadline || '',
            state: 'LA'
        };

        try {
            const intakeRes = await fetch(INTAKE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-intake-secret': INTAKE_SECRET
                },
                body: JSON.stringify(opportunity)
            });
            if (intakeRes.ok) {
                log(`SENT TO HGI: ${detail.title}`);
                stats.sent_to_intake++;
            } else {
                const err = await intakeRes.text();
                log(`Intake rejected: ${intakeRes.status} ${err}`);
            }
        } catch(e) {
            log(`Intake error: ${e.message}`);
        }

        await Actor.pushData(opportunity);

        // Polite delay between bid detail fetches
        await new Promise(r => setTimeout(r, 800));
    }

    // Polite delay between keyword searches
    await new Promise(r => setTimeout(r, 1000));
}

// Strategy 2: Direct department pages for HGI priority agencies
for (const dept of TARGET_DEPARTMENTS) {
    log(`Scanning department: ${dept}`);
    const bids = await fetchBidsByDepartment(dept);
    stats.departments_searched++;

    for (const bid of bids) {
        if (seenUrls.has(bid.url)) continue;
        seenUrls.add(bid.url);

        if (await checkDuplicate(bid.url)) {
            stats.duplicates_skipped++;
            continue;
        }

        const detail = await fetchBidDetail(bid.url, bid.bidNumber, dept);
        if (!detail) continue;

        stats.bids_reviewed++;

        if (!isRelevant(detail.fullText)) {
            log(`Not relevant: ${detail.title}`);
            stats.filtered_out++;
            continue;
        }

        if (detail.deadline) {
            const endDate = parseDate(detail.deadline);
            if (endDate && endDate < new Date()) {
                stats.expired_skipped++;
                continue;
            }
        }

        log(`RELEVANT: ${detail.title}`);
        stats.relevant_found++;

        const opportunity = {
            title: detail.title,
            agency: dept,
            deadline: detail.deadline || '',
            description: detail.description || '',
            url: bid.url,
            source: 'LaPAC',
            source_id: `lapac-${bid.bidNumber.replace(/\s+/g, '-')}`,
            response_deadline: detail.deadline || '',
            state: 'LA'
        };

        try {
            const intakeRes = await fetch(INTAKE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-intake-secret': INTAKE_SECRET
                },
                body: JSON.stringify(opportunity)
            });
            if (intakeRes.ok) {
                log(`SENT TO HGI: ${detail.title}`);
                stats.sent_to_intake++;
            } else {
                const err = await intakeRes.text();
                log(`Intake rejected: ${intakeRes.status} ${err}`);
            }
        } catch(e) {
            log(`Intake error: ${e.message}`);
        }

        await Actor.pushData(opportunity);
        await new Promise(r => setTimeout(r, 800));
    }

    await new Promise(r => setTimeout(r, 1000));
}

// Log final stats
log(`Run complete: ${JSON.stringify(stats)}`);

try {
    await fetch('https://hgi-capture-system.vercel.app/api/hunt-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stats, secret: 'hgi-intake-2026-secure', source: 'lapac' })
    });
} catch(e) {
    log(`Analytics error: ${e.message}`);
}

await Actor.exit();