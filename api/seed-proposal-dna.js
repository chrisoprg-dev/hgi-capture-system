export const config = { maxDuration: 30 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
function mid(){ return 'om-dna-' + Date.now() + '-' + Math.random().toString(36).slice(2,6); }
async function mem(agent, tags, obs, mtype){
  await fetch(SB+'/rest/v1/organism_memory',{method:'POST',headers:H,body:JSON.stringify({id:mid(),agent:agent,opportunity_id:null,entity_tags:tags,observation:obs,memory_type:mtype||'pattern',created_at:new Date().toISOString()})});
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  var D = String.fromCharCode(36);
  
  // PROPOSAL STRUCTURE PATTERN — learned from St. George Draft v2
  await mem('proposal_agent','proposal_structure,gold_standard,learning_loop',
    'GOLD STANDARD PROPOSAL STRUCTURE (learned from StGeorge_Proposal_COMPLETE_DRAFT_v2.docx — Christopher Oney + AI collaboration):\n'
    +'1. COVER PAGE: Submitted to [Agency + address + attn contact]. Submitted by [HGI legal name + address + Christopher contact]. RFP number + date. SAM UEI + CAGE. Tagline: 96 Years of Public Service | 100% Minority-Owned | Louisiana-Based.\n'
    +'2. TRANSMITTAL LETTER: Addressed to procurement contact by name. States RFP reviewed in entirety. Key credential in first paragraph ('+D+'13B, Road Home, zero misallocated). Four bullet confirmations: rates firm-fixed 3 yrs, SAM active, all Exhibits included, authorized in LA. Valid 90 days. Signed by Christopher.\n'
    +'3. SECTION A — FIRM QUALIFICATIONS (maps to Eval Criteria by name and point value). A.1 Company Overview with structured data table. A.2 Disaster Recovery Experience with three principles philosophy. A.3 Louisiana Public Sector Experience with bullet list of current/recent engagements.\n'
    +'4. SECTION B — KEY PERSONNEL: Summary table (Role | Name | Rate | Qualifications). Full bios 3-5 sentences each with specific credentials. Additional named staff with one-line bios. CRITICAL: Combined experience callout (100+ years).\n'
    +'5. SECTION C — PAST PERFORMANCE: 3 formal references with structured tables (Client, Value, Period, Funding, Closeout, Audit, Reference name+email+phone). Narrative per reference. Relevance to THIS RFP stated explicitly. Additional relevant experience as bullets.\n'
    +'6. SECTION D — TECHNICAL APPROACH: D.1 Activation Protocol (30-day Portfolio Stabilization Review). D.2-D.7 each subsection of scope. Every subsection uses FEMA terminology. Deliverables named. Staffing plan table (Phase | Timeline | Core | Surge | Activities).\n'
    +'7. SECTION E — CURRENT WORKLOAD: Staff counts, current contracts, capacity percentage, surge protocol.\n'
    +'8. SECTION F — CONFLICT OF INTEREST: Direct disclosures, not generic.\n'
    +'9. SECTION G — PRICING EXHIBIT A: Rates at HGI rate card (never discount without Christopher approval). Rates firm 3 years. No percentage-based.\n'
    +'10. EXHIBITS B-J: Each exhibit prepared with Candy LeBlanc Dottolo as Designated Signature Authority. Track which need notarization vs signature.\n'
    +'11. INSURANCE CERTS: Table showing RFP minimum vs HGI coverage vs compliance status. Name producer, insurers, policy dates.\n'
    +'EVERY section header references the RFP section number AND eval criteria point value.',
    'pattern');

  // CHRISTOPHER VOICE PATTERNS
  await mem('content_engine','voice,style,christopher_oney,learning_loop',
    'CHRISTOPHER ONEY PROPOSAL VOICE PATTERNS (extracted from St. George Draft v2 — GOLD STANDARD):\n'
    +'PHILOSOPHY STATEMENTS: "disaster recovery programs most often lose funding not because work was unnecessary or improperly performed, but because documentation, compliance, or regulatory alignment were not structured properly at the outset. HGI was built specifically to address those vulnerabilities."\n'
    +'THREE PRINCIPLES: Eligibility must be engineered at formulation. Compliance must be embedded into execution. Documentation must be audit-ready continuously.\n'
    +'TECHNICAL PRECISION: "regulatory engineering exercise, not a narrative summary" | "defensible regulatory instrument" | "submission with reduced RFI friction" | "structured contemporaneously, not reviewed at project end"\n'
    +'CONFIDENCE WITHOUT ARROGANCE: "HGI does not need a learning curve to serve St. George" | "Our teams are currently operating within Louisiana\'s disaster recovery ecosystem"\n'
    +'SPECIFICITY: Never generic claims. Always name the program, the dollar amount, the number of claims/staff/years. "165,000+ claims, 115,000 property appraisals, 62,000 title searches, 50,000+ closings"\n'
    +'CLOSERS: "Closeout is not an event — it is the culmination of structured preparation throughout the lifecycle"\n'
    +'COMPETITIVE FRAMING: "eliminates the mobilization delays inherent to out-of-state competitors" | "strategic advantage, not a capacity concern"\n'
    +'AVOID: Generic AI language. Never say "comprehensive" or "holistic" without specific evidence. Never use "leverage" as a verb without naming what is leveraged. Never say "cutting-edge" or "state-of-the-art."\n'
    +'TONE: Authoritative, specific, confident, direct. Short sentences for impact. Longer sentences for technical detail. No filler.',
    'pattern');

  // PERSONNEL BIO PATTERNS  
  await mem('proposal_agent','personnel_bios,staffing,learning_loop',
    'KEY PERSONNEL BIO FORMAT (from St. George Draft v2):\n'
    +'RULE 1: Always name real people. Never TBD unless Christopher approves.\n'
    +'RULE 2: Summary table first with all key personnel (Role | Name | Rate | One-line qualification).\n'
    +'RULE 3: Full bio for each person. Format: Name with credentials after name (PMP, CQE, Esq.). Years of experience first sentence. Most impressive credential second sentence. Specific programs/accomplishments. Education only if notable (Tulane JD, Penn State BS Engineering).\n'
    +'RULE 4: Additional named staff as one-liners: "Name — Title. X+ years [specialty]. [Most notable accomplishment]."\n'
    +'RULE 5: Include a team callout line: "The combined FEMA PA experience of HGI\'s named personnel exceeds 100 years."\n'
    +'CONFIRMED KEY PERSONNEL (use these for disaster recovery proposals):\n'
    +'- Louis J. Resweber, CEO — Program Director — '+D+'210/hr — 40+ yrs exec leadership\n'
    +'- Mark J. Berron, PMP, CQE, LSSBB — PA SME — '+D+'200/hr — 30+ yrs incl 18 yrs FEMA employee\n'
    +'- April R. Gloston — HM Specialist / Sr Grant Mgr — '+D+'180/hr — 15+ yrs CDBG-DR/FEMA/HMGP\n'
    +'- Carl E. Klunk — Financial/Grant Specialist — '+D+'180/hr — 30+ yrs engineering + federal grants\n'
    +'- Lynn L. Wiltz, Esq. — Documentation Manager — '+D+'175/hr — 20+ yrs FEMA PA, 1200+ PWs, Tulane JD\n'
    +'- Keith A. Dupont, PMP — Sr PM — 34+ yrs, former FEMA Region VII Director of Recovery\n'
    +'- Dillon T. Truax — VP/PM — 15+ yrs, completed TPSD, Restore LA, ReBuild NC\n'
    +'- Scott J. Griffith — Construction Mgr — 30+ yrs, leads HGI CM Division\n'
    +'- Rudy A. Nurse Corso — Cost Estimator — 15+ yrs RSMeans, FEMA cost eligibility\n'
    +'- Stephanie A. Heher — Appeals Specialist — 25+ yrs, NEPA/NHPA/ESA/FEMA EHP\n'
    +'- Andrew V. Caubarreaux IV, AIA NCARB — Sr Damage Assessor — 30+ yrs, GOHSEP',
    'pattern');

  // PAST PERFORMANCE REFERENCE FORMAT
  await mem('proposal_agent','past_performance,references,learning_loop',
    'PAST PERFORMANCE REFERENCE FORMAT (from St. George Draft v2):\n'
    +'Each reference must include a structured table:\n'
    +'Client: [Full legal name]\n'
    +'HGI Contract Value: [Exact dollar amount]\n'
    +'Federal Funds Administered: [If applicable — total program size]\n'
    +'Period: [Start–End with sub-periods if role changed]\n'
    +'Funding Source: [HUD CDBG-DR / FEMA PA / etc.]\n'
    +'FEMA Closeout: [Status — explicitly state zero misallocated if true]\n'
    +'Audit History: [Explicitly state zero adverse findings if true]\n'
    +'Reference: [Name — email — phone] (MINIMUM TWO per reference)\n\n'
    +'Then narrative paragraph with KEY RESULTS using specific numbers.\n'
    +'Then RELEVANCE TO [THIS CLIENT] statement — explicitly connect to this specific RFP scope.\n\n'
    +'CONFIRMED REFERENCES WITH CONTACTS:\n'
    +'Road Home: Paul Rainwater — rainwater97@gmail.com — (225) 281-8176 | Jeff Haley, COO OCD — jeff.haley@la.gov — (225) 330-0036\n'
    +'Restore LA: Pat Forbes, Exec Dir OCD — Patrick.Forbes@la.gov — (225) 342-1626\n'
    +'TPSD: A. Bubba Orgeron — bubbaorgeron@tpsd.org — (985) 876-7400 | Gregory W. Harding — gregoryharding@tpsd.org — (985) 688-0052',
    'pattern');

  // PRICING RULES
  await mem('financial_agent','pricing,rate_card,learning_loop',
    'PRICING RULES FOR PROPOSALS (from St. George Draft v2):\n'
    +'RULE 1: Start from HGI confirmed rate card. NEVER invent discounted rates.\n'
    +'RULE 2: Rates are fully burdened — labor, overhead, profit, travel, admin.\n'
    +'RULE 3: Rates firm for contract base period (typically 3 years).\n'
    +'RULE 4: No percentage-based compensation unless RFP requires it.\n'
    +'RULE 5: Map RFP position titles to HGI rate card positions. If no exact match, map to nearest equivalent and note the mapping.\n'
    +'RULE 6: Always include the cost score formula if stated in the RFP (e.g. CS = Lowest/Proposer x Points).\n'
    +'RULE 7: Non-labor costs billed at cost without markup upon client approval.\n'
    +'St. George rate mapping: Construction Manager mapped to Sr PM rate ('+D+'180). Resident Inspector mapped to Sr Damage Assessor ('+D+'115).\n'
    +'Flag [ACTION REQUIRED] for Christopher to review and approve rates before submission.',
    'pattern');

  // TECHNICAL APPROACH PATTERNS
  await mem('proposal_agent','technical_approach,methodology,learning_loop',
    'TECHNICAL APPROACH WRITING PATTERN (from St. George Draft v2):\n'
    +'RULE 1: Section header references RFP section AND point value: "*RFP Section V.D | Evaluation Criteria: Technical Capabilities — 30 of 100 Points (Highest Weighted)*"\n'
    +'RULE 2: Open with HGI three principles (eligibility engineered, compliance embedded, documentation audit-ready).\n'
    +'RULE 3: Name specific failure points the methodology prevents — "incomplete Damage Description and Dimensions, scope language misaligned with actual construction, insurance proceeds not reconciled correctly, procurement files insufficient under 2 CFR Part 200"\n'
    +'RULE 4: Use FEMA-specific terminology — PW (Project Worksheet), PAPPG, CEF (Cost Estimating Format), DAC, RFI, Categories A-G, Sections 404/406/428, Stafford Act, Uniform Guidance, 2 CFR Part 200.\n'
    +'RULE 5: Name specific deliverables — "Portfolio Stabilization & Risk Exposure Report" not generic "assessment report."\n'
    +'RULE 6: Include activation timeline (24-48 hours for new disasters, 30-day Portfolio Stabilization for existing).\n'
    +'RULE 7: Subsections must match RFP scope: D.1 Activation, D.2 FEMA PA (Cat A-G), D.3 Hazard Mitigation (404/406), D.4 CDBG-DR, D.5 Grant & Financial Compliance, D.6 Strategic Advisory, D.7 Staffing Plan.\n'
    +'RULE 8: Staffing plan table: Phase | Timeline | Core Staff | Surge Staff | Key Activities\n'
    +'RULE 9: Reference specific disaster declarations by number (DR-4277, DR-4611, DR-4817 for St. George).\n'
    +'RULE 10: Close technical section with a deliverable or value statement, not a generic summary.',
    'pattern');

  // EXHIBIT AND COMPLIANCE PATTERNS
  await mem('quality_gate','exhibits,compliance,submission,learning_loop',
    'EXHIBIT AND SUBMISSION CHECKLIST PATTERN (from St. George Draft v2):\n'
    +'Every proposal must include a compliance tracking table for required exhibits:\n'
    +'Exhibit | Description | Status (ATTACHED/PENDING) | Action Needed (Notarization/Signature/None)\n'
    +'Candy LeBlanc Dottolo is Designated Signature Authority for all proposals.\n'
    +'Insurance certificate table: Coverage | RFP Minimum | HGI Coverage | Compliance (COMPLIANT/EXCEEDS Xx)\n'
    +'Producer: Sara Piro, McClure Bomar and Harris LLC, (318) 869-2525, sarapiro@mbhinsurance.com\n'
    +'Always verify: (1) Certificate holder address matches RFP address (2) Policy dates cover contract period (3) All required coverages present\n'
    +'Flag any discrepancies as [ACTION REQUIRED] for Christopher.\n'
    +'CAGE Code: 47G60 (add to all proposals alongside UEI).\n'
    +'SAM.gov registration: Active, UEI DL4SJEVKZ6H4, expires March 3, 2027.',
    'pattern');

  return res.status(200).json({success:true, memories_seeded: 6, purpose: 'Proposal DNA extracted from StGeorge_Proposal_COMPLETE_DRAFT_v2.docx — teaches organism how Christopher writes proposals'});
}