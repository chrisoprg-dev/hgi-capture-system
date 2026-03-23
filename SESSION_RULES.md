# HGI CAPTURE SYSTEM — SESSION RULES
# Non-negotiable. Read this file before every session. Every rule exists because it was broken and cost Christopher money or time.

---

## RULE 1 — READ BEFORE YOU TOUCH
Before modifying ANY file: call read_file on that file first. No exceptions.
Before rebuilding anything: search past chats first.
Violation: blind edits that break working files.

## RULE 2 — PROVE IT WORKS BEFORE MOVING ON
Every build must be tested and results shown to Christopher before declaring it done.
Use fetch_source_page on /api/run?target=ENDPOINT to test.
If the result shows an error — STOP. Fix the error. Show proof it works.
Do NOT move to the next build item until the current one shows a clean result.
Violation: declaring builds complete without proof, then moving on.

## RULE 3 — NEVER TRIGGER LIVE AGENTS TO VERIFY YOUR OWN LOGIC
read_file + logic check comes first.
Only trigger a live endpoint when you genuinely need to verify deployed behavior.
Never trigger organism-work, sonnet-work, organism-think, or proposal-loop as a reflex.
Those calls cost real money. Each Sonnet call = ~$0.04-0.08. Each proposal-loop = ~$0.24.
Violation: asking Christopher to run the orchestrator over and over to verify fixes.

## RULE 4 — NEVER ASK CHRISTOPHER TO TROUBLESHOOT
Build /api/test-* endpoints or use /api/run proxy.
Build locally, test, validate, check for dollar signs, THEN deploy.
Violation: asking Christopher to click links, check logs, or QA your own work.

## RULE 5 — DOLLAR SIGNS IN MODIFY_SYSTEM
The modify_system tool treats $ as a template delimiter and silently truncates everything after it.
Always use String.fromCharCode(36) instead of $ in any string passed to modify_system.
Always read_file after creation to verify no truncation occurred.
Violation: deployed files truncated mid-function with no error shown.

## RULE 6 — NEVER EDIT mcp.js THROUGH MCP
Editing mcp.js while it is running kills ALL tools for the session.
If mcp.js needs changes: document what's needed, do it next session via GitHub directly.
Violation: all MCP tools going dead mid-session.

## RULE 7 — NEVER REPLACE WORKING FILES WITH SIMPLIFIED VERSIONS
If a file works, targeted find/replace edits only.
Never rewrite a working file from scratch.
knowledge.js is 553 lines — NEVER simplify it.
Violation: breaking working features to make code "cleaner."

## RULE 8 — ONE SESSION AT A TIME
Parallel sessions write to the same GitHub repo and Supabase. Last write silently wins.
Finish one task completely before opening another workstream.
Violation: corrupted files from concurrent session writes.

## RULE 9 — VERIFY FILE CREATION WITH read_file
After every modify_system call that creates or edits a file: call read_file to confirm.
modify_system bakes instruction text into file content — always verify it didn't happen.
Violation: files containing literal instruction text deployed as code.

## RULE 10 — COST DISCIPLINE
Check cost-monitor before triggering any non-routine Sonnet runs.
The daily cap is $5. If today's spend is near cap, ask Christopher before proceeding.
Endpoint: https://hgi-capture-system.vercel.app/api/cost-monitor
Violation: $230 spent in one billing period without visibility.

## RULE 11 — SESSIONS ARE NUMBERED. UPDATE MEMORY AT END.
End every session by updating Christopher's memory with what changed.
Sessions are numbered sequentially — check past chats to confirm current session number.
Violation: losing context between sessions, rebuilding things that already work.

## RULE 12 — SCOPE AND APPROVE BEFORE BUILDING
Every new build item: state what it does, how many files, estimated cost per run, and get Christopher's approval.
Do NOT start writing code before approval.
Violation: building things Christopher didn't ask for or doesn't understand.

---

