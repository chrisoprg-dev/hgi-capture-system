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
  
  // 1. PROPOSAL STRUCTURE — baseline format, not a template to copy
  await mem('proposal_agent','proposal_structure,learning_loop',
    'PROPOSAL STRUCTURE BASELINE (learned from St. George Draft v2 — first draft level, organism must exceed this):\n'
    +'This is the minimum standard for a first draft. The organism should produce this quality or better autonomously so Christopher reviews and refines instead of building from scratch.\n\n'
    +'SECTIONS IN ORDER:\n'
    +'1. Cover page (agency + contact, HGI info, RFP number, date, SAM UEI, CAGE 47G60)\n'
    +'2. Transmittal letter (addressed to procurement contact by name, key credential in first para, confirmation bullets, signed by Christopher)\n'
    +'3. Sections mapped to RFP eval criteria — EVERY section header must reference the RFP section number AND eval criteria point value so evaluators can score directly\n'
    +'4. Key Personnel (summary table then full bios — see personnel memory)\n'
    +'5. Past Performance (structured reference tables with contacts — see PP memory)\n'
    +'6. Technical Approach (built specific to THIS RFP scope — see technical memory)\n'
    +'7. Current Workload & Capacity\n'
    +'8. Conflict of Interest Disclosure (specific disclosures, not generic)\n'
    +'9. Pricing (built specific to THIS RFP — see pricing memory)\n'
    +'10. Required Exhibits with status tracking (signature/notarization needed)\n'
    +'11. Insurance certificates with compliance table\n\n'
    +'CRITICAL: This structure adapts to each RFP. If the RFP specifies a different order or different sections, follow the RFP. The organism reads the RFP first, builds the structure from that, then fills it.',
    'pattern');

  // 2. LANGUAGE AND VOICE — not Christopher's voice, the WINNING voice
  await mem('content_engine','voice,style,proposal_language,learning_loop',
    'PROPOSAL LANGUAGE PRINCIPLES — THE GOAL IS TO WIN, NOT TO SOUND LIKE ANY ONE PERSON:\n\n'
    +'RULE 1: Every proposal is written for a specific audience — the evaluation committee for THIS RFP at THIS agency. Research who they are, what they value, how they talk about their work. Match that.\n'
    +'RULE 2: Use the highest standard of industry language and subject matter expertise for the domain. A FEMA PA proposal uses FEMA terminology. A workforce/WIOA proposal uses DOL terminology. A housing authority proposal uses HUD terminology. Research the domain via web to ensure current best practices and terminology.\n'
    +'RULE 3: Be specific, never generic. Name programs, dollar amounts, staff counts, years, outcomes. "165,000+ claims managed" not "extensive experience managing claims."\n'
    +'RULE 4: Every claim must be backed by evidence from the KB or verifiable fact. No filler. No empty superlatives.\n'
    +'RULE 5: Confident and direct without arrogance. Show why HGI wins through evidence, not adjectives.\n'
    +'RULE 6: Competitive framing should be subtle but clear — position HGI advantages against what competitors typically lack without naming them.\n'
    +'RULE 7: The organism must use BOTH memory (HGI KB, past proposals, organism intelligence) AND live web research (industry standards, agency culture, domain expertise, competitive landscape) to produce language that is better than either source alone.\n'
    +'RULE 8: No pride of authorship. If web research surfaces better language, better methodology descriptions, better frameworks than what HGI has used before — use them. The goal is the best possible proposal, period.\n'
    +'AVOID: "comprehensive", "holistic", "cutting-edge", "state-of-the-art", "leverage" without specifics, any language that sounds like AI wrote it.',
    'pattern');

  // 3. PERSONNEL — format is solid, people are assigned per-opportunity
  await mem('proposal_agent','personnel,staffing,recruitment,learning_loop',
    'KEY PERSONNEL RULES FOR PROPOSALS:\n\n'
    +'RULE 1: Personnel are assigned PER OPPORTUNITY through a recruitment process. Do NOT copy staff from one proposal to another without confirmation. The St. George draft used HTHA personnel as PLACEHOLDERS only.\n'
    +'RULE 2: When personnel are not yet confirmed, flag as [RECRUITMENT PENDING — placeholder from prior proposal] so Christopher and the team know these are not final assignments.\n'
    +'RULE 3: Real recruitment for each opportunity involves matching RFP-required roles to available HGI staff + bench + subcontractor network. The recruiting_bench agent supports this.\n\n'
    +'BIO PRESENTATION FORMAT (this format works — use it once people are assigned):\n'
    +'- Summary table first: Role | Name with credentials | Rate | One-line qualification\n'
    +'- Full bio per person: Years of experience, most impressive credential, specific programs, education if notable\n'
    +'- Additional named staff as one-liners\n'
    +'- Team strength callout (e.g. "combined experience exceeds 100 years")\n\n'
    +'HGI CONFIRMED STAFF BENCH (available for assignment — not auto-assigned):\n'
    +'Louis J. Resweber (CEO, 40+ yrs exec), Mark J. Berron PMP CQE (30+ yrs incl 18 FEMA), April R. Gloston (15+ yrs CDBG-DR/FEMA/HMGP), Carl E. Klunk (30+ yrs engineering/grants), Lynn L. Wiltz Esq (20+ yrs FEMA PA, Tulane JD), Keith A. Dupont PMP (34+ yrs, former FEMA Region VII), Dillon T. Truax VP (15+ yrs), Scott J. Griffith (30+ yrs construction), Rudy A. Nurse Corso (15+ yrs cost estimating), Stephanie A. Heher (25+ yrs appeals), Andrew V. Caubarreaux IV AIA NCARB (30+ yrs)\n'
    +'Christopher J. Oney — President, executive oversight on all engagements.',
    'pattern');

  // 4. PAST PERFORMANCE — structured format works, use RFP form if provided
  await mem('proposal_agent','past_performance,references,learning_loop',
    'PAST PERFORMANCE REFERENCE FORMAT (this format is effective — evaluators can score directly from it):\n\n'
    +'Each reference presented as structured table:\n'
    +'Client | HGI Contract Value | Federal Funds (if applicable) | Period | Funding Source | FEMA Closeout Status | Audit History | Reference contacts (name, email, phone — minimum 2 per reference)\n'
    +'Followed by: narrative paragraph with KEY RESULTS using specific numbers\n'
    +'Followed by: RELEVANCE TO [THIS CLIENT] — explicitly connect this experience to THIS specific RFP scope\n\n'
    +'IMPORTANT: If the RFP provides its own reference form or format, use THEIRS exactly and supplement with the structured table.\n\n'
    +'CONFIRMED REFERENCES WITH CONTACTS:\n'
    +'Road Home: Paul Rainwater — rainwater97@gmail.com — (225) 281-8176 | Jeff Haley COO OCD — jeff.haley@la.gov — (225) 330-0036\n'
    +'Restore LA: Pat Forbes Exec Dir OCD — Patrick.Forbes@la.gov — (225) 342-1626\n'
    +'TPSD: A. Bubba Orgeron — bubbaorgeron@tpsd.org — (985) 876-7400 | Gregory W. Harding — gregoryharding@tpsd.org — (985) 688-0052\n\n'
    +'Select references most relevant to each specific RFP scope. Not every proposal uses the same references.',
    'pattern');

  // 5. PRICING — rate card is reference point, rates built per-RFP
  await mem('financial_agent','pricing,rate_card,competitive_pricing,learning_loop',
    'PRICING RULES FOR PROPOSALS — RATES ARE BUILT PER OPPORTUNITY, NOT COPIED FROM RATE CARD:\n\n'
    +'The HGI rate card is a REFERENCE POINT, not the answer. Every proposal pricing is built specific to the opportunity based on:\n'
    +'- Eval criteria weighting (price at 10% means compete on technical; price at 40% means sharpen rates)\n'
    +'- Competitive field (who is bidding, what are their typical rates)\n'
    +'- Agency budget reality (municipal vs state vs federal budget capacity)\n'
    +'- Scope complexity (higher complexity justifies higher rates)\n'
    +'- Contract structure (MSA/task order vs firm fixed price vs T&M)\n'
    +'- Market rates for this geography and domain (use web research)\n'
    +'- What it takes to WIN — price-to-win analysis\n\n'
    +'The organism MUST research comparable contract awards, competitor pricing patterns, and agency budget data via web search to inform pricing recommendations.\n\n'
    +'HGI RATE CARD (reference only — '+D+'220 Principal, '+D+'210 PD, '+D+'200 SME, '+D+'180 Sr Grant/Sr PM, '+D+'175 Grant Mgr, '+D+'155 PM, '+D+'145 Grant Writer/Appeals, '+D+'135 Architect, '+D+'125 Cost Est, '+D+'115 Sr Damage, '+D+'105 Damage, '+D+'65 Admin)\n\n'
    +'RULES:\n'
    +'- Rates fully burdened — labor, overhead, profit, travel, admin\n'
    +'- Map RFP position titles to nearest HGI equivalent and note the mapping\n'
    +'- Include RFP cost score formula if stated\n'
    +'- Flag [ACTION REQUIRED] for Christopher to review and approve all rates before submission\n'
    +'- No percentage-based compensation unless RFP specifically requires it\n'
    +'- Christopher makes final pricing decisions. The organism recommends with analysis.',
    'pattern');

  // 6. TECHNICAL APPROACH — built per-RFP from domain research + KB
  await mem('proposal_agent','technical_approach,methodology,domain_expertise,learning_loop',
    'TECHNICAL APPROACH — BUILT SPECIFIC TO EACH RFP, NOT TEMPLATED:\n\n'
    +'Every opportunity is different. Not every opportunity is FEMA. The technical approach must be built from THREE sources combined:\n\n'
    +'SOURCE 1 — THE RFP: Read every word. Extract exactly what they ask for. Map each requirement to a response section. Match the RFP structure if one is specified.\n'
    +'SOURCE 2 — LIVE WEB RESEARCH: Research the highest industry standards and best practices for THIS specific domain. What does best-in-class methodology look like for this type of work? What terminology do experts in this field use? What are current regulatory requirements? What frameworks or standards apply?\n'
    +'SOURCE 3 — HGI KB: Pull everything relevant from the knowledge base — past performance on similar work, methodologies used, outcomes achieved, lessons learned. Connect HGI experience to THIS scope.\n\n'
    +'The organism COMBINES all three to produce a technical approach that demonstrates both subject matter expertise AND HGI-specific capability. Neither web research alone nor KB alone produces a winning proposal.\n\n'
    +'FORMAT RULES:\n'
    +'- Section header references RFP section AND eval criteria point value\n'
    +'- Subsections must match what the RFP asks for — do not impose a generic structure\n'
    +'- Use correct domain terminology (FEMA terms for FEMA work, DOL terms for workforce, HUD terms for housing, etc.)\n'
    +'- Name specific deliverables, not generic ones\n'
    +'- Include activation/mobilization timeline appropriate to scope\n'
    +'- Staffing plan table if applicable: Phase | Timeline | Core | Surge | Activities\n'
    +'- Reference agency-specific details (disaster declaration numbers, program names, local context)\n'
    +'- Close with value statement tied to evaluator priorities, not generic summary',
    'pattern');

  // 7. EXHIBITS AND COMPLIANCE
  await mem('quality_gate','exhibits,compliance,submission,learning_loop',
    'EXHIBIT AND SUBMISSION COMPLIANCE (applies to all proposals):\n\n'
    +'Every proposal must track required exhibits/attachments with status:\n'
    +'Exhibit | Description | Status (ATTACHED/PENDING) | Action Needed (Notarization/Signature/None)\n'
    +'Candy LeBlanc Dottolo is Designated Signature Authority for all proposals.\n\n'
    +'Insurance compliance table: Coverage | RFP Minimum | HGI Coverage | Status (COMPLIANT/EXCEEDS)\n'
    +'Insurance producer: Sara Piro, McClure Bomar and Harris LLC, (318) 869-2525, sarapiro@mbhinsurance.com\n'
    +'Always verify: certificate holder address matches RFP, policy dates cover contract period, all coverages present\n\n'
    +'Flag ANY discrepancies as [ACTION REQUIRED] for Christopher.\n'
    +'CAGE Code: 47G60. SAM UEI: DL4SJEVKZ6H4. SAM expires March 3, 2027.\n\n'
    +'CRITICAL: The organism must read EVERY exhibit requirement in the RFP and confirm each is addressed. Missing a single required form can disqualify the entire submission.',
    'pattern');

  // 8. META — HOW THE ORGANISM GENERATES PROPOSALS
  await mem('self_awareness','proposal_generation,organism_method,learning_loop',
    'HOW THE ORGANISM GENERATES WINNING PROPOSALS — THE METHOD:\n\n'
    +'The goal is to produce a first draft that Christopher reviews and refines, not builds from scratch. The organism does the work of a full capture team.\n\n'
    +'STEP 1: READ THE RFP. Every word. Extract eval criteria with point values, required sections, required forms, submission instructions, scope of work, minimum qualifications, insurance requirements, pricing structure.\n'
    +'STEP 2: RESEARCH THE DOMAIN via web. What does best-in-class look like for this type of work? Who are the likely competitors? What has this agency awarded before? What is the agency culture?\n'
    +'STEP 3: PULL FROM KB. What HGI experience is most relevant to this specific scope? Which past performance references align best? Which staff have done this work?\n'
    +'STEP 4: PULL FROM ORGANISM MEMORY. What has the intelligence engine, CRM agent, financial agent learned about this agency, this competitive field, this market?\n'
    +'STEP 5: BUILD THE PROPOSAL. Combine all four inputs. Structure follows the RFP. Language is the best possible for this domain and audience. Every claim backed by evidence. Every section mapped to eval criteria.\n'
    +'STEP 6: QUALITY GATE. Audit against every RFP requirement. Flag gaps. Flag [ACTION REQUIRED] items for Christopher.\n'
    +'STEP 7: STORE AND LEARN. After Christopher edits, the changes flow back into memory so the next proposal is better.\n\n'
    +'The proposal is NOT memory regurgitation. It is NOT web research pasted in. It is the SYNTHESIS of HGI-specific intelligence + domain expertise + competitive analysis + RFP-specific requirements into one document that scores highest against the evaluation criteria.',
    'pattern');

  return res.status(200).json({success:true, memories_seeded: 8, purpose: 'Corrected proposal DNA — rates built per-RFP, language optimized to win not to match a voice, personnel assigned per-opportunity, technical approach domain-specific, web+memory combined'});
}