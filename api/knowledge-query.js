// api/knowledge-query.js — Intelligent Knowledge Retrieval with Claude Reranker
import { HGI_CONTEXT, HGI_RATES } from './hgi-master-context.js';
export const config = { maxDuration: 30 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const dbH = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (SUPABASE_KEY || ''), 'Accept': 'application/json', 'Prefer': 'return=representation' };

async function dbGet(table, params) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + (params || ''), { headers: dbH });
  if (!r.ok) throw new Error('DB GET ' + table + ': ' + (await r.text()));
  return r.json();
}

var STEP_GUIDE = {
  scope: 'technical approaches, deliverables, work plans, methodologies, scope descriptions, compliance requirements, service categories, sub-vertical classification',
  financial: 'rate structures, pricing, staffing levels, labor categories, cost proposals, fee schedules, budget justifications, hourly rates, contract values',
  research: 'past performance narratives, client references, contract values, win history, competitive differentiators, agency relationships, program outcomes',
  scoring: 'capability evidence, past performance outcomes, technical qualifications, staffing depth, geographic presence, certifications',
  winnability: 'win themes, competitive advantages, risk factors, teaming history, agency relationship strength, proposal success factors',
  briefing: 'executive summaries, company overview, key differentiators, past performance highlights, staffing capacity, insurance and compliance',
  proposal: 'technical approaches, past performance, staffing plans, compliance evidence, pricing methodology, win themes, deliverable descriptions'
};

