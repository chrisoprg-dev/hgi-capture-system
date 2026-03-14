// ── APP ───────────────────────────────────────────────────────────────────────
const MODULES = [
  {id:"dashboard", label:"Dashboard", icon:"⌂"},
  {id:"workflow", label:"Full Workflow", icon:"⚡", badge:"START HERE"},
  {id:"discovery", label:"Opportunity Discovery", icon:"◎"},
  {id:"scanner", label:"Live Pipeline Scanner", icon:"◎"},
  {id:"tracker", label:"Pipeline Tracker", icon:"◈"},
  {id:"scoring", label:"Winnability Scoring", icon:"◆"},
  {id:"research", label:"Research & Analysis", icon:"◉"},
  {id:"proposal", label:"Proposal Engine", icon:"✦"},
  {id:"financial", label:"Financial & Pricing", icon:"$"},
  {id:"recruiting", label:"Recruiting & Bench", icon:"◐"},
  {id:"digest", label:"Weekly Digest", icon:"◇"},
  {id:"knowledge", label:"Knowledge Base", icon:"⬡"},
];

function App() {
  const [active, setActive] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(true);
  const [sharedCtx, setSharedCtx] = useState(() => store.get("sharedCtx") || {rfpText:"", decomposition:"", execBrief:"", title:"", agency:""});
  const [proposalSection, setProposalSection] = useState("executive_summary");

  const saveSharedCtx = (ctx) => {
    const merged = {...sharedCtx, ...ctx};
    setSharedCtx(merged);
    store.set("sharedCtx", merged);
  };

  const goToProposal = (section) => {
    setProposalSection(section);
    setActive("proposal");
  };

  const tracker = store.get("tracker") || [];
  const t1 = tracker.filter(o => o.opiScore && parseInt(o.opiScore) >= 70).length;

  const components = {
    dashboard: <Dashboard setActive={setActive} />,
    workflow: <FullWorkflow sharedCtx={sharedCtx} saveSharedCtx={saveSharedCtx} goToProposal={goToProposal} />,
    discovery: <OpportunityDiscovery saveSharedCtx={saveSharedCtx} goToWorkflow={()=>setActive("workflow")} />,
    scanner: <PipelineScanner />,
    tracker: <PipelineTracker goToWorkflow={() => setActive("workflow")} />,
    scoring: <WinnabilityScoring />,
    research: <ResearchAnalysis sharedCtx={sharedCtx} saveSharedCtx={saveSharedCtx} />,
    proposal: <ProposalEngine sharedCtx={sharedCtx} defaultSection={proposalSection} />,
    financial: <FinancialPricing sharedCtx={sharedCtx} />,
    recruiting: <RecruitingBench sharedCtx={sharedCtx} />,
    digest: <WeeklyDigest />,
    knowledge: <KnowledgeBase />,
  };

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden"}}>
      <div style={{width:sideOpen?260:60,background:BG2,borderRight:`1px solid ${BORDER}`,display:"flex",flexDirection:"column",transition:"width 0.2s",overflow:"hidden",flexShrink:0}}>
        <div style={{padding:"20px 16px",borderBottom:`1px solid ${BORDER}`}}>
          {sideOpen ? (
            <div>
              <div style={{color:GOLD,fontWeight:800,fontSize:18,letterSpacing:"0.05em"}}>HGI</div>
              <div style={{color:GOLD_D,fontSize:10,letterSpacing:"0.15em",marginTop:2}}>AI CAPTURE SYSTEM v1.1</div>
              <div style={{color:TEXT_D,fontSize:11,marginTop:4}}>Hammerman & Gainer LLC · 96 Years</div>
              {t1 > 0 && <div style={{marginTop:8}}><Badge color={GREEN}>{t1} Tier 1 Opp{t1>1?"s":""}</Badge></div>}
            </div>
          ) : (
            <div style={{color:GOLD,fontWeight:800,fontSize:16,textAlign:"center"}}>H</div>
          )}
        </div>
        <nav style={{flex:1,overflowY:"auto",padding:"12px 8px"}}>
          {MODULES.map(m => {
            const isActive = active === m.id;
            return (
              <button key={m.id} onClick={()=>setActive(m.id)}
                style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 10px",borderRadius:4,
                  cursor:"pointer",border:"none",fontFamily:"inherit",marginBottom:2,
                  background:isActive?GOLD+"22":"transparent",
                  borderLeft:isActive?`3px solid ${GOLD}`:"3px solid transparent",
                  color:isActive?GOLD:TEXT_D,fontSize:13,textAlign:"left"}}>
                <span style={{fontSize:16,flexShrink:0}}>{m.icon}</span>
                {sideOpen && <span style={{fontWeight:isActive?700:400,flex:1}}>{m.label}</span>}
                {sideOpen && m.badge && <Badge color={GREEN}>{m.badge}</Badge>}
              </button>
            );
          })}
        </nav>
        {sideOpen && (
          <div style={{padding:"12px 16px",borderTop:`1px solid ${BORDER}`,fontSize:10,color:TEXT_D}}>
            <div style={{fontWeight:700,color:GOLD_D,marginBottom:6,letterSpacing:"0.08em"}}>KEY PAST PERFORMANCE</div>
            {["Road Home $12B CDBG-DR","BP GCCF 1M+ claims","PBGC 34M beneficiaries","TPCIGA 20yrs Texas","Restore Louisiana","Terrebonne Parish / Ida"].map(p => (
              <div key={p} style={{marginBottom:3}}>· {p}</div>
            ))}
          </div>
        )}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:12,background:BG2}}>
          <button onClick={()=>setSideOpen(s=>!s)} style={{background:"none",border:"none",color:TEXT_D,cursor:"pointer",fontSize:16,padding:4}}>☰</button>
          <span style={{color:GOLD,fontWeight:700,fontSize:14}}>{MODULES.find(m=>m.id===active)?.label}</span>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          {components[active]}
        </div>
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));