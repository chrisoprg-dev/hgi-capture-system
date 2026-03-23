// api/hgi-master-context.js
// SINGLE SOURCE OF TRUTH — HGI company context for all agents and scrapers.
// All agent files import from here. Never hardcode HGI context in individual files.
// To update HGI capabilities: edit this file only. All files using it update automatically.
// Last updated: Session 30 | March 23, 2026
// Source: Official HGI Corporate Profile + Capabilities Statement (both in KB)

var d = String.fromCharCode(36);

// ═══ COMPLETE HGI CONTEXT — used by all agents for scoring, analysis, proposals ═══
export var HGI_CONTEXT =
  'HGI Global, Inc. / Hammerman & Gainer LLC — Founded 1929, 96+ years in business.\n' +
  '100% Minority-Owned (NMSDC Certified). SAM UEI: DL4SJEVKZ6H4.\n' +
  'Staff: ~67 FT + 43 contract professionals. Offices: Kenner (HQ), Shreveport, Alexandria, New Orleans.\n' +
  'Insurance: ' + d + '5M fidelity bond, ' + d + '5M E&O, ' + d + '2M GL (' + d + '1M per occurrence/' + d + '2M aggregate).\n' +
  'NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190.\n' +
  'Geography: Louisiana, Texas, Florida, Mississippi, Alabama, Georgia, Federal programs.\n' +
  'CRITICAL: HGI has NEVER had a direct federal contract. All work flows through state/local agencies, housing authorities, and insurance entities.\n' +
  '\n4 PRIMARY BUSINESS LINES (from official Corporate Profile):\n' +
  '(1) Disaster Recovery / Grants & Program Management\n' +
  '(2) Construction / Construction Management\n' +
  '(3) Third Party Administration\n' +
  '(4) Claims Management\n' +
  '\nTHIRD PARTY ADMINISTRATION & CLAIMS MANAGEMENT:\n' +
  '- Claims Management: Automobile, General Liability, Workers Compensation\n' +
  '- TPA Services: Investigations, claims administration, litigation management, settlement resolutions, third party subrogation, worksite safety inspections, waste & abuse identification, loss control analysis, fraud identification and investigation\n' +
  '- Cost Containment Services: Early intervention, utilization review, vocational rehabilitation, return-to-work programs, bill review/re-pricing\n' +
  '- Property Claims: Fire/flood/wind, snow/winter storms, hurricanes/earthquakes/mudslides, commercial/lessors/lessees claims, residential/homeowners/mobile home claims\n' +
  '- Managed Care (WC/liability context ONLY — NOT standalone health): Medical analysis/audit, pharmacy benefit management (PBM), medical & nursing case management, cost management/strategic consulting, tele-medicine, telephonic nurse triage\n' +
  '- Self-Insured Claims Management\n' +
  '- Insurance Guaranty Association administration (TPCIGA 20+ years Texas, LIGA Louisiana)\n' +
  '- Mediation Services: 20,000+ cases coordinated, property damage and personal injury, AIG Insurance\n' +
  '- Class Action & Multi-State Settlement Administration: 1M+ claims (BP GCCF/Deepwater Horizon, Kenneth Feinberg)\n' +
  '- Risk Management consulting\n' +
  '- Ad Valorem Tax Appeal Claims\n' +
  '- Governmental & Corporate Consulting\n' +
  '- DEI Initiatives (Diversity, Equity & Inclusion programs and consulting)\n' +
  '\nSTAFF AUGMENTATION & OPERATIONS:\n' +
  '- Staff Augmentation — Onsite & Virtual (any client, any vertical)\n' +
  '- Call Centers — Inbound & Outbound (demonstrated: 750,000+ calls serviced on Road Home)\n' +
  '- Business Process Outsourcing\n' +
  '- Customer Service Staffing\n' +
  '\nDISASTER RESPONSE & RECOVERY / GRANTS & PROGRAM MANAGEMENT:\n' +
  '- CDBG-DR, FEMA Public Assistance (PA Cat A-G), HMGP, BRIC program administration\n' +
  '- Application intake & processing, eligibility reviews, adjudication and appeals\n' +
  '- Damage assessments, inspections, environmental damage assessment\n' +
  '- Abstracting & recordings, easements, titles, closings (62,000+ closings on Road Home)\n' +
  '- Housing Assistance Centers, disaster housing operations\n' +
  '- Accounting, internal controls, audit support and documentation\n' +
  '- Fiduciary / disbursement of funds\n' +
  '- Anti-Fraud, Waste & Abuse (AFWA) programs\n' +
  '- QA/QC, regulatory compliance, monitoring, reporting\n' +
  '- Real estate appraisals & property valuations\n' +
  '- Plan implementation, management, closeout\n' +
  '- HUD compliance, CDBG (disaster and non-disaster), federal funding procurement & grant management\n' +
  '- Duplication of Benefits determination & mitigation\n' +
  '- Contact Tracing (COVID-19 statewide Louisiana program)\n' +
  '- Public relations, community outreach, applicant relations\n' +
  '\nCONSTRUCTION MANAGEMENT / CONTRACTING:\n' +
  '- Cost management, scheduling oversight, construction bid evaluation\n' +
  '- Earned Value Management, Change Order Determination\n' +
  '- Critical Path Method (CPM) scheduling\n' +
  '- Performance & productivity assessments, constructibility reviews, contract risk analysis\n' +
  '- Federal oversight for HUD/DOT/FTA funded projects\n' +
  '- IMPORTANT: HGI manages and oversees construction programs — does NOT perform physical construction work\n' +
  '\nWORKFORCE DEVELOPMENT:\n' +
  '- WIOA Title I, II, III, IV program administration\n' +
  '- Job readiness, talent pipelining, career placement, occupational training\n' +
  '- Employer engagement, life skills development, self-sufficiency resourcing\n' +
  '- Workforce recruitment initiatives, challenged community outreach\n' +
  '- Program creation and management, policy & procedures development\n' +
  '- Women/minority-owned certifications, diversity & hardship case management\n' +
  '- Regulatory compliance, metrics monitoring, budget & schedule development/reporting\n' +
  '- Unemployment Insurance Claims: inputting, processing, investigations, adjudication (15,250+ adjudicated)\n' +
  '\nPROGRAM ADMINISTRATION (federal/state — NOT healthcare benefits/Medicaid):\n' +
  '- Case advisory, document administration, PMO\n' +
  '- Workers Compensation / Disability Claims (within program context)\n' +
  '- Applicant relations and community outreach\n' +
  '\nHOUSING / HUD:\n' +
  '- Housing authority program management, HUD compliance monitoring\n' +
  '- HOME program administration, Section 8/Housing Choice Voucher administration\n' +
  '- HMGP housing recovery, fair housing compliance programs\n' +
  '\nGRANT MANAGEMENT:\n' +
  '- Federal/state/local grant administration (all phases, pre-award through closeout)\n' +
  '- Sub-recipient monitoring, reporting, Single Audit preparation\n' +
  '\nCONFIRMED PAST PERFORMANCE (use exactly as written):\n' +
  '- Road Home Program: ' + d + '67M direct / ' + d + '13B+ program, zero misappropriation (2006-2015)\n' +
  '- HAP (Homeowner Assistance Program): ' + d + '950M\n' +
  '- Restore Louisiana: ' + d + '42.3M CDBG-DR\n' +
  '- Rebuild New Jersey: ' + d + '67.7M\n' +
  '- BP GCCF (Deepwater Horizon class action/settlement admin): ' + d + '1.65M, 1M+ claims, Kenneth Feinberg (2010-2013)\n' +
  '- PBGC (Pension Benefits Guaranty Corp): 34M beneficiaries, 50 professionals, 5+ years, trust & claims services\n' +
  '- TPCIGA (Texas P&C Insurance Guaranty Association): 20+ years, insolvent insurer P&C claims\n' +
  '- LIGA (Louisiana Insurance Guaranty Association): guaranty fund administration\n' +
  '- City of New Orleans WC TPA: ' + d + '283K/month (ACTIVE)\n' +
  '- SWBNO Billing Appeals: ' + d + '200K/month (ACTIVE)\n' +
  '- TPSD (Terrebonne Parish School Board): ' + d + '2.96M construction management, 2022-2025 (COMPLETED — past tense only, never list as active)\n' +
  '- St. John Sheriff: ' + d + '788K\n' +
  '- AIG Insurance: 20,000+ mediation cases coordinated, property damage and personal injury\n' +
  '- COVID-19 Contact Tracing: statewide Louisiana\n' +
  '- Unemployment Claims: 15,250+ adjudicated\n' +
  'DO NOT LIST without Christopher confirmation: PBGC contract value, Orleans Parish School Board\n' +
  '\nWHAT HGI IS NOT / DOES NOT DO (filter immediately — do not score positively):\n' +
  '- Medicaid, clinical health services, behavioral health, substance abuse treatment, eating disorders, cancer surveillance, public health programs\n' +
  '- Health insurance administration or standalone health TPA (NOTE: health care COMPANIES hire HGI for WC/liability TPA — HGI is NOT a health care provider or Medicaid administrator)\n' +
  '- Physical construction, debris removal, demolition, road clearing, dredging, grass maintenance\n' +
  '- Insurance brokerage (selling or placing insurance)\n' +
  '- Direct federal contracting (all work through state/local intermediaries)\n' +
  '- IT services, software development, engineering or architectural design\n' +
  '- Environmental remediation or cleanup\n' +
  '- Equipment rental, materials procurement, supply chain\n' +
  '\nCLIENTS SERVED:\n' +
  'Public: Federal programs (via state/local), State agencies, County/Parish, Municipal governments, Housing Authorities, School Boards\n' +
  'Private: Insurance companies and guaranty associations, Construction firms, Corporations\n' +
  'NOTE: Health care companies are CLIENTS who hire HGI for TPA/claims administration — this is NOT a health care service vertical';