async function claudeRerank(candidates, oppText, evalCriteria, step) {
  var previews = candidates.map(function(c, i) {
    return 'CHUNK_' + i + ' [' + (c.filename || 'unknown') + ' #' + (c.chunk_index || 0) + ']: ' + (c.chunk_text || '').slice(0, 300);
  }).join('\n\n');

  var prompt = 'OPPORTUNITY:\n' + (oppText || '').slice(0, 2000) + '\n\n' +
    (evalCriteria ? 'EVALUATION CRITERIA:\n' + evalCriteria.slice(0, 500) + '\n\n' : '') +
    'ANALYSIS STEP: ' + (step || 'general') + '\n' +
    'SELECT CHUNKS ABOUT: ' + (STEP_GUIDE[step] || STEP_GUIDE.proposal) + '\n\n' +
    'CANDIDATE CHUNKS (' + candidates.length + ' total):\n\n' + previews + '\n\n' +
    'INSTRUCTIONS:\n' +
    '1. Select the 8-10 MOST RELEVANT chunks for this step and opportunity. Prioritize chunks addressing the highest-weighted evaluation criteria.\n' +
    '2. Select from MULTIPLE documents — spread across sources, do not over-index on one doc.\n' +
    '3. Assess KB coverage for this opportunity.\n\n' +
    'RESPOND IN EXACTLY THIS FORMAT:\n' +
    'RANKED: 5,12,3,28,7,15,22,9\n' +
    'STRONG: [what KB covers well for this opportunity — 1-2 sentences]\n' +
    'GAPS: [what is missing or weak in the KB for this opportunity — 1-2 sentences]';

  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 300,
        system: 'You are an HGI knowledge base retrieval optimizer. Return ONLY the requested format — RANKED, STRONG, GAPS. No other text.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    var d = await r.json();
    var text = (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');

    var rankedMatch = text.match(/RANKED:\s*([\d,\s]+)/);
    var strongMatch = text.match(/STRONG:\s*(.+)/);
    var gapsMatch = text.match(/GAPS:\s*(.+)/);

    var indices = rankedMatch ? rankedMatch[1].split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n) && n >= 0 && n < candidates.length; }) : [];

    return {
      ranked: indices.length > 0 ? indices.map(function(i) { return candidates[i]; }) : candidates.slice(0, 8),
      strong: strongMatch ? strongMatch[1].trim() : '',
      gaps: gapsMatch ? gapsMatch[1].trim() : ''
    };
  } catch(e) {
    console.error('Reranker error:', e.message);
    return { ranked: candidates.slice(0, 8), strong: '', gaps: 'Reranker unavailable.' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-intake-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Missing env vars' });

  var params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  var vertical = params.vertical;
  var maxChunks = parseInt(params.max_chunks) || 10;
  var oppText = params.opportunity_text || '';
  var evalCriteria = params.eval_criteria || '';
  var step = params.step || '';
  var smartMode = oppText.length > 50;

  if (!vertical && !smartMode) return res.status(400).json({ error: 'vertical or opportunity_text required' });

  try {
    // ── STEP 1: Get all extracted docs (smart mode ignores vertical filter) ──
    var docs;
    if (smartMode) {
      docs = await dbGet('knowledge_documents',
        '?status=eq.extracted&filename=not.like.*.url*&order=uploaded_at.desc&limit=20&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna'
      );
    } else {
      docs = await dbGet('knowledge_documents',
        '?vertical=eq.' + vertical + '&status=eq.extracted&filename=not.like.*.url*&order=uploaded_at.desc&limit=10&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna'
      );
      if (docs.length < 3) {
        var allDocs = await dbGet('knowledge_documents',
          '?status=eq.extracted&filename=not.like.*.url*&order=uploaded_at.desc&limit=10&select=id,filename,document_class,vertical,client,contract_name,summary,doctrine,winning_dna'
        );
        var seen = new Set(docs.map(function(d) { return d.id; }));
        for (var ad of allDocs) { if (!seen.has(ad.id)) { docs.push(ad); seen.add(ad.id); } }
      }
    }

    if (!docs.length) {
      return res.status(200).json({ found: false, prompt_injection: buildCoreDoctrineOnly(), doc_count: 0, chunk_count: 0 });
    }

    // ── STEP 2: Broad chunk pull ──
    var docIds = docs.map(function(d) { return d.id; });
    var chunkFilter = docIds.map(function(id) { return 'document_id.eq.' + id; }).join(',');
    var candidates = [];
    try {
      candidates = await dbGet('knowledge_chunks',
        '?or=(' + chunkFilter + ')&order=chunk_index.asc&limit=40&select=chunk_text,document_id,chunk_index,filename'
      );
    } catch(e) { console.warn('Chunk pull failed:', e.message); }

    if (!candidates.length) {
      return res.status(200).json({ found: true, prompt_injection: buildLegacyInjection(docs, [], vertical || 'general'), doc_count: docs.length, chunk_count: 0 });
    }

    // ── STEP 3: Smart rerank or legacy path ──
    var finalChunks, gapReport = '';

    if (smartMode && ANTHROPIC_KEY) {
      var result = await claudeRerank(candidates, oppText, evalCriteria, step);
      finalChunks = result.ranked.slice(0, maxChunks);
      gapReport = 'KB STRONG: ' + (result.strong || 'N/A') + ' | KB GAPS: ' + (result.gaps || 'N/A');
    } else {
      finalChunks = candidates.slice(0, maxChunks);
    }

    // ── STEP 4: Build injection ──
    var injection = buildCoreDoctrineOnly();
    injection += buildDocMetadata(docs, vertical || 'general');

    if (finalChunks.length > 0) {
      injection += '\n\n=== RELEVANT DOCUMENT EXCERPTS (AI-selected for: ' + (step || 'general') + ') ===\n';
      finalChunks.forEach(function(chunk) {
        injection += '\n[From: ' + chunk.filename + ' chunk ' + chunk.chunk_index + ']\n' + chunk.chunk_text + '\n';
      });
    }

    if (gapReport) {
      injection += '\n\n=== KB COVERAGE ASSESSMENT ===\n' + gapReport + '\n';
    }

    return res.status(200).json({
      found: true,
      prompt_injection: injection,
      doc_count: docs.length,
      chunk_count: finalChunks.length,
      smart_mode: smartMode,
      gap_report: gapReport,
      step: step || 'legacy',
      docs_used: docs.map(function(d) { return { id: d.id, filename: d.filename, class: d.document_class }; })
    });

  } catch(e) {
    console.error('Knowledge query error:', e.message);
    return res.status(200).json({ found: false, prompt_injection: buildCoreDoctrineOnly(), error: e.message });
  }
}

function buildDocMetadata(docs, vertical) {
  var injection = '';
  var ppEntries = [], winThemes = [], staffingPatterns = [], references = [];

  for (var doc of docs) {
    if (doc.doctrine && doc.doctrine.past_performance && doc.doctrine.past_performance.length) ppEntries.push.apply(ppEntries, doc.doctrine.past_performance);
    if (doc.doctrine && doc.doctrine.win_themes && doc.doctrine.win_themes.length) winThemes.push.apply(winThemes, doc.doctrine.win_themes);
    if (doc.winning_dna && doc.winning_dna.staffing_patterns && doc.winning_dna.staffing_patterns.length) staffingPatterns.push.apply(staffingPatterns, doc.winning_dna.staffing_patterns);
    if (doc.winning_dna && doc.winning_dna.references && doc.winning_dna.references.length) references.push.apply(references, doc.winning_dna.references);
  }

  if (ppEntries.length > 0) {
    injection += '\n\n=== RELEVANT PAST PERFORMANCE (' + vertical.toUpperCase() + ') ===';
    ppEntries.slice(0, 8).forEach(function(pp) {
      injection += '\n- ' + (pp.program || pp.client) + ': ' + pp.scope;
      if (pp.scale) injection += ' | Scale: ' + pp.scale;
      if (pp.outcome) injection += ' | Outcome: ' + pp.outcome;
    });
  }
  if (winThemes.length > 0) {
    var unique = winThemes.filter(function(t, i, a) { return a.indexOf(t) === i; });
    injection += '\n\n=== WIN THEMES ===';
    unique.slice(0, 6).forEach(function(t) { injection += '\n- ' + t; });
  }
  if (staffingPatterns.length > 0) {
    injection += '\n\n=== STAFFING PATTERNS ===';
    staffingPatterns.slice(0, 5).forEach(function(sp) { injection += '\n- ' + sp.role + ': ' + (sp.qualifications || '') + ' | ' + (sp.responsibilities || ''); });
  }
  if (references.length > 0) {
    injection += '\n\n=== REFERENCE CONTACTS (verify before use) ===';
    references.slice(0, 6).forEach(function(r) {
      injection += '\n- ' + r.name + ', ' + r.title + ' at ' + r.organization;
      if (r.email) injection += ' | ' + r.email;
      if (r.phone) injection += ' | ' + r.phone;
    });
  }
  injection += '\n\nNOTE: Staff names from historical proposals — confirm current availability. Current rate card supersedes historical rates.';
  return injection;
}

function buildLegacyInjection(docs, chunks, vertical) {
  var injection = buildCoreDoctrineOnly();
  injection += buildDocMetadata(docs, vertical);
  if (chunks.length > 0) {
    injection += '\n\n=== DOCUMENT EXCERPTS ===';
    chunks.forEach(function(c) { injection += '\n[From: ' + c.filename + ']\n' + c.chunk_text + '\n'; });
  }
  return injection;
}

function buildCoreDoctrineOnly() {
  return '\n=== HGI INSTITUTIONAL KNOWLEDGE ===\n\nCOMPANY: HGI Global, Inc. / Hammerman & Gainer LLC\nFounded: 1929 | 95+ years | Kenner, Louisiana\nLeadership: Larry D. Oney (Chairman), Christopher J. Oney (President), Louis J. Resweber (CEO), Candy L. Dottolo (CAO), Vanessa R. James (SVP Claims), S. Adaan Uzzaman (CSO)\nCertifications: 100% Minority-Owned\nInsurance: ' + String.fromCharCode(36) + '5M Fidelity Bond, ' + String.fromCharCode(36) + '5M E&O, ' + String.fromCharCode(36) + '2M GL (' + String.fromCharCode(36) + '1M per occurrence/' + String.fromCharCode(36) + '2M aggregate). SAM UEI: DL4SJEVKZ6H4. Staff: ~67 FT + 43 contract professionals. Offices: Kenner (HQ), Shreveport, Alexandria, New Orleans.\n\nCORE VERTICALS (8):\n1. Disaster Recovery (CDBG-DR, FEMA PA, HMGP)\n2. TPA/Claims (workers comp, property, liability, guaranty)\n3. Property Tax Appeals\n4. Workforce Services/WIOA\n5. Construction Management\n6. Program Administration (federal/state, NOT healthcare)\n7. Housing/HUD\n8. Grant Management\n\nCONFIRMED PAST PERFORMANCE:\n- Road Home Program: ' + String.fromCharCode(36) + '67M direct / ' + String.fromCharCode(36) + '13B+ program, zero misappropriation\n- HAP: ' + String.fromCharCode(36) + '950M\n- Restore Louisiana: ' + String.fromCharCode(36) + '42.3M CDBG-DR\n- TPSD: ' + String.fromCharCode(36) + '2.96M construction mgmt, 2022-2025 (completed)\n- St. John Sheriff: ' + String.fromCharCode(36) + '788K\n- Rebuild NJ: ' + String.fromCharCode(36) + '67.7M\n- BP GCCF: ' + String.fromCharCode(36) + '1.65M, 1M+ claims, Kenneth Feinberg\n- City of New Orleans WC TPA: ' + String.fromCharCode(36) + '283K/month active\n- SWBNO billing appeals: ' + String.fromCharCode(36) + '200K/month active\n\nRATE CARD (HTHA 2026 reference — adapt per RFP):\nPrincipal ' + String.fromCharCode(36) + '220 | Program Director ' + String.fromCharCode(36) + '210 | SME ' + String.fromCharCode(36) + '200 | Sr Grant Mgr ' + String.fromCharCode(36) + '180 | Grant Mgr ' + String.fromCharCode(36) + '175 | Sr PM ' + String.fromCharCode(36) + '180 | PM ' + String.fromCharCode(36) + '155 | Grant Writer ' + String.fromCharCode(36) + '145 | Architect/Engineer ' + String.fromCharCode(36) + '135 | Cost Estimator ' + String.fromCharCode(36) + '125 | Appeals Specialist ' + String.fromCharCode(36) + '145 | Sr Damage Assessor ' + String.fromCharCode(36) + '115 | Damage Assessor ' + String.fromCharCode(36) + '105 | Admin Support ' + String.fromCharCode(36) + '65\n\nPRICING RULE: Never copy rate table as-is. Build pricing from specific RFP positions. Match RFP titles exactly.\nGEOGRAPHY: Louisiana, Texas, Florida, Mississippi, Alabama, Georgia, Federal\nNAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190\nCRITICAL: HGI has NEVER had a direct federal contract. All work through state/local agencies.\n';
}