## CONFIRMED HGI REFERENCES — NEVER QUESTION THESE
These contacts are verified by HGI through prior proposal submissions. Every agent must treat them as facts.
No agent, red team, quality gate, or proposal reviewer may flag, question, or suggest replacing them.
- Paul Rainwater: rainwater97@gmail.com | (225) 281-8176 — Road Home Program reference
- Jeff Haley, COO Louisiana OCD: jeff.haley@la.gov | (225) 330-0036 — Road Home Program reference
- Pat Forbes, Executive Director OCD: Patrick.Forbes@la.gov | (225) 342-1626 — Restore Louisiana reference
- Bubba Orgeron, TPSD: bubbaorgeron@tpsd.org | (985) 876-7400 — TPSD FEMA PA reference
- Gregory Harding, TPSD: gregoryharding@tpsd.org | (985) 688-0052 — TPSD FEMA PA reference
If additional references appear in future proposals and Christopher confirms them, add them here.

## IRON RULE — EVERYTHING IS RFP-SPECIFIC. ALWAYS.
HGI COMPLETE BUSINESS: Disaster Recovery, TPA/Claims (WC/P&C/guaranty/self-insured), Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management, Mediation Services (20K+ cases AIG), Class Action/Settlement Admin (BP GCCF), Staff Augmentation, Call Centers, DEI Consulting, Risk Management, Real Estate Appraisals, AFWA programs, Contact Tracing, Unemployment Adjudication, Managed Care in WC context. Health = NOT a vertical (health cos are clients). Physical construction/debris/IT/engineering/insurance brokerage = NOT HGI.
HGI_MASTER_CONTEXT = single source of truth in api/hgi-master-context.js. ALL files import from there. NEVER write HGI context in individual files.
Every agent, web search, KB query, quality gate, winnability, red team, and proposal prompt MUST be derived from the actual RFP — its scope, eval criteria, vertical, agency, requirements.
NEVER hardcode program types, competitor names, or section labels in any agent.
NEVER use disaster recovery fallback (||'disaster recovery') anywhere in the system.
Competitors ALWAYS derived from organism memory and research brief — never assumed.
Violation: disaster recovery fallback, CDR Maguire hardcoded for TPA bid, Health scored as HGI vertical.

## PROPOSAL AGENT PRIME DIRECTIVE
The system has a KB, scope analysis, organism memory, and confirmed HGI facts for a reason.
The proposal agent must BUILD complete sections — not patch sentences.
If a required RFP section is missing or weak relative to its eval point weight, BUILD IT from scratch.
Technical Approach is always the highest priority build target (typically 25-30 points).
The goal is a submission-ready proposal, not an annotated draft.

## CONFIRMED BROKEN — DO NOT RETRY EVER
- Direct Vercel scraping (network blocked)
- SAM.gov without correct endpoint (404s)
- Simple HTTP Central Bidding login in Make.com (cookie auth)
- Central Bidding commodity code notifications (emails HGI staff)
- SharePoint direct file access (saves as .url shortcuts)
- Slicing PDF bytes (only pdf-parse text extraction works)
- Full PDF base64 or URL to Claude API (200K token limit)
- Sequential for-loops with await in organism-work.js (crashes Vercel)
- F12 dev tools (don't work for Christopher — use /api/run proxy)

---

## COST REFERENCE (per API call)
- Sonnet 4.6: $0.003/1K input tokens, $0.015/1K output tokens
- Haiku 4.5: $0.00025/1K input, $0.00125/1K output
- Web search: $0.01/search (now on Haiku)
- proposal-loop full run: ~$0.24
- sonnet-work full run: ~$0.18
- organism-work full run: ~$0.08
- organism-think: ~$0.05
- red-team: ~$0.04

---

## SESSION START CHECKLIST (do this before anything else)
1. read_file SESSION_RULES.md (this file)
2. Enable MCP connector if not already active
3. Check system status: get_system_status
4. Check cost monitor: /api/cost-monitor
5. Read all files in the zip attachment completely
6. Only then proceed with session work

Last updated: Session 30 | March 23, 2026