// ═══ RATE CARD ═══
export var HGI_RATES =
  'Principal ' + d + '220 | Program Director ' + d + '210 | SME ' + d + '200 | Sr Grant Mgr ' + d + '180 | Grant Mgr ' + d + '175 | Sr PM ' + d + '180 | PM ' + d + '155 | Grant Writer ' + d + '145 | Architect/Engineer ' + d + '135 | Cost Estimator ' + d + '125 | Appeals Specialist ' + d + '145 | Sr Damage Assessor ' + d + '115 | Damage Assessor ' + d + '105 | Admin Support ' + d + '65\n' +
  'PRICING RULE: Never copy rate card as-is. Build pricing from specific RFP positions. Match RFP titles exactly. Adapt to competitive landscape and agency budget expectations.';

// ═══ CONFIRMED REFERENCES — never question, flag, or suggest replacing ═══
export var HGI_REFERENCES =
  'Paul Rainwater: rainwater97@gmail.com, (225) 281-8176 — Road Home Program reference.\n' +
  'Jeff Haley, COO Louisiana OCD: jeff.haley@la.gov, (225) 330-0036 — Road Home Program reference.\n' +
  'Pat Forbes, Executive Director OCD: Patrick.Forbes@la.gov, (225) 342-1626 — Restore Louisiana reference.\n' +
  'Bubba Orgeron, TPSD: bubbaorgeron@tpsd.org, (985) 876-7400 — TPSD FEMA PA reference.\n' +
  'Gregory Harding, TPSD: gregoryharding@tpsd.org, (985) 688-0052 — TPSD FEMA PA reference.';

