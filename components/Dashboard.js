// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ setActive }) {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}));
  const [exp, setExp] = useState({});

  const greeting = () => { const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; };

  useEffect(() => {
    const load = async () => {
      try { const r=await fetch('/api/intelligence'); if(r.ok){const d=await r.json();setIntel(d);} } catch(e){}
      setLoading(false);
    };
    load();
    const iv=setInterval(load,300000);
    return ()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    const iv=setInterval(()=>setTime(new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})),30000);
    return ()=>clearInterval(iv);
  },[]);

  const ub=(u)=>u==='critical'?RED:u==='high'?ORANGE:u==='medium'?GOLD:BORDER;
  const ubg=(u)=>u==='critical'?RED+'11':u==='high'?ORANGE+'11':u==='medium'?GOLD+'11':BG2;
  const stats=intel?.pipeline_stats||{};
  const acts=intel?.actions||[];
  const crit=acts.filter(a=>a.urgency==='critical');
  const hi=acts.filter(a=>a.urgency==='high');
  const med=acts.filter(a=>a.urgency==='medium');

  const AC=({a,k})=>{
    const open=exp[k];
    const bc=ub(a.urgency);
    return (
      <div style={{background:ubg(a.urgency),border:`1px solid ${bc}33`,borderLeft:`4px solid ${bc}`,borderRadius:6,marginBottom:10,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'14px 16px',cursor:'pointer'}} onClick={()=>setExp(e=>({...e,[k]:!e[k]}))}>
          <span style={{fontSize:20,flexShrink:0,marginTop:2}}>{a.icon}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
              <span style={{fontWeight:700,color:TEXT,fontSize:14}}>{a.title||a.agency}</span>
              {a.opi&&<OPIBadge score={a.opi}/>}
              {a.days_until_deadline&&<Badge color={RED}>{a.days_until_deadline}d left</Badge>}
              {a.estimated_value&&<span style={{color:GREEN,fontSize:11,fontWeight:600}}>{a.estimated_value}</span>}
              {a.recompete&&<Badge color={BLUE}>RECOMPETE</Badge>}
            </div>
            <div style={{color:bc,fontWeight:600,fontSize:13}}>{a.headline}</div>
            {a.intel_headline&&<div style={{color:TEXT_D,fontSize:12,marginTop:4,fontStyle:'italic'}}>{a.intel_headline}</div>}
          </div>
          <div style={{flexShrink:0,display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
            <Btn small onClick={e=>{e.stopPropagation();setActive(a.action_module||'workflow');}} style={{background:bc+'22',color:bc,border:`1px solid ${bc}44`,whiteSpace:'nowrap'}}>{a.action_label||'Take Action'} →</Btn>
            <span style={{color:TEXT_D,fontSize:10}}>{open?'▲ hide':'▼ full intel'}</span>
          </div>
        </div>
        {open&&(
          <div style={{borderTop:`1px solid ${bc}22`,background:BG3,padding:'14px 16px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:12}}>
              {a.win_case&&<div><div style={{color:GREEN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}>WHY HGI WINS</div><div style={{color:TEXT_D,fontSize:12,lineHeight:1.6}}>{a.win_case}</div>{Array.isArray(a.why_hgi_wins)&&a.why_hgi_wins.slice(0,3).map((w,i)=><div key={i} style={{fontSize:11,color:TEXT_D,marginTop:i===0?6:2}}>✓ {w}</div>)}</div>}
              {a.competitor_intel&&<div><div style={{color:ORANGE,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}>COMPETITIVE INTEL</div><div style={{color:TEXT_D,fontSize:12,lineHeight:1.6}}>{a.competitor_intel}</div>{a.incumbent&&a.incumbent!==''&&<div style={{marginTop:6,fontSize:11,color:ORANGE}}>Incumbent: <strong>{a.incumbent}</strong></div>}</div>}
              {a.risk&&<div><div style={{color:RED,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}>KEY RISK</div><div style={{color:TEXT_D,fontSize:12,lineHeight:1.6}}>{a.risk}</div></div>}
              {Array.isArray(a.scope_of_work)&&a.scope_of_work.length>0&&<div><div style={{color:BLUE,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}>SCOPE</div>{a.scope_of_work.slice(0,3).map((s,i)=><div key={i} style={{fontSize:11,color:TEXT_D,marginBottom:3}}>· {s}</div>)}</div>}
            </div>
            {a.hgi_fit&&<div style={{padding:'8px 12px',background:GREEN+'11',border:`1px solid ${GREEN}22`,borderRadius:4,marginBottom:10,fontSize:12,color:TEXT}}><strong style={{color:GREEN}}>HGI FIT: </strong>{a.hgi_fit}</div>}
            {a.this_week_action&&<div style={{padding:'10px 14px',background:bc+'11',border:`1px solid ${bc}33`,borderRadius:4,marginBottom:10}}><div style={{color:bc,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}>⚡ THIS WEEK — DO THIS</div><div style={{color:TEXT,fontSize:13,fontWeight:600,lineHeight:1.5}}>{a.this_week_action}</div></div>}
            {Array.isArray(a.key_requirements)&&a.key_requirements.length>0&&<div style={{marginBottom:10}}><div style={{color:TEXT_D,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}>KEY REQUIREMENTS</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{a.key_requirements.map((r,i)=><Badge key={i} color={TEXT_D}>{r}</Badge>)}</div></div>}
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <Btn small onClick={()=>setActive(a.action_module||'workflow')} style={{background:bc+'22',color:bc,border:`1px solid ${bc}44`}}>{a.action_label||'Take Action'} →</Btn>
              {a.source_url&&<a href={a.source_url} target="_blank" rel="noopener noreferrer" style={{padding:'5px 12px',borderRadius:4,fontSize:11,fontWeight:700,background:BLUE+'22',color:BLUE,border:`1px solid ${BLUE}44`,textDecoration:'none'}}>View Source →</a>}
              <span style={{color:TEXT_D,fontSize:11,marginLeft:'auto'}}>{a.agency}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap'}}>
          <h2 style={{color:GOLD,margin:0,fontSize:22,fontWeight:800}}>{greeting()}, Christopher.</h2>
          <span style={{color:TEXT_D,fontSize:13}}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · {time}</span>
        </div>
      </div>

      {loading?(
        <Card style={{marginBottom:20,border:`1px solid ${GOLD}44`,padding:24}}><div style={{color:GOLD,fontSize:13,animation:'pulse 1.2s infinite'}}>⟳ Analyzing your pipeline and generating today's briefing...</div></Card>
      ):intel?.top_recommendation?(
        <Card style={{marginBottom:20,background:GOLD+'11',border:`2px solid ${GOLD}44`}}>
          <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
            <span style={{fontSize:24}}>🎯</span>
            <div>
              <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:6}}>TODAY'S PRIORITY</div>
              <div style={{color:TEXT,fontSize:14,lineHeight:1.7,fontWeight:500}}>{intel.top_recommendation}</div>
            </div>
          </div>
        </Card>
      ):(
        <Card style={{marginBottom:20,border:`1px solid ${BORDER}`}}>
          <div style={{color:TEXT_D,fontSize:13}}>
            {(stats.total_active||0)===0?'📭 Pipeline is empty. The scraper is running every 6 minutes. You can also paste an RFP directly into Full Workflow to get started now.':'✓ Pipeline healthy. No urgent actions right now.'}
          </div>
        </Card>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginBottom:20}}>
        {[['ACTIVE',stats.total_active||0,GOLD,'discovery'],['TIER 1',stats.tier1||0,GREEN,'tracker'],['PURSUING',stats.pursuing||0,GOLD,'tracker'],['IN PROPOSAL',stats.proposal||0,ORANGE,'proposal'],['SUBMITTED',stats.submitted||0,BLUE,'tracker'],['⚠ STALE',stats.stale||0,RED,'tracker'],['NEW TODAY',stats.new_today||0,GREEN,'discovery']].map(([l,v,c,m])=>(
          <div key={l} onClick={()=>setActive(m)} style={{background:BG2,border:`1px solid ${BORDER}`,borderBottom:`3px solid ${c}44`,borderRadius:6,padding:'12px 14px',cursor:'pointer',textAlign:'center'}}>
            <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:9,color:TEXT_D,letterSpacing:'0.08em',marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      {intel?.new_declarations?.length>0&&(
        <Card style={{marginBottom:20,border:`2px solid ${RED}44`,background:RED+'08'}}>
          <div style={{color:RED,fontWeight:700,fontSize:13,marginBottom:10}}>🚨 NEW DISASTER DECLARATIONS — HGI RESPONSE REQUIRED</div>
          {intel.new_declarations.map((d,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${BORDER}`,flexWrap:'wrap',gap:8}}>
              <div><div style={{color:TEXT,fontWeight:600,fontSize:13}}>{d.title}</div><div style={{color:TEXT_D,fontSize:11}}>{d.incident_type} · {d.state} · {new Date(d.date).toLocaleDateString()}</div></div>
              <Btn small onClick={()=>setActive('content')} style={{background:RED+'22',color:RED,border:`1px solid ${RED}44`}}>48-hr Response →</Btn>
            </div>
          ))}
        </Card>
      )}

      {!loading&&acts.length>0&&(
        <div style={{marginBottom:20}}>
          {crit.length>0&&<div style={{marginBottom:16}}><div style={{color:RED,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:8}}>🔴 CRITICAL — IMMEDIATE ACTION REQUIRED ({crit.length})</div>{crit.map((a,i)=><AC key={i} a={a} k={'c'+i}/>)}</div>}
          {hi.length>0&&<div style={{marginBottom:16}}><div style={{color:ORANGE,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:8}}>🟡 HIGH PRIORITY ({hi.length})</div>{hi.map((a,i)=><AC key={i} a={a} k={'h'+i}/>)}</div>}
          {med.length>0&&<div style={{marginBottom:16}}><div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:8}}>🔵 THIS WEEK ({med.length})</div>{med.map((a,i)=><AC key={i} a={a} k={'m'+i}/>)}</div>}
        </div>
      )}

      {intel?.market_pulse&&(
        <Card style={{marginBottom:20,border:`1px solid ${GOLD}22`,background:BG3}}>
          <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
            <span style={{fontSize:20}}>📡</span>
            <div><div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:'0.1em',marginBottom:6}}>MARKET PULSE — THIS WEEK</div><div style={{color:TEXT_D,fontSize:13,lineHeight:1.7}}>{intel.market_pulse}</div></div>
          </div>
        </Card>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:8}}>SCRAPER STATUS</div>
          <div style={{fontSize:10,color:TEXT_D,marginBottom:10,letterSpacing:'0.04em'}}>CENTRAL BIDDING · EVERY 6 MIN · PRIORITY SORTED</div>
          {stats.last_scraper_run ? (
            <div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:GREEN,flexShrink:0}}/>
                <span style={{fontSize:11,color:GREEN,fontWeight:600}}>LIVE — Last run {new Date(stats.last_scraper_run).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
                {[
                  ['Categories Covered',`${stats.scraper_categories_covered||0} / ${stats.scraper_total_categories||479}`],
                  ['Batches Today',`${stats.scraper_batches_today||0} runs`],
                  ['RFPs Reviewed',`${stats.scraper_rfps_reviewed_today||0} today`],
                  ['Sent to Pipeline',`${stats.opportunities_active_today||0} passed`],
                  ['Filtered Out',`${stats.opportunities_filtered_today||0} removed`],
                  ['Pending Review',`${stats.opportunities_pending_review||0} in queue`],
                ].map(([label,value])=>(
                  <div key={label} style={{background:BG3,borderRadius:4,padding:'6px 8px'}}>
                    <div style={{fontSize:9,color:TEXT_D,letterSpacing:'0.06em',marginBottom:2}}>{label.toUpperCase()}</div>
                    <div style={{fontSize:13,fontWeight:700,color:GOLD}}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{height:4,background:BG3,borderRadius:2,overflow:'hidden',marginBottom:4}}>
                <div style={{height:'100%',width:Math.min((stats.scraper_categories_covered||0)/479*100,100)+'%',background:GOLD,borderRadius:2,transition:'width 0.5s'}}/>
              </div>
              <div style={{fontSize:10,color:TEXT_D,display:'flex',justifyContent:'space-between'}}>
                <span>{Math.round(Math.min((stats.scraper_categories_covered||0)/479*100,100))}% of LA agencies scanned</span>
                <span>Next run ~{6-(Math.floor(Date.now()/60000)%6)} min</span>
              </div>
              {stats.top_verticals_today && stats.top_verticals_today !== 'none' && (
                <div style={{marginTop:8,fontSize:10,color:TEXT_D}}>
                  Top verticals: <span style={{color:GOLD}}>{stats.top_verticals_today}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{fontSize:11,color:TEXT_D}}>Waiting for first run...</div>
          )}
        </Card>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:10}}>QUICK START</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[['⚡','New RFP landed','workflow'],['◎','Check pipeline','discovery'],['✦','Draft proposal','proposal'],['◇','Weekly digest','digest']].map(([icon,label,mod])=>(
              <div key={mod} onClick={()=>setActive(mod)} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',background:BG3,borderRadius:4,cursor:'pointer',border:`1px solid ${BORDER}`}}>
                <span style={{fontSize:14}}>{icon}</span><span style={{color:TEXT_D,fontSize:12}}>{label}</span><span style={{color:GOLD,fontSize:11,marginLeft:'auto'}}>→</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card style={{border:`1px solid ${BORDER}`,background:BG3}}>
        <div style={{color:TEXT_D,fontSize:11,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}>WIN PATH</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
          {['Discover','Score','Research','Workflow','Proposal','Red Team','Export','Submit','WIN'].map((step,i,arr)=>(
            <React.Fragment key={step}>
              <div style={{padding:'3px 8px',borderRadius:3,background:BG2,border:`1px solid ${BORDER}`,fontSize:10,color:TEXT_D}}>{step}</div>
              {i<arr.length-1&&<span style={{color:BORDER,fontSize:10}}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <div style={{color:TEXT_D,fontSize:10,marginTop:8}}>Each opportunity in your pipeline has a position on this path. The system tells you exactly where it is and what's next.</div>
      </Card>
    </div>
  );
}