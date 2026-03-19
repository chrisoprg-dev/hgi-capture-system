// ── APP ───────────────────────────────────────────────────────────────────────
const MODULES = [
  {id:"dashboard", label:"Dashboard", icon:"⌂"},
  {id:"workflow", label:"Full Workflow", icon:"⚡", badge:"START HERE"},
  {id:"discovery", label:"Opportunity Discovery", icon:"◎"},
  {id:"scanner", label:"Pipeline Scanner", icon:"⊕"},
  {id:"tracker", label:"Pipeline Tracker", icon:"◈"},
  {id:"brief", label:"Opportunity Brief", icon:"◑"},
  {id:"research", label:"Research & Analysis", icon:"◉"},
  {id:"scoring", label:"Winnability Scoring", icon:"◆"},
  {id:"proposal", label:"Proposal Engine", icon:"✦"},
  {id:"financial", label:"Financial & Pricing", icon:"$"},
  {id:"recruiting", label:"Recruiting & Bench", icon:"◧"},
  {id:"crm", label:"Relationship Intelligence", icon:"◫"},
  {id:"content", label:"Content Engine", icon:"◭"},
  {id:"digest", label:"Weekly Digest", icon:"◇"},
  {id:"execbrief", label:"Executive Brief", icon:"◈"},
  {id:"scraperinsights", label:"Scraper Insights", icon:"⊗"},
  {id:"knowledge", label:"Knowledge Base", icon:"⬡"},
  {id:"chat", label:"System Chat", icon:"💬"},
];

function App() {
  const [active, setActive] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(true);
  const [sharedCtx, setSharedCtx] = useState(() => store.get("sharedCtx") || {rfpText:"", decomposition:"", execBrief:"", title:"", agency:""});
  const [proposalSection, setProposalSection] = useState("executive_summary");
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const r = await fetch('/api/notify');
        if (r.ok) {
          const d = await r.json();
          setNotifications(d.notifications || []);
        }
      } catch(e) {}
    };
    loadNotifications();
    const iv = setInterval(loadNotifications, 60000);
    return () => clearInterval(iv);
  }, []);

  const markRead = async (id) => {
    try {
      await fetch('/api/notify', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch(e) {}
  };

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
    brief: <OpportunityBrief />,
    scoring: <WinnabilityScoring />,
    research: <ResearchAnalysis sharedCtx={sharedCtx} saveSharedCtx={saveSharedCtx} />,
    proposal: <ProposalEngine sharedCtx={sharedCtx} defaultSection={proposalSection} />,
    financial: <FinancialPricing sharedCtx={sharedCtx} />,
    recruiting: <RecruitingBench sharedCtx={sharedCtx} />,
    digest: <WeeklyDigest />,
    crm: <CRM />,
    content: <ContentEngine />,
    execbrief: React.createElement('div', {style:{padding:20}}, React.createElement('h2', {style:{color:GOLD,marginBottom:16}}, 'Executive Intelligence Brief'), React.createElement('p', {style:{color:TEXT_D,marginBottom:20}}, 'Read-only intelligence dashboard for HGI leadership. Share the link below with Lou and Larry.'), React.createElement('a', {href:'/api/executive-brief?format=html', target:'_blank', style:{color:GOLD,fontSize:14,padding:'10px 20px',border:'1px solid ' + GOLD, borderRadius:4, textDecoration:'none', display:'inline-block', marginBottom:20}}, 'Open Executive Brief →'), React.createElement('p', {style:{color:TEXT_D,fontSize:12}}, 'Direct URL: https://hgi-capture-system.vercel.app/api/executive-brief?format=html')),
    knowledge: <KnowledgeBase />,
    scraperinsights: React.createElement(ScraperInsights),
    chat: React.createElement(Chat),
  };

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden"}}>
      <div style={{width:sideOpen?260:60,background:BG2,borderRight:`1px solid ${BORDER}`,display:"flex",flexDirection:"column",transition:"width 0.2s",overflow:"hidden",flexShrink:0}}>
        <div style={{padding:"20px 16px",borderBottom:`1px solid ${BORDER}`}}>
          {sideOpen ? (
            <div>
              <div style={{color:GOLD,fontWeight:800,fontSize:18,letterSpacing:"0.05em"}}>HGI</div>
              <div style={{color:GOLD_D,fontSize:10,letterSpacing:"0.15em",marginTop:2}}>AI CAPTURE SYSTEM v1.1</div>
              <div style={{color:TEXT_D,fontSize:11,marginTop:4}}>Hammerman & Gainer LLC · 97 Years</div>
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
          <div style={{marginLeft:'auto',position:'relative'}}>
            <button onClick={()=>setShowNotifications(s=>!s)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:notifications.length>0?GOLD:TEXT_D,position:'relative',padding:4}}>
              🔔
              {notifications.length > 0 && <span style={{position:'absolute',top:-2,right:-4,background:RED,color:'#fff',fontSize:9,fontWeight:800,borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center'}}>{notifications.length}</span>}
            </button>
            {showNotifications && (
              <div style={{position:'absolute',right:0,top:36,width:340,maxHeight:400,overflowY:'auto',background:BG2,border:'1px solid '+BORDER,borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',zIndex:1000}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid '+BORDER,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:GOLD,fontWeight:700,fontSize:13}}>Notifications</span>
                  <span style={{color:TEXT_D,fontSize:11}}>{notifications.length} unread</span>
                </div>
                {notifications.length === 0 ? (
                  <div style={{padding:20,textAlign:'center',color:TEXT_D,fontSize:12}}>No new notifications</div>
                ) : notifications.map(n => (
                  <div key={n.id} style={{padding:'10px 16px',borderBottom:'1px solid '+BORDER,cursor:'pointer'}} onClick={()=>markRead(n.id)}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:n.priority==='high'?RED:n.priority==='medium'?ORANGE:TEXT_D}}>{n.priority?.toUpperCase()}</span>
                      <span style={{fontSize:10,color:TEXT_D}}>{n.type?.replace(/_/g,' ')}</span>
                      <span style={{fontSize:9,color:TEXT_D,marginLeft:'auto'}}>{new Date(n.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div style={{fontSize:11,color:TEXT_D}}>Click to dismiss</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          {components[active]}
        </div>
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));