// ═══ COMPLETE KEYWORD LIST — covers full HGI business universe for ALL scrapers ═══
// Use for: scrape-grants-gov.js, hunt.js, Apify actor, any new scraper added
export var HGI_KEYWORDS = [
  // Disaster / Recovery / Grants
  'disaster recovery',
  'CDBG-DR',
  'FEMA public assistance',
  'hazard mitigation',
  'housing recovery',
  'flood recovery',
  'hurricane recovery',
  'disaster housing',
  'homeowner assistance program',
  'community development block grant',
  'emergency management program',
  'disaster response services',
  // TPA / Claims Administration
  'claims administration',
  'third party administrator',
  'TPA services',
  'workers compensation claims administration',
  'workers compensation TPA',
  'property casualty claims',
  'insurance guaranty association',
  'self-insured claims management',
  'liability claims management',
  'claims processing services',
  'insurance claims administration',
  'casualty claims management',
  // Settlement / Mediation / Class Action
  'class action settlement administration',
  'settlement administration',
  'mass tort administration',
  'mediation services',
  'dispute resolution services',
  'alternative dispute resolution',
  'claims fund administration',
  'mass claims processing',
  // Program Management / Grants
  'program administration services',
  'program management services',
  'grant management',
  'federal grant administration',
  'grant administration services',
  'compliance monitoring services',
  'sub-recipient monitoring',
  'program oversight services',
  'federal program management',
  // Workforce
  'workforce development',
  'WIOA',
  'workforce services',
  'job training program',
  'career placement services',
  'unemployment adjudication',
  'workforce innovation opportunity act',
  'employment services program',
  // Construction Management
  'construction management services',
  'construction oversight',
  'capital program management',
  'project management services',
  'construction program management',
  // Housing / HUD
  'housing authority management',
  'HUD compliance',
  'affordable housing program',
  'public housing management',
  'housing assistance program',
  'housing program management',
  'housing authority',
  // Staff Augmentation / Call Centers / BPO
  'staff augmentation',
  'call center operations',
  'contact center services',
  'customer service staffing',
  'business process outsourcing',
  'case management services',
  'administrative staffing services',
  // Property Tax / Billing Appeals
  'property tax appeals',
  'ad valorem tax services',
  'billing appeals services',
  'utility billing appeals',
  'revenue recovery services',
  'assessment appeals',
  // DEI / Consulting
  'diversity equity inclusion',
  'DEI program services',
  'minority business consulting',
  'community outreach program',
  'governmental consulting',
  'corporate consulting services'
];

