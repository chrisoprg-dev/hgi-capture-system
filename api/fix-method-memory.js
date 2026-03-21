export const config = { maxDuration: 30 };
var SB = process.env.SUPABASE_URL;
var SK = process.env.SUPABASE_SERVICE_KEY;
var H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
function mid(){ return 'om-dna-' + Date.now() + '-' + Math.random().toString(36).slice(2,6); }
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  
  await fetch(SB+'/rest/v1/organism_memory',{method:'POST',headers:H,body:JSON.stringify({id:mid(),agent:'self_awareness',opportunity_id:null,entity_tags:'proposal_generation,organism_method,learning_loop,ai_as_writer',observation:
    'HOW THE ORGANISM GENERATES WINNING PROPOSALS — THE COMPLETE METHOD (CORRECTED):\n\n'
    +'The goal is to produce a first draft that Christopher reviews and refines, not builds from scratch. The organism does the work of a full capture team.\n\n'
    +'FIVE SOURCES COMBINED — not four. All five are essential:\n\n'
    +'SOURCE 1 — THE RFP: Read every word. Extract eval criteria with point values, required sections, required forms, submission instructions, scope of work, minimum qualifications, insurance requirements, pricing structure. The RFP dictates the structure.\n\n'
    +'SOURCE 2 — LIVE WEB RESEARCH: Research the highest industry standards and best practices for THIS specific domain. What does best-in-class methodology look like? Who are likely competitors? What has this agency awarded before? What are current regulatory requirements? What terminology do domain experts use?\n\n'
    +'SOURCE 3 — HGI KB: Pull everything relevant from the knowledge base — past performance on similar work, methodologies used, outcomes achieved, lessons learned. Connect HGI-specific experience to THIS scope.\n\n'
    +'SOURCE 4 — ORGANISM MEMORY: What has the intelligence engine, CRM agent, financial agent, and all other agents learned about this agency, competitive field, and market?\n\n'
    +'SOURCE 5 — AI AS WRITER AND STRATEGIST: This is not optional — it is core. Claude\'s reasoning, analytical capability, persuasive writing skill, and strategic thinking are a fundamental ingredient in the proposal. The AI does not just connect sources — it THINKS, WRITES, CRAFTS ARGUMENTS, STRUCTURES NARRATIVES for maximum evaluator impact, IDENTIFIES WEAKNESSES in the draft, SUGGESTS STRONGER FRAMING, and produces prose at the level of the best proposal writers in the industry. The AI is a thinking partner and co-author, not plumbing.\n\n'
    +'THE PROCESS:\n'
    +'STEP 1: Read the RFP completely. Map every requirement.\n'
    +'STEP 2: Research the domain via web — industry standards, agency intel, competitive landscape.\n'
    +'STEP 3: Pull relevant HGI content from KB and organism memory.\n'
    +'STEP 4: AI synthesizes all inputs and WRITES the proposal — not assembling fragments but crafting a cohesive, persuasive document that reads like a senior capture professional produced it. AI applies strategic judgment: which HGI strengths to lead with for THIS evaluator, how to frame competitive advantages, what narrative arc scores highest against THESE eval criteria.\n'
    +'STEP 5: Quality gate audits against every RFP requirement. Flags gaps and [ACTION REQUIRED] items.\n'
    +'STEP 6: Christopher reviews, refines, approves. Edits flow back into memory so every future proposal gets smarter.\n\n'
    +'The proposal is the SYNTHESIS of all five sources into one document that scores highest against the evaluation criteria. No single source alone produces a winner. The combination — and specifically the AI\'s ability to reason about what wins and write accordingly — is what makes the organism a capture team, not a search engine.',
    memory_type:'pattern',created_at:new Date().toISOString()})});

  return res.status(200).json({success:true, memory:'proposal_method_corrected', note:'AI as writer and strategist is now explicitly source 5 — core to the method, not plumbing'});
}