export const config = { maxDuration: 60 };

var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
var D = String.fromCharCode(36);
var STG = 'centralbid-rfp31266541-professional-services-for-disaster-recovery-project-management-consu';

var SEEDS = [
  { agent:'intelligence_engine', oid:STG, tags:'St George,disaster,Louisiana,Tetra Tech,CDR Maguire,Witt OBriens,IEM,Hagerty,competitive_landscape', type:'competitive_intel',
    obs:'Louisiana disaster recovery consulting competitive landscape (verified Session 21-22 web research): Tier 1 competitors are Tetra Tech/AMR (largest FEMA PA contractor nationally, deep Louisiana presence, multiple active parish contracts), CDR Maguire (dominant Louisiana disaster recovery firm, strong GOHSEP relationships, local offices in Baton Rouge metro), and Witt OBriens (national emergency management leader). Tier 2 includes Hagerty Consulting, IEM (Baton Rouge HQ, very strong Louisiana presence), Baker Tilly, and smaller regional firms like RSE and Providence Engineering. National players like AECOM and WSP may not pursue contracts under '+D+'5M. For St. George: greenfield city incorporated 2024 — no incumbent, no established vendor relationships. Every competitor starts at zero. HGI advantage: CDBG-DR dominance in Louisiana is unmatched (Road Home + Restore LA + HAP combined). Disadvantage: HGI has no prior relationship with St. George leadership (Mayor Dustin Yates, interim appointed by Governor Landry).' },
  { agent:'financial_pricing', oid:STG, tags:'St George,disaster,financial,pricing,MSA,task_order', type:'pricing_benchmark',
    obs:'CRITICAL CORRECTION — St. George financial estimate: System previously estimated '+D+'2.5M-'+D+'8.5M. This is wildly off. St. George is a brand-new city (incorporated 2024) with '+D+'58M total budget, '+D+'44M spending. 86% of budget locked in dedicated taxes. 2% sales tax generating ~'+D+'43M. They cannot afford a multi-million dollar consultant. This is a task-order MSA with no guaranteed minimums. Realistic estimate: '+D+'150K-'+D+'500K/year in actual task orders, dependent on disaster activity and federal funding flow. The 10 positions in pricing exhibit are rate card positions, not full-time commitments. Most will bill 20-60 hrs/month on task orders. Price is only 10 of 100 eval points — lead on technical quality, not price.' },
  { agent:'financial_pricing', tags:'financial,MSA,task_order,pricing,lesson_learned', type:'pattern',
    obs:'LESSON LEARNED Sessions 8-17: Financial model consistently overstaffs task-order MSAs by assuming near-full-time utilization (100-160 hrs/month per position) when reality for municipal MSAs is 20-80 hrs/month. This inflates cost estimates, which makes winnability conclude unprofitable, which flips GO to NO-BID based on systems own inflated assumptions. Fix: estimate staffing from RFP scope, not maximum utilization. Small municipal MSAs: 20-40 hrs/month. Active disaster recovery: 60-100 hrs/month. Only 160 hrs/month if RFP explicitly requires dedicated full-time staff.' },
  { agent:'intelligence_engine', tags:'geographic,state_confusion,lesson_learned', type:'correction',
    obs:'CRITICAL CORRECTION — Geographic confusion: System confused City of St. George LOUISIANA with St. George UTAH during financial analysis (Session 8). Referenced Utah market and Utah adjustment factor for a Louisiana contract. State field from opportunity record MUST be used in all research, comparables, and market analysis. St. George Louisiana is newly incorporated city in East Baton Rouge Parish, population 86,316, 5th largest city in Louisiana.' },
  { agent:'proposal_agent', tags:'past_performance,corrections,confirmed_references', type:'correction',
    obs:'CONFIRMED PAST PERFORMANCE — use ONLY these. Source: HTHA proposal March 2026. (1) Road Home: '+D+'67M direct/'+D+'13B+ program, 2006-2018, 115K+ home evaluations, 62K+ title services, 50K+ closings, 165K+ claims, 250+ staff, zero misappropriation. Refs: Paul Rainwater, Jeff Haley. (2) HAP/HMGP: '+D+'950M grants, 41K+ applicants, 95K+ files. Ref: Jeff Haley. (3) Restore LA: '+D+'42.3M contract, '+D+'1.6B program, Prime, 2016-2022, 329 home projects, 4800+ inspections. Ref: Pat Forbes. (4) TPSD: '+D+'2.96M, 2022-2025 COMPLETED past tense only, '+D+'200M+ Ida damage, 22 schools. Refs: Bubba Orgeron, Gregory Harding. (5) St John Sheriff: '+D+'788K, 2021-2023, zero compliance deficiencies. Ref: Jeff Clement. (6) Rebuild NJ: '+D+'67.7M, '+D+'2B initiative, 44K+ applications. Ref: Jim Furfari. (7) BP GCCF: '+D+'1.65M, 1M+ claims. Ref: Kenneth Feinberg. (8) City of NOLA WC TPA: '+D+'283K/month active. (9) SWBNO: '+D+'200K/month active. DO NOT LIST: PBGC, Orleans Parish School Board, LIGA, TPCIGA.' },
  { agent:'proposal_agent', tags:'insurance,compliance,correction', type:'correction',
    obs:'INSURANCE CORRECTION (caught HTHA review Session 7): GL insurance is '+D+'1,000,000 per occurrence / '+D+'2,000,000 aggregate — NOT '+D+'2,000,000 per occurrence. ACORD certificate shows '+D+'1M per occurrence. Prior proposals had this wrong. Evaluators WILL catch discrepancies between narrative and certificates. Always state: '+D+'1M per occurrence / '+D+'2M aggregate for GL. E&O is '+D+'5M. Fidelity bond is '+D+'5M.' },
  { agent:'proposal_agent', tags:'proposal_staff,named_team,staffing', type:'pattern',
    obs:'HGI PROPOSAL TEAM (confirmed HTHA March 2026): Christopher Oney — President/Principal. Louis Resweber — CEO/Program Director on proposals. Mark Berron PMP — Sr PA SME (18 yrs FEMA employee). April Gloston — HM Specialist/Sr Grant Mgr. Carl Klunk — Financial/Grant Specialist. Keith Dupont PMP — Sr PM (former FEMA Region VII Director). Dillon Truax — VP/PM, handles final edits and submission. Lynn Wiltz Esq — Documentation Mgr/Grant Writer (former GOHSEP Appeals Specialist). Candy Dottolo — CAO, Designated Signature Authority. PROCESS: Christopher reviews strategy, Dillon handles final edits/submission, Candy signs.' },
  { agent:'self_awareness', tags:'win_patterns,business_development,HGI_culture', type:'pattern',
    obs:'HOW HGI WINS CONTRACTS (Sessions 5-17): HGI wins through reputation and relationships built over 95 years, NOT portal searches. Road Home, Restore LA, BP GCCF, TPCIGA — none from SAM.gov. HGI has NEVER had a direct federal contract — all work through state agencies, local govts, housing authorities, insurance entities. Research must target: LaPAC award history, local govt meeting minutes, GOHSEP contractor lists, state insurance filings, parish council records, local news. The system hunts state/local procurement channels. Federal funding flows through these entities to HGI.' },
  { agent:'intelligence_engine', tags:'research_methodology,vertical_playbooks', type:'pattern',
    obs:'RESEARCH METHODOLOGY (Sessions 17-22): Output must function like senior Louisiana government affairs consultant — NOT federal procurement analyst. Disaster recovery: LaPAC awards, FEMA PA public data, GOHSEP contractors, parish news, OCD-DRU vendors. TPA/Claims: state insurance filings, guaranty board minutes, workers comp records. Housing: housing authority board minutes, HUD monitoring, LHC contractors. Property Tax: assessor records, Tax Commission decisions. Workforce: LWC grants, WIOA performance. Every finding tied to specific RFP details and eval criteria. Generic landscape is worthless — need named firms with recent wins/losses in this state for this vertical.' },
  { agent:'financial_pricing', tags:'rate_card,pricing,confirmed', type:'pricing_benchmark',
    obs:'HGI CONFIRMED RATE CARD (March 2026 HTHA): Principal '+D+'220, Program Director '+D+'210, SME '+D+'200, Sr Grant Mgr '+D+'180, Grant Mgr '+D+'175, Sr PM '+D+'180, PM '+D+'155, Grant Writer '+D+'145, Architect/Engineer '+D+'135, Cost Estimator '+D+'125, Appeals Specialist '+D+'145, Sr Damage Assessor '+D+'115, Damage Assessor '+D+'105, Admin Support '+D+'65. RULE: Never copy as-is. Build per-RFP by adjusting for: eval weight of pricing, comparable rates, competitive positioning. St. George: 5-10% below card for MSA volume and new client building. Price is only 10 of 100 pts.' },
  { agent:'self_awareness', tags:'system_lessons,accuracy,truncation', type:'correction',
    obs:'SYSTEM ACCURACY LESSONS (Sessions 1-23): (1) Research step frequently wrong on agency facts from training data — St. George dates wrong, competitor names generic, budgets fabricated. Web research improved this but needs verification. (2) Financial estimates consistently wrong — overstaffed utilization and no comparable data. (3) Truncation at multiple points (200 chars cascade, 800 chars agent-react, 2000 chars hunt_runs) breaks compounding. (4) OPI scores are guesses until Data Call. (5) KB has 6 image-PDFs with minimal extraction. (6) The orchestrator starts from zero every time — does not read prior analysis or accumulated intelligence.' },
  { agent:'intelligence_engine', oid:STG, tags:'St George,RFP,eval_criteria,deadline,compliance', type:'competitive_intel',
    obs:'ST. GEORGE RFP KEY FACTS (actual RFP stored): Due April 24 2026 2PM CST via Central Bidding. Questions deadline March 27 to melinda.kyzar@stgeorgela.gov (225-228-3200). Eval: Technical 30, Experience 25, PP 20, Staffing 15, Price 10. Price formula: CS=(Lowest/Proposer)x10. MSA 3yr + 2 option. 10 Exhibit A positions: Program Director, Sr PM, PM, PA SME, HM Specialist, Grant Financial Specialist, Documentation Mgr, Admin Support, Construction Mgr, Resident Inspector. Rates fully burdened, firm 3 years. NO percentage-based compensation. Insurance: E&O '+D+'1M, GL '+D+'1M/occ, Auto '+D+'1M, WC statutory. 5 hard copies within 3 days of electronic. Address: 11207 Proverbs Ave. NOTE: SAM cert shows 1207 Proverbs Ave — discrepancy flagged Session 8.' },
  { agent:'proposal_agent', oid:STG, tags:'St George,proposal_strategy,positioning', type:'recommendation',
    obs:'ST. GEORGE PROPOSAL STRATEGY (Sessions 8-22): Lead with helping Louisiana through biggest disasters and doing the same for its newest city. Technical Approach (30 pts highest weight) should lead with regulatory compliance framework — HGI highest-scoring pattern. PP (20 pts): Road Home zero misappropriation at '+D+'13B scale, Restore LA CDBG-DR relevance, TPSD recent school recovery. Price (10 pts only): dont compete on price, compete on technical depth. Position HGI as firm that finds 15-25% additional reimbursement others miss through PW optimization, Alternative Procedures, Section 406 HM integration. 14-question questions letter drafted Session 8 for March 27 — STATUS DEFERRED, needs reassessment.' },
  { agent:'self_awareness', tags:'HTHA,outcome,submitted', type:'observation',
    obs:'HTHA submitted March 19 2026 by Dillon Truax. Awaiting award. Key corrections during review: GL insurance fixed ('+D+'1M per occ not '+D+'2M), company age standardized 96 years, transmittal letter added, org chart added Section D, Key Differentiator box in Exec Summary/Section B/Conclusion, references table expanded with HTHA Alignment column, TPSD corrected to completed past tense. If HGI wins HTHA this becomes first real outcome for OPI calibration.' },
  { agent:'self_awareness', tags:'data_sources,coverage_gaps', type:'observation',
    obs:'DATA SOURCE STATUS (Session 22): 4 of ~20 sources working. Central Bidding 24/7 (listings only, full RFP behind login wall). LaPAC 6hr (good, embargoed re-fetch). FEMA Monitor live (declarations not procurements). Grants.gov 2x daily (42 found, 20 ingested). BLOCKED: SAM.gov needs API key from Candy. USAspending.gov API errors unresolved. Texas SmartBuy code exists not deployed. MISSING HIGH PRIORITY: Louisiana Housing Corp (housing vertical no scraper), parish/city meeting minutes, state audit reports.' }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check if already seeded
  try {
    var chk = await fetch(SB+'/rest/v1/organism_memory?agent=eq.intelligence_engine&memory_type=eq.competitive_intel&select=id&limit=5', {headers:{apikey:SK,Authorization:'Bearer '+SK}});
    if (chk.ok) { var ex = await chk.json(); if (ex.length >= 3) return res.status(200).json({status:'ALREADY_SEEDED', existing:ex.length, message:'Seed memories already present. Delete first if you want to re-seed.'}); }
  } catch(e){}

  var results = [];
  var success = 0;
  var failed = 0;

  for (var i = 0; i < SEEDS.length; i++) {
    var s = SEEDS[i];
    var record = {
      id: 'om-seed-' + Date.now() + '-' + i,
      agent: s.agent,
      opportunity_id: s.oid || null,
      entity_tags: s.tags || null,
      observation: s.obs,
      memory_type: s.type || 'observation',
      created_at: new Date().toISOString()
    };
    try {
      var wr = await fetch(SB+'/rest/v1/organism_memory', {method:'POST', headers:H, body:JSON.stringify(record)});
      if (wr.ok) { success++; results.push({i:i, status:'OK', agent:s.agent, type:s.type, len:s.obs.length}); }
      else { failed++; results.push({i:i, status:'FAIL_'+wr.status, agent:s.agent}); }
    } catch(e) { failed++; results.push({i:i, status:'ERROR', error:e.message}); }
  }

  return res.status(200).json({
    status: failed === 0 ? 'ALL_SEEDED' : 'PARTIAL',
    total: SEEDS.length,
    success: success,
    failed: failed,
    results: results
  });
}