// ═══ SUB-VERTICAL CLASSIFICATION GUIDE — for scope analysis and OPI scoring ═══
// Use this to determine if an opportunity is HGI core, adjacent, or excluded
export var HGI_CLASSIFICATION_GUIDE =
  'HGI CORE WORK (score 70-95): workers comp TPA, property casualty TPA, insurance guaranty administration, ' +
  'FEMA PA grant management, CDBG-DR program administration, disaster recovery program management, ' +
  'property tax appeals, ad valorem billing disputes, workforce WIOA administration, ' +
  'construction MANAGEMENT/oversight (not physical construction), housing authority program management, ' +
  'HUD compliance, grant management, class action and mass settlement administration, ' +
  'mediation services coordination, staff augmentation, call center operations, BPO, ' +
  'DEI consulting, unemployment claims adjudication, contact tracing, AFWA programs, ' +
  'real estate appraisals (in program context), abstracting/title/closing services (in housing recovery context), ' +
  'managed care services in WC/liability context (PBM, nurse case mgmt, tele-medicine), ' +
  'self-insured claims management, risk management consulting, governmental consulting.\n' +
  '\nHGI ADJACENT (score 40-69): general program consulting, administrative services, ' +
  'compliance services (varies by scope), public administration support.\n' +
  '\nNOT HGI — filter immediately (score below 25 regardless of other factors):\n' +
  '- Medicaid, clinical health, behavioral health, substance abuse, cancer programs, public health\n' +
  '- Physical construction, debris removal, demolition, road clearing, equipment rental\n' +
  '- Insurance brokerage or selling insurance\n' +
  '- IT services, software, engineering design, architecture\n' +
  '- Environmental remediation\n' +
  '- Supply chain, materials procurement\n' +
  'CRITICAL DISTINCTION FOR INFRASTRUCTURE: Physical sewer pipe installation = NOT HGI. ' +
  'Program management/grant administration FOR a sewer project = HGI. ' +
  'Read the scope carefully before scoring infrastructure opportunities.\n' +
  'CRITICAL DISTINCTION FOR HEALTH: Health care companies hiring HGI for WC TPA = HGI CORE. ' +
  'Medicaid administration, clinical health services, behavioral health = NOT HGI.';
