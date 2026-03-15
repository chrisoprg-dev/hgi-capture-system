// ── PROPOSAL ENGINE ───────────────────────────────────────────────────────────
function ProposalEngine({ sharedCtx={}, defaultSection="executive_summary" }) {
  const [rfpText, setRfpText] = useState("");
  const [section, setSection] = useState(defaultSection);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [currentlyGenerating, setCurrentlyGenerating] = useState("");
  const [proposalDraft, setProposalDraft] = useState(() => store.get("proposalDraft") || {});
  const [activeView, setActiveView] = useState("generate");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoProgress, setAutoProgress] = useState([]);
  const [autoSections, setAutoSections] = useState([]);
  const [viewingSection, setViewingSection] = useState(null);
  const [showCompliance, setShowCompliance] = useState(false);
  const [complianceResult, setComplianceResult] = useState("");
  const [complianceLoading, setComplianceLoading] = useState(false);
  const abortRef = useRef(false);

  const SECTIONS = [
    {value:"executive_summary",label:"Executive Summary"},
    {value:"technical_approach",label:"Technical Approach"},
    {value:"management_approach",label:"Management Approach"},
    {value:"staffing_plan",label:"Staffing Plan"},
    {value:"past_performance",label:"Past Performance Matrix"},
    {value:"transition_plan",label:"Transition / Mobilization Plan"},
    {value:"pricing_narrative",label:"Pricing Narrative"},
    {value:"compliance_matrix",label:"Compliance Matrix"},
    {value:"clarifying_questions",label:"Clarifying Questions"},
    {value:"red_team",label:"Red Team Critique"},
  ];

  const saveSection = (sec, text) => {
    const updated = {...proposalDraft, [sec]: text};
    setProposalDraft(updated);
    store.set("proposalDraft", updated);
  };
  const clearDraft = () => {
    if (!window.confirm("Clear all drafted sections? This cannot be undone.")) return;
    setProposalDraft({});
    store.set("proposalDraft", {});
    setResult("");
    setAutoProgress([]);
  };

  useEffect(() => {
    if (!autoLoaded && sharedCtx.rfpText && !rfpText) {
      setRfpText(sharedCtx.rfpText);
      setContext((sharedCtx.title || "") + (sharedCtx.agency ? " — " + sharedCtx.agency : ""));
      setAutoLoaded(true);
    }
    setSection(defaultSection);
  }, [defaultSection, sharedCtx]);

  const getPastPerformance = async (vertical) => {
    try {
      const response = await fetch(`/api/knowledge-query?vertical=${vertical}`);
      const data = await response.json();
      
      // Extract top 3 past performance entries
      if (data && data.entries) {
        return data.entries.slice(0, 3).map(entry => ({
          client: entry.client || "N/A",
          scope: entry.scope || "N/A", 
          value: entry.value || "N/A",
          outcome: entry.outcome || "N/A"
        }));
      }
      return [];
    } catch (error) {
      console.error("Error fetching past performance:", error);
      return [];
    }
  };

  const buildPrompt = (sLabel, activeRfp, kbInjection) => {
    const decomp = sharedCtx.decomposition ? "\n\nRFP DECOMPOSITION:\n" + sharedCtx.decomposition.slice(0, 1200) : "";
    const research = sharedCtx.research ? "\n\nCOMPETITIVE RESEARCH:\n" + sharedCtx.research.slice(0, 800) : "";
    const brief = sharedCtx.execBrief ? "\n\nEXECUTIVE BRIEF SUMMARY:\n" + sharedCtx.execBrief.slice(0, 800) : "";
    const kb = kbInjection ? "\n\nHGI INSTITUTIONAL KNOWLEDGE BASE:\n" + kbInjection.slice(0, 3000) : "";
    return "Write a complete, detailed " + sLabel + " section for HGI proposal.\nRFP Context: " + (activeRfp||"General disaster recovery TPA services") + "\nAdditional Context: " + context + decomp + brief + research + kb + "\n\nWrite the full section. Be thorough and specific. Use real HGI past performance, staff credentials, and rates from the institutional knowledge base above. At least 600 words.";
  };

  const buildSys = (sLabel, kbInjection, pastPerformance) => {
    const kb = kbInjection ? kbInjection.slice(0, 2000) : HGI_CONTEXT;
    let pastPerfSection = "";
    
    if (pastPerformance && pastPerformance.length > 0) {
      pastPerfSection = "\n\nTOP PAST PERFORMANCE:\n" + 
        pastPerformance.map((perf, idx) => 
          `${idx + 1}. Client: ${perf.client}, Scope: ${perf.scope}, Value: ${perf.value}, Outcome: ${perf.outcome}`
        ).join("\n");
    }

    return "You are a senior proposal writer for Hammerman & Gainer (HGI). Write a complete, submission-ready " + sLabel + " section. Be specific, detailed, and evaluator-aligned. Use ONLY verified past performance data — Road Home $13B, Restore Louisiana, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20+ years. For staff names and rates, use only what is explicitly provided in the institutional knowledge base — do not invent names or rates. Use [TBD: confirm current staff availability] for any staff placeholders. Write at least 600 words. " + kb + pastPerfSection;
  };

  const generate = async () => {
    setLoading(true);
    setResult("");
    const sLabel = SECTIONS.find(s => s.value === section)?.label || section;
    setCurrentlyGenerating(sLabel);
    const activeRfp = rfpText || sharedCtx.rfpText || "";
    // Query KB for institutional knowledge before generating
    const vertical = sharedCtx.vertical || "disaster_recovery";
    const kbInjection = await queryKB(vertical);
    
    // Fetch past performance entries from /api/knowledge-query?vertical=disaster_recovery
    const pastPerformance = await getPastPerformance("disaster_recovery");
    
    const txt = await callClaude(buildPrompt(sLabel, activeRfp, kbInjection), buildSys(sLabel, kbInjection, pastPerformance), 4000);
    setResult(txt);
    saveSection(section, txt);
    setCurrentlyGenerating("");
    setLoading(false);
  };

  // ── AUTO-GENERATE imported from ProposalAutoGen ────────────────────
  const startAutoGenerate = async (selectedKeys) => {
    const autoGenProps = {
      selectedKeys,
      abortRef,
      setAutoRunning,
      setAutoSections,
      setActiveView,
      setAutoProgress,
      rfpText,
      sharedCtx,
      proposalDraft,
      setProposalDraft,
      SECTIONS,
      buildPrompt,
      buildSys,
      queryKB,
      getPastPerformance,
      callClaude,
      store
    };
    
    const autoGen = new ProposalAutoGen(autoGenProps);
    await autoGen.start();
  };

  // ── COMPLIANCE SCAN ───────────────────────────────────────────────────────
  const runComplianceScan = async () => {
    const activeRfp = rfpText || sharedCtx.rfpText || "";
    if (!activeRfp) { alert("Please paste the RFP text first."); return; }
    const draftText = Object.entries(proposalDraft).map(([k,v]) => "=== " + k.toUpperCase().replace(/_/g," ") + " ===\n" + v.slice(0,600)).join("\n\n");
    if (!draftText) { alert("No sections have been drafted yet."); return; }
    setComplianceLoading(true);
    setShowCompliance(true);
    setComplianceResult("");
    const sys = "You are a proposal compliance reviewer. Analyze this proposal draft against the RFP requirements. Be specific and actionable.";
    const prompt = `RFP REQUIREMENTS:\n${activeRfp.slice(0,3000)}\n\nPROPOSAL DRAFT SECTIONS:\n${draftText}\n\nProvide a compliance matrix covering:\n1. REQUIREMENTS MET — list each RFP requirement and confirm which section addresses it\n2. GAPS — requirements not addressed or weakly addressed\n3. RED FLAGS — sections that may hurt scoring\n4. PUNCH LIST — specific edits needed before submission\n\nBe direct and specific.`;
    const txt = await callClaude(prompt, sys, 3000);
    setComplianceResult(txt);
    setComplianceLoading(false);
  };

  const completedSections = Object.keys(proposalDraft).length;

  const removeSection = (val) => {
    const nd = {...proposalDraft};
    delete nd[val];
    setProposalDraft(nd);
    store.set("proposalDraft", nd);
  };
  const goGenerate = (val) => { setSection(val); setActiveView("generate"); setViewingSection(null); };

  const saveToTrackerFromProposal = () => {
    const wfState = store.get("wfState") || {};
    const tracker = store.get("tracker") || [];
    const sectionCount = Object.keys(proposalDraft).length;
    const smartEx = (text, ...fields) => {
      if (!text) return "";
      for (const field of fields) {
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.toLowerCase().startsWith(field.toLowerCase() + ":")) {
            const val = trimmed.slice(field.length + 1).trim();
            if (val && val.toLowerCase() !== "tbd" && val.length > 1) return val;
          }
        }
      }
      return "";
    };
    const outA = wfState.outA || sharedCtx.decomposition || "";
    const outB = wfState.outB || sharedCtx.execBrief || "";
    const extractedTitle = smartEx(outA, "RFP Title","Solicitation Title","Title","Opportunity Title") || sharedCtx.title || wfState.title || "Untitled";
    const extractedAgency = smartEx(outA, "Agency","Issuing Agency","Contracting Agency") || sharedCtx.agency || wfState.agency || "";
    const extractedValue = smartEx(outA, "Estimated Value","Contract Value","Total Value","Award Amount") || "";
    const extractedDeadline = smartEx(outA, "Proposal Due Date","Submission Deadline","Due Date") || "";
    const opiMatch = outB ? outB.split("\n").find(l => l.match(/OPI[^:]*:\s*\d+/i)) : null;
    const extractedOPI = opiMatch ? parseInt(opiMatch.match(/\d+/)[0]) : (wfState.opi || null);
    const existingIdx = tracker.findIndex(o => o.decomposition && o.decomposition === outA);
    const entry = {
      id: existingIdx >= 0 ? tracker[existingIdx].id : "wf-" + Date.now(),
      title: extractedTitle, agency: extractedAgency, value: extractedValue,
      deadline: extractedDeadline, stage: "proposal", opiScore: extractedOPI,
      decomposition: outA, execBrief: outB,
      proposal: Object.entries(proposalDraft).map(([k,v]) => "=== " + k.toUpperCase().replace(/_/g," ") + " ===\n" + v).join("\n\n"),
      addedDate: existingIdx >= 0 ? tracker[existingIdx].addedDate : new Date().toISOString(),
      notes: sectionCount + " proposal sections drafted · " + new Date().toLocaleDateString()
    };
    const updated = existingIdx >= 0 ? tracker.map((o,i) => i===existingIdx?entry:o) : [entry,...tracker];
    store.set("tracker", updated);
    alert("Saved to Pipeline Tracker — " + sectionCount + " sections");
  };

  // ── SECTION SELECTOR for auto-generate ───────────────────────────────────
  const [selectedForAuto, setSelectedForAuto] = useState(SECTIONS.map(s=>s.value));
  const toggleAutoSection = (val) => setSelectedForAuto(prev => prev.includes(val) ? prev.filter(v=>v!==val) : [...prev,val]);

  const statusIcon = (s) => {
    if (s==="done") return <span style={{color:GREEN,fontWeight:700}}>✓</span>;
    if (s==="generating") return <span style={{color:GOLD,animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>;
    if (s==="error") return <span style={{color:RED}}>✗</span>;
    return <span style={{color:BORDER}}>○</span>;
  };

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4,flexWrap:"wrap"}}>
        <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Proposal Engine</h2>
        {completedSections > 0 && <Badge color={GREEN}>{completedSections}/{SECTIONS.length} sections</Badge>}
        {completedSections > 0 && <Btn small variant="ghost" onClick={()=>{setActiveView("workspace");setViewingSection(null);}}>View Full Draft →</Btn>}
        {completedSections > 0 && <Btn small variant="secondary" onClick={runComplianceScan}>Compliance Scan</Btn>}
        {completedSections > 0 && <Btn small onClick={saveToTrackerFromProposal}>[save] Save to Tracker</Btn>}
        {completedSections > 0 && <Btn small variant="danger" onClick={clearDraft}>Clear</Btn>}
      </div>
      <p style={{color:TEXT_D,margin:"0 0 16px",fontSize:12}}>Generate sections one at a time or auto-generate the full proposal</p>

      {/* RFP Status Banner */}
      {sharedCtx.rfpText ? (
        <div style={{marginBottom:12,padding:"8px 12px",background:GREEN+"15",border:`1px solid ${GREEN}44`,borderRadius:4,fontSize:12,color:GREEN}}>
          ✓ RFP loaded: <strong>{sharedCtx.title || "Untitled"}</strong>{sharedCtx.agency ? " — " + sharedCtx.agency : ""}
        </div>
      ) : (
        <div style={{marginBottom:16,padding:"12px 16px",background:ORANGE+"15",border:`1px solid ${ORANGE}44`,borderRadius:4}}>
          <div style={{color:ORANGE,fontWeight:700,fontSize:13,marginBottom:4}}>Recommended: Complete Full Workflow First</div>
          <div style={{color:TEXT_D,fontSize:12}}>For best results run Full Workflow first. Or paste RFP text below.</div>
        </div>
      )}

      {/* View Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${BORDER}`,paddingBottom:8}}>
        {[["generate","Single Section"],["auto-select","Auto Generate All"],["workspace","Draft Workspace"]].map(([v,l])=>(
          <button key={v} onClick={()=>setActiveView(v)} style={{
            padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",
            background:activeView===v||( v==="auto-select"&&activeView==="auto")?GOLD:"transparent",
            color:activeView===v||(v==="auto-select"&&activeView==="auto")?"#000":TEXT_D,
            border:`1px solid ${activeView===v||(v==="auto-select"&&activeView==="auto")?GOLD:BORDER}`,
            borderRadius:4,fontWeight:activeView===v?700:400
          }}>{l}</button>
        ))}
      </div>

      {/* ── SINGLE SECTION VIEW ── */}
      {activeView === "generate" && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <Label text="RFP CONTEXT (paste if not loaded from workflow)" />
                <Textarea value={rfpText} onChange={setRfpText} placeholder="Paste RFP text..." rows={4} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><Label text="SECTION" /><Sel value={section} onChange={setSection} options={SECTIONS} style={{width:"100%"}} /></div>
                <div><Label text="ADDITIONAL CONTEXT" /><Input value={context} onChange={setContext} placeholder="Agency, key win themes, incumbent..." /></div>
              </div>
              <Btn onClick={generate} disabled={loading} style={{alignSelf:"flex-start"}}>
                {loading ? "Writing " + currentlyGenerating + "..." : "Generate: " + (SECTIONS.find(s=>s.value===section)?.label||"Section")}
              </Btn>
            </div>
          </Card>

          {/* Section Pills */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {SECTIONS.map(s => (
              <button key={s.value} onClick={()=>{setSection(s.value);setViewingSection(s.value===viewingSection?null:s.value);}} style={{
                padding:"5px 10px",borderRadius:4,fontSize:11,cursor:"pointer",fontFamily:"inherit",
                background:section===s.value?GOLD:proposalDraft[s.value]?GREEN+"22":BG3,
                color:section===s.value?"#000":proposalDraft[s.value]?GREEN:TEXT_D,
                border:`1px solid ${section===s.value?GOLD:proposalDraft[s.value]?GREEN:BORDER}`,
                fontWeight:section===s.value||proposalDraft[s.value]?700:400
              }}>
                {proposalDraft[s.value]?"✓ ":""}{s.label}
              </button>
            ))}
          </div>

          {viewingSection && proposalDraft[viewingSection] && (
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{color:GREEN,fontWeight:700,fontSize:13}}>✓ {SECTIONS.find(s=>s.value===viewingSection)?.label}</span>
                <Btn small variant="ghost" onClick={()=>setViewingSection(null)}>Hide</Btn>
                <Btn small variant="secondary" onClick={()=>{setViewingSection(null);generate();}}>Regenerate</Btn>
                <Btn small variant="danger" onClick={()=>{removeSection(viewingSection);setViewingSection(null);}}>Remove</Btn>
              </div>
              <Textarea value={proposalDraft[viewingSection]} onChange={v=>{const nd={...proposalDraft,[viewingSection]:v};setProposalDraft(nd);store.set("proposalDraft",nd);}} rows={16} />
            </div>
          )}
          {!viewingSection && (loading || result) && <AIOut content={result} loading={loading} label={"GENERATING: " + currentlyGenerating.toUpperCase()} />}
        </div>
      )}

      {/* ── AUTO-SELECT VIEW ── */}
      {activeView === "auto-select" && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <Label text="RFP CONTEXT (required for auto-generation)" />
                <Textarea value={rfpText} onChange={setRfpText} placeholder="Paste RFP text here before running auto-generate..." rows={4} />
              </div>
              <div><Label text="ADDITIONAL CONTEXT" /><Input value={context} onChange={setContext} placeholder="Agency, key win themes, incumbent..." /></div>
            </div>
          </Card>

          <div style={{marginBottom:16}}>
            <Label text="SELECT SECTIONS TO GENERATE" />
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8,marginBottom:12}}>
              <button onClick={()=>setSelectedForAuto(SECTIONS.map(s=>s.value))} style={{padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"inherit",background:"transparent",color:GOLD,border:`1px solid ${GOLD_D}`,borderRadius:3}}>Select All</button>
              <button onClick={()=>setSelectedForAuto([])} style={{padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"inherit",background:"transparent",color:TEXT_D,border:`1px solid ${BORDER}`,borderRadius:3}}>Clear All</button>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {SECTIONS.map(s => {
                const sel = selectedForAuto.includes(s.value);
                const done = !!proposalDraft[s.value];
                return (
                  <button key={s.value} onClick={()=>toggleAutoSection(s.value)} style={{
                    padding:"6px 12px",borderRadius:4,fontSize:11,cursor:"pointer",fontFamily:"inherit",
                    background:sel?(done?GREEN+"33":GOLD+"22"):"transparent",
                    color:sel?(done?GREEN:GOLD):TEXT_D,
                    border:`1px solid ${sel?(done?GREEN:GOLD):BORDER}`,
                    fontWeight:sel?700:400
                  }}>
                    {done?"✓ ":sel?"+ ":""}{s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{padding:"12px 16px",background:BG2,border:`1px solid ${BORDER}`,borderRadius:4,marginBottom:16,fontSize:12,color:TEXT_D}}>
            <strong style={{color:TEXT}}>{selectedForAuto.length} section{selectedForAuto.length!==1?"s":""} selected.</strong> Auto-generation will run each section sequentially. You can review as each one completes. Estimated time: {selectedForAuto.length * 2}–{selectedForAuto.length * 3} minutes.
          </div>

          <Btn onClick={()=>startAutoGenerate(selectedForAuto)} disabled={selectedForAuto.length===0 || autoRunning}>
            Generate {selectedForAuto.length} Section{selectedForAuto.length!==1?"s":""} Automatically
          </Btn>
        </div>
      )}

      {/* ── AUTO PROGRESS VIEW ── */}
      {activeView === "auto" && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{color:autoRunning?GOLD:GREEN,fontWeight:700,fontSize:14}}>
              {autoRunning ? "Generating proposal sections..." : "Generation complete"}
            </div>
            {autoRunning && (
              <Btn small variant="danger" onClick={()=>{abortRef.current=true;}}>Stop</Btn>
            )}
          </div>

          {/* Progress tracker */}
          <div style={{marginBottom:20}}>
            {autoProgress.map((p,i) => {
              const sec = SECTIONS.find(s=>s.value===p.key);
              return (
                <div key={p.key} style={{
                  display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                  background:p.status==="generating"?GOLD+"11":p.status==="done"?GREEN+"11":BG2,
                  border:`1px solid ${p.status==="generating"?GOLD:p.status==="done"?GREEN:BORDER}`,
                  borderBottom:"none",
                  transition:"all 0.3s"
                }}>
                  <span style={{width:20,textAlign:"center",fontSize:16}}>{statusIcon(p.status)}</span>
                  <span style={{flex:1,fontSize:12,color:p.status==="done"?GREEN:p.status==="generating"?GOLD:TEXT_D,fontWeight:p.status==="generating"?700:400}}>
                    {sec?.label || p.key}
                  </span>
                  <span style={{fontSize:11,color:TEXT_D,textTransform:"uppercase",letterSpacing:"0.05em"}}>
                    {p.status==="generating"?"Writing...":p.status==="done"?"Done":p.status==="error"?"Failed":"Waiting"}
                  </span>
                </div>
              );
            })}
            <div style={{height:1,background:BORDER}}></div>
          </div>

          {/* Progress bar */}
          {autoProgress.length > 0 && (() => {
            const done = autoProgress.filter(p=>p.status==="done"||p.status==="error").length;
            const pct = Math.round((done/autoProgress.length)*100);
            return (
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:TEXT_D,marginBottom:6}}>
                  <span>{done} of {autoProgress.length} sections complete</span>
                  <span>{pct}%</span>
                </div>
                <div style={{height:4,background:BG3,borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",background:GOLD,transition:"width 0.5s ease",borderRadius:2}}></div>
                </div>
              </div>
            );
          })()}

          {!autoRunning && (
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <Btn onClick={()=>setActiveView("workspace")}>View Full Draft →</Btn>
              <Btn variant="secondary" onClick={runComplianceScan}>Run Compliance Scan</Btn>
            </div>
          )}
        </div>
      )}

      {/* ── WORKSPACE VIEW ── */}
      {activeView === "workspace" && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div style={{color:TEXT_D,fontSize:12}}>{completedSections} of {SECTIONS.length} sections drafted</div>
            <div style={{display:"flex",gap:8}}>
              <Btn small variant="secondary" onClick={runComplianceScan}>Compliance Scan</Btn>
              <Btn small onClick={saveToTrackerFromProposal}>[save] Save to Tracker</Btn>
            </div>
          </div>

          {SECTIONS.map(s => (
            proposalDraft[s.value] ? (
              <div key={s.value} style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,padding:"8px 12px",background:GREEN+"11",border:`1px solid ${GREEN}33`,borderRadius:4}}>
                  <span style={{color:GREEN,fontWeight:700,fontSize:13,flex:1}}>✓ {s.label}</span>
                  <Btn small variant="ghost" onClick={()=>goGenerate(s.value)}>Regenerate</Btn>
                  <Btn small variant="secondary" onClick={async()=>{const r=await fetch('/api/proposal-improve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section_name:s.value,section_content:proposalDraft[s.value],rfp_context:rfpText||sharedCtx.rfpText||'',agency:sharedCtx.agency||'',vertical:sharedCtx.vertical||'disaster',action:'improve'})});const d=await r.json();if(d.improved)saveSection(s.value,d.improved);}}>Improve</Btn>
                  <Btn small variant="secondary" onClick={async()=>{const r=await fetch('/api/proposal-improve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section_name:s.value,section_content:proposalDraft[s.value],rfp_context:rfpText||sharedCtx.rfpText||'',agency:sharedCtx.agency||'',vertical:sharedCtx.vertical||'disaster',action:'redteam'})});const d=await r.json();if(d.findings)alert('RED TEAM FINDINGS:\n\n'+d.findings);}}>Red Team</Btn>
                  <Btn small variant="danger" onClick={()=>removeSection(s.value)}>Remove</Btn>
                </div>
                <Textarea value={proposalDraft[s.value]} onChange={v=>saveSection(s.value,v)} rows={14} />
              </div>
            ) : (
              <div key={s.value} style={{marginBottom:8,padding:"10px 14px",background:BG3,borderRadius:4,border:`1px dashed ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{color:TEXT_D,fontSize:12}}>{s.label} — not yet generated</span>
                <Btn small variant="ghost" onClick={()=>goGenerate(s.value)}>Generate →</Btn>
              </div>
            )
          ))}
        </div>
      )}

      {/* ── COMPLIANCE SCAN PANEL ── */}
      {showCompliance && (
        <div style={{marginTop:24,border:`1px solid ${GOLD}44`,borderRadius:4,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:GOLD+"11",borderBottom:`1px solid ${GOLD}33`}}>
            <span style={{color:GOLD,fontWeight:700,fontSize:13}}>Compliance Scan Results</span>
            <Btn small variant="ghost" onClick={()=>setShowCompliance(false)}>Close</Btn>
          </div>
          <div style={{padding:16}}>
            <AIOut content={complianceResult} loading={complianceLoading} label="SCANNING PROPOSAL AGAINST RFP REQUIREMENTS" />
          </div>
        </div>
      )}
    </div>
  );
}
