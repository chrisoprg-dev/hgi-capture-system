// ── RECRUITING ────────────────────────────────────────────────────────────────
function RecruitingBench() {
  var pl = usePipeline();
  const [bench, setBench] = useState(() => store.get("bench") || []);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({name:"",role:"",domain:"",clearance:"",location:"",availability:"",notes:""});
  const [gapText, setGapText] = useState("");
  const [gapResult, setGapResult] = useState("");
  const [gapLoading, setGapLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("bench");
  const [autoRecruitForm, setAutoRecruitForm] = useState({role:"",context:""});
  const [autoRecruitResults, setAutoRecruitResults] = useState({jobDesc:"",linkedInPost:"",screeningQuestions:""});
  const [autoRecruitLoading, setAutoRecruitLoading] = useState({jobDesc:false,linkedInPost:false,screeningQuestions:false});
  const [opportunityName, setOpportunityName] = useState("");
  const [outreachResults, setOutreachResults] = useState({});
  const [outreachLoading, setOutreachLoading] = useState({});
  const [matchResults, setMatchResults] = useState({});
  const [matchLoading, setMatchLoading] = useState({});
  const setF = (k,v) => setForm(f => ({...f,[k]:v}));
  const setAR = (k,v) => setAutoRecruitForm(f => ({...f,[k]:v}));
  const save = (d) => { setBench(d); store.set("bench", d); };

  const addPerson = () => {
    if (!form.name) return;
    save([{id:"b-"+Date.now(),...form,addedDate:new Date().toISOString()}, ...bench]);
    setForm({name:"",role:"",domain:"",clearance:"",location:"",availability:"",notes:""});
    setShowAdd(false);
  };

  const analyzeGaps = async () => {
    setGapLoading(true);
    const benchSummary = bench.map(p => p.name + " — " + p.role + " — " + p.domain).join("\n") || "No bench entries yet";
    const txt = await callClaude("Staffing gap analysis for HGI:\nRFP Requirements: " + gapText + "\nCurrent Bench:\n" + benchSummary + "\n\nProvide:\n1. Required roles\n2. Bench members who qualify\n3. Gaps not covered\n4. Recruiting profile for each gap\n5. Teaming partners to consider\n6. Mobilization timeline risk");
    setGapResult(txt); setGapLoading(false);
  };

  const generateJobDescription = async () => {
    setAutoRecruitLoading(prev => ({...prev, jobDesc: true}));
    const prompt = `Generate a comprehensive job description for Hammerman & Gainer LLC (HGI) for the following role:
    
Role: ${autoRecruitForm.role}
Context: ${autoRecruitForm.context}

Company context: HGI specializes in disaster recovery consulting, FEMA Public Assistance, CDBG-DR programs, and emergency management. We are Louisiana-based and work primarily with state/local governments on post-disaster recovery projects.

Include: job title, summary, key responsibilities, required qualifications, preferred qualifications, and what makes this role unique at HGI.`;
    
    const result = await callClaude(prompt);
    setAutoRecruitResults(prev => ({...prev, jobDesc: result}));
    setAutoRecruitLoading(prev => ({...prev, jobDesc: false}));
  };

  const generateLinkedInPost = async () => {
    setAutoRecruitLoading(prev => ({...prev, linkedInPost: true}));
    const prompt = `Create an engaging LinkedIn recruiting post for Hammerman & Gainer LLC (HGI) for this role:
    
Role: ${autoRecruitForm.role}
Context: ${autoRecruitForm.context}

Company context: We're a Louisiana-based disaster recovery consulting firm specializing in FEMA Public Assistance, CDBG-DR programs, and helping communities rebuild after disasters.

Make it engaging, highlight the meaningful impact of the work, include relevant hashtags, and encourage qualified candidates to reach out.`;
    
    const result = await callClaude(prompt);
    setAutoRecruitResults(prev => ({...prev, linkedInPost: result}));
    setAutoRecruitLoading(prev => ({...prev, linkedInPost: false}));
  };

  const generateScreeningQuestions = async () => {
    setAutoRecruitLoading(prev => ({...prev, screeningQuestions: true}));
    const prompt = `Generate 8-10 screening questions for this role at Hammerman & Gainer LLC (HGI):
    
Role: ${autoRecruitForm.role}
Context: ${autoRecruitForm.context}

Company context: HGI specializes in disaster recovery, FEMA PA, CDBG-DR work, and emergency management consulting.

Include a mix of technical competency questions, behavioral questions, and questions specific to disaster recovery/government consulting work. Format as a numbered list.`;
    
    const result = await callClaude(prompt);
    setAutoRecruitResults(prev => ({...prev, screeningQuestions: result}));
    setAutoRecruitLoading(prev => ({...prev, screeningQuestions: false}));
  };

  const generateOutreach = async (person) => {
    setOutreachLoading(prev => ({...prev, [person.id]: true}));
    const prompt = `Write a personalized outreach email to recruit this person for the following opportunity:

Opportunity: ${opportunityName}

Person Details:
Name: ${person.name}
Role: ${person.role}
Domain: ${person.domain}
Location: ${person.location}
Notes: ${person.notes}

Write a professional but warm email that:
- References their specific background/expertise
- Explains the opportunity and why they'd be a great fit
- Mentions HGI's work in disaster recovery and FEMA/CDBG-DR programs
- Has a clear call to action
- Includes an appropriate subject line

Format: Subject: [subject line] followed by the email body.`;
    
    const result = await callClaude(prompt);
    setOutreachResults(prev => ({...prev, [person.id]: result}));
    setOutreachLoading(prev => ({...prev, [person.id]: false}));
  };

  const generateAllOutreach = async () => {
    for (const person of bench) {
      await generateOutreach(person);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between calls
    }
  };

  const matchToOpportunity = async (person) => {
    setMatchLoading(prev => ({...prev, [person.id]: true}));
    
    try {
      const oppsResponse = await fetch('/api/opportunities');
      const opportunities = await oppsResponse.json();
      
      const activeOpps = opportunities.filter(opp => opp.status === 'active' || opp.status === 'pending');
      
      const prompt = `Analyze how well this person matches current active opportunities:

Person:
Name: ${person.name}
Role: ${person.role}
Domain: ${person.domain}
Clearance/Certs: ${person.clearance}
Location: ${person.location}
Notes: ${person.notes}

Active Opportunities:
${activeOpps.map(opp => `${opp.title} - ${opp.client} - ${opp.value} - Due: ${opp.deadline}`).join('\n')}

For each opportunity, provide:
1. Match score (1-10)
2. Key alignment points
3. Potential gaps or concerns
4. Recommended positioning

If no active opportunities, suggest general opportunity types they'd be good for.`;

      const result = await callClaude(prompt);
      setMatchResults(prev => ({...prev, [person.id]: result}));
    } catch (error) {
      setMatchResults(prev => ({...prev, [person.id]: "Error fetching opportunities. Please try again."}));
    }
    
    setMatchLoading(prev => ({...prev, [person.id]: false}));
  };

  const renderTabButton = (tabName, label) => (
    <button
      onClick={() => setActiveTab(tabName)}
      style={{
        padding: "8px 16px",
        backgroundColor: activeTab === tabName ? GOLD : "transparent",
        color: activeTab === tabName ? BG : GOLD,
        border: `1px solid ${GOLD}`,
        borderBottom: activeTab === tabName ? `1px solid ${GOLD}` : "1px solid transparent",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Recruiting & Bench</h2>
          <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>{bench.length} bench members tracked</p>
        </div>
        {activeTab === "bench" && <Btn style={{marginLeft:"auto"}} onClick={()=>setShowAdd(!showAdd)}>+ Add Person</Btn>}
      </div>

      {React.createElement(OpportunitySelector,{pipeline:pl.pipeline,selected:pl.selected,onSelect:pl.select,loading:pl.loading,label:"SELECT OPPORTUNITY FOR STAFFING"})}

      {/* Tab Navigation */}
      <div style={{marginBottom: 20, borderBottom: `1px solid ${GOLD}33`}}>
        <div style={{display: "flex", gap: 0}}>
          {renderTabButton("bench", "Bench")}
          {renderTabButton("auto-recruit", "Auto-Recruit")}
          {renderTabButton("outreach", "Outreach")}
        </div>
      </div>

      {/* BENCH TAB */}
      {activeTab === "bench" && (
        <div>
          {showAdd && (
            <Card style={{marginBottom:20,border:`1px solid ${GOLD}44`}}>
              <h3 style={{color:GOLD,margin:"0 0 12px",fontSize:14}}>Add Bench Member</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Input value={form.name} onChange={v=>setF("name",v)} placeholder="Full Name*" />
                <Input value={form.role} onChange={v=>setF("role",v)} placeholder="Role (Program Manager...)" />
                <Input value={form.domain} onChange={v=>setF("domain",v)} placeholder="Domain (FEMA PA, CDBG-DR...)" />
                <Input value={form.clearance} onChange={v=>setF("clearance",v)} placeholder="Clearance / Certs" />
                <Input value={form.location} onChange={v=>setF("location",v)} placeholder="Location" />
                <Input value={form.availability} onChange={v=>setF("availability",v)} placeholder="Availability" />
                <Textarea value={form.notes} onChange={v=>setF("notes",v)} placeholder="Notes..." rows={2} style={{gridColumn:"1/-1"}} />
              </div>
              <div style={{marginTop:12,display:"flex",gap:8}}>
                <Btn onClick={addPerson}>Add</Btn>
                <Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn>
              </div>
            </Card>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12,marginBottom:24}}>
            {bench.map(p => (
              <Card key={p.id}>
                <div style={{fontWeight:700,color:TEXT,marginBottom:4}}>{p.name}</div>
                <div style={{color:GOLD,fontSize:12,marginBottom:6}}>{p.role}</div>
                {p.domain && <div style={{fontSize:12,color:TEXT_D,marginBottom:2}}>Domain: {p.domain}</div>}
                {p.location && <div style={{fontSize:12,color:TEXT_D,marginBottom:2}}>Location: {p.location}</div>}
                {p.availability && <div style={{fontSize:12,color:TEXT_D,marginBottom:2}}>Available: {p.availability}</div>}
                {p.notes && <div style={{fontSize:11,color:TEXT_D,marginTop:6,fontStyle:"italic"}}>{p.notes}</div>}
                <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                  <Btn small onClick={() => matchToOpportunity(p)} disabled={matchLoading[p.id]}>
                    {matchLoading[p.id] ? "Matching..." : "Match to Opportunity"}
                  </Btn>
                  <Btn small variant="danger" onClick={()=>save(bench.filter(b=>b.id!==p.id))}>Remove</Btn>
                </div>
                {matchResults[p.id] && (
                  <div style={{marginTop:12}}>
                    <AIOut content={matchResults[p.id]} loading={matchLoading[p.id]} label="OPPORTUNITY MATCH" />
                  </div>
                )}
              </Card>
            ))}
            {!bench.length && <div style={{color:TEXT_D,fontSize:13,gridColumn:"1/-1",padding:20}}>No bench members yet.</div>}
          </div>
          <Card style={{border:`1px solid ${GOLD}33`}}>
            <h3 style={{color:GOLD,margin:"0 0 12px",fontSize:14}}>STAFFING GAP ANALYSIS</h3>
            <Textarea value={gapText} onChange={setGapText} placeholder="Paste RFP key personnel requirements..." rows={4} />
            <Btn onClick={analyzeGaps} disabled={gapLoading||!gapText} style={{marginTop:10}}>{gapLoading?"Analyzing...":"Analyze Gaps vs Bench"}</Btn>
            {(gapLoading||gapResult) && <div style={{marginTop:12}}><AIOut content={gapResult} loading={gapLoading} label="STAFFING GAP ANALYSIS" /></div>}
          </Card>
        </div>
      )}

      {/* AUTO-RECRUIT TAB */}
      {activeTab === "auto-recruit" && (
        <div>
          <Card style={{marginBottom:20}}>
            <h3 style={{color:GOLD,margin:"0 0 12px",fontSize:14}}>Auto-Recruit Generator</h3>
            <div style={{display:"grid",gap:12}}>
              <Input 
                value={autoRecruitForm.role} 
                onChange={v=>setAR("role",v)} 
                placeholder="Role needed (e.g., FEMA PA Program Manager, CDBG-DR Specialist...)" 
              />
              <Textarea 
                value={autoRecruitForm.context} 
                onChange={v=>setAR("context",v)} 
                placeholder="Opportunity context (e.g., Hurricane recovery project in Louisiana, 3-year CDBG-DR program...)" 
                rows={3}
              />
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn 
                  onClick={generateJobDescription} 
                  disabled={autoRecruitLoading.jobDesc || !autoRecruitForm.role}
                >
                  {autoRecruitLoading.jobDesc ? "Generating..." : "Generate Job Description"}
                </Btn>
                <Btn 
                  onClick={generateLinkedInPost} 
                  disabled={autoRecruitLoading.linkedInPost || !autoRecruitForm.role}
                >
                  {autoRecruitLoading.linkedInPost ? "Generating..." : "Generate LinkedIn Post"}
                </Btn>
                <Btn 
                  onClick={generateScreeningQuestions} 
                  disabled={autoRecruitLoading.screeningQuestions || !autoRecruitForm.role}
                >
                  {autoRecruitLoading.screeningQuestions ? "Generating..." : "Generate Screening Questions"}
                </Btn>
              </div>
            </div>
          </Card>

          {(autoRecruitResults.jobDesc || autoRecruitLoading.jobDesc) && (
            <div style={{marginBottom:20}}>
              <AIOut content={autoRecruitResults.jobDesc} loading={autoRecruitLoading.jobDesc} label="JOB DESCRIPTION" />
            </div>
          )}

          {(autoRecruitResults.linkedInPost || autoRecruitLoading.linkedInPost) && (
            <div style={{marginBottom:20}}>
              <AIOut content={autoRecruitResults.linkedInPost} loading={autoRecruitLoading.linkedInPost} label="LINKEDIN POST" />
            </div>
          )}

          {(autoRecruitResults.screeningQuestions || autoRecruitLoading.screeningQuestions) && (
            <div style={{marginBottom:20}}>
              <AIOut content={autoRecruitResults.screeningQuestions} loading={autoRecruitLoading.screeningQuestions} label="SCREENING QUESTIONS" />
            </div>
          )}
        </div>
      )}

      {/* OUTREACH TAB */}
      {activeTab === "outreach" && (
        <div>
          <Card style={{marginBottom:20}}>
            <h3 style={{color:GOLD,margin:"0 0 12px",fontSize:14}}>Outreach Campaign</h3>
            <Input 
              value={opportunityName} 
              onChange={setOpportunityName} 
              placeholder="Opportunity name (e.g., 'Louisiana Hurricane Recovery Program')" 
            />
            <Btn 
              onClick={generateAllOutreach} 
              disabled={!opportunityName || !bench.length || Object.keys(outreachLoading).some(k => outreachLoading[k])}
              style={{marginTop:10}}
            >
              Draft All Outreach Emails
            </Btn>
          </Card>

          <div style={{display:"grid",gap:12}}>
            {bench.map(person => (
              <Card key={person.id}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,color:TEXT}}>{person.name}</div>
                    <div style={{color:GOLD,fontSize:12}}>{person.role} • {person.domain}</div>
                  </div>
                  <Btn 
                    small 
                    onClick={() => generateOutreach(person)} 
                    disabled={outreachLoading[person.id] || !opportunityName}
                  >
                    {outreachLoading[person.id] ? "Drafting..." : "Draft Outreach Email"}
                  </Btn>
                </div>
                
                {(outreachResults[person.id] || outreachLoading[person.id]) && (
                  <details style={{marginTop:12}}>
                    <summary style={{cursor:"pointer",color:GOLD,fontSize:12,fontWeight:600}}>
                      {outreachLoading[person.id] ? "Generating outreach email..." : "View Generated Email"}
                    </summary>
                    <div style={{marginTop:8}}>
                      <AIOut 
                        content={outreachResults[person.id]} 
                        loading={outreachLoading[person.id]} 
                        label={`OUTREACH - ${person.name}`}
                        copyButton={true}
                      />
                    </div>
                  </details>
                )}
              </Card>
            ))}
            {!bench.length && (
              <div style={{color:TEXT_D,fontSize:13,padding:20}}>
                No bench members yet. Add some in the Bench tab first.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}