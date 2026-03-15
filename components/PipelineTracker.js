// ── PIPELINE TRACKER ──────────────────────────────────────────────────────────
const STAGES = [
  {id:"identified", label:"Identified", color:TEXT_D},
  {id:"qualifying", label:"Qualifying", color:BLUE},
  {id:"pursuing", label:"Pursuing", color:GOLD},
  {id:"proposal", label:"Proposal", color:ORANGE},
  {id:"submitted", label:"Submitted", color:"#9B59B6"},
  {id:"won", label:"Won", color:GREEN},
  {id:"lost", label:"Lost", color:RED},
];

function PipelineTracker({ goToWorkflow }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({title:"",agency:"",type:"",value:"",deadline:"",notes:"",stage:"identified",opiScore:""});
  const [aiNotes, setAiNotes] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [filterStage, setFilterStage] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showLossAnalysis, setShowLossAnalysis] = useState({});
  const [lossForm, setLossForm] = useState({});
  const [lossSubmitted, setLossSubmitted] = useState({});
  const setF = (k,v) => setForm(f => ({...f, [k]:v}));
  const filtered = filterStage === "all" ? items : items.filter(i => i.stage === filterStage);

  const WIN_PATH = ['identified','qualifying','pursuing','proposal','submitted','won'];
  const WIN_PATH_LABELS = {
    identified: 'Discovered',
    qualifying: 'Scored',
    pursuing: 'Workflow Done',
    proposal: 'Drafting',
    submitted: 'Submitted',
    won: 'WON'
  };
  
  const WinPathBar = ({ currentStage }) => {
    const currentIdx = WIN_PATH.indexOf(currentStage);
    return (
      <div style={{display:'flex', alignItems:'center', gap:2, marginTop:6, flexWrap:'wrap'}}>
        {WIN_PATH.map((stage, i) => (
          <div key={stage} style={{display:'flex', alignItems:'center', gap:2}}>
            <div style={{
              padding:'2px 6px', borderRadius:3, fontSize:9, fontWeight:600,
              background: i < currentIdx ? GREEN+'33' : i === currentIdx ? GOLD+'33' : BG3,
              color: i < currentIdx ? GREEN : i === currentIdx ? GOLD : TEXT_D,
              border: `1px solid ${i < currentIdx ? GREEN+'44' : i === currentIdx ? GOLD+'44' : BORDER}`
            }}>
              {i < currentIdx ? '✓ ' : i === currentIdx ? '▶ ' : ''}{WIN_PATH_LABELS[stage]}
            </div>
            {i < WIN_PATH.length - 1 && <span style={{color:BORDER, fontSize:8}}>›</span>}
          </div>
        ))}
      </div>
    );
  };

  // Fetch opportunities on mount
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        const response = await fetch('/api/opportunities');
        if (response.ok) {
          const data = await response.json();
          // Map Supabase columns to frontend field names
          const opps = data.opportunities || data || [];
          const mappedData = opps.map(item => ({
            id: item.id,
            title: item.title,
            agency: item.agency,
            type: item.vertical,
            value: item.estimated_value,
            deadline: item.due_date,
            notes: item.description,
            stage: item.stage,
            opiScore: item.opi_score,
            addedDate: item.created_at
          }));
          setItems(mappedData);
        }
      } catch (error) {
        console.error('Failed to fetch opportunities:', error);
      }
    };
    
    fetchOpportunities();
  }, []);

  const submit = async () => {
    if (!form.title) return;
    
    try {
      if (editItem) {
        // Update existing opportunity
        const response = await fetch(`/api/opportunities/${editItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            agency: form.agency,
            vertical: form.type,
            estimated_value: form.value,
            due_date: form.deadline,
            description: form.notes,
            stage: form.stage,
            opi_score: form.opiScore
          })
        });
        
        if (response.ok) {
          const updatedItem = await response.json();
          const mapped = {
            id: updatedItem.id,
            title: updatedItem.title,
            agency: updatedItem.agency,
            type: updatedItem.vertical,
            value: updatedItem.estimated_value,
            deadline: updatedItem.due_date,
            notes: updatedItem.description,
            stage: updatedItem.stage,
            opiScore: updatedItem.opi_score,
            addedDate: updatedItem.created_at
          };
          setItems(items.map(i => i.id === editItem.id ? mapped : i));
        }
      } else {
        // Create new opportunity
        const response = await fetch('/api/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            agency: form.agency,
            vertical: form.type,
            estimated_value: form.value,
            due_date: form.deadline,
            description: form.notes,
            stage: form.stage,
            opi_score: form.opiScore
          })
        });
        
        if (response.ok) {
          const newItem = await response.json();
          const mapped = {
            id: newItem.id,
            title: newItem.title,
            agency: newItem.agency,
            type: newItem.vertical,
            value: newItem.estimated_value,
            deadline: newItem.due_date,
            notes: newItem.description,
            stage: newItem.stage,
            opiScore: newItem.opi_score,
            addedDate: newItem.created_at
          };
          setItems([mapped, ...items]);
        }
      }
      
      setForm({title:"",agency:"",type:"",value:"",deadline:"",notes:"",stage:"identified",opiScore:""});
      setShowAdd(false);
      setEditItem(null);
    } catch (error) {
      console.error('Failed to submit opportunity:', error);
    }
  };

  const clearTestData = () => {
    const filtered = items.filter(item => 
      !item.title.includes("Untitled") && 
      !item.id.toString().startsWith("t-") && 
      !item.id.toString().startsWith("wf-")
    );
    setItems(filtered);
  };

  const cleanTestData = async () => {
    if (window.confirm("This will remove all entries with no title or titled 'Untitled'. Real opportunities will be kept. Continue?")) {
      const toDelete = items.filter(item => 
        !item.title || 
        item.title.trim() === "" || 
        item.title.trim() === "Untitled"
      );
      
      for (const item of toDelete) {
        try {
          await fetch(`/api/opportunities/${item.id}`, {
            method: 'DELETE'
          });
        } catch (error) {
          console.error('Failed to delete opportunity:', error);
        }
      }
      
      const filtered = items.filter(item => 
        item.title && 
        item.title.trim() !== "" && 
        item.title.trim() !== "Untitled"
      );
      setItems(filtered);
    }
  };

  const updateStage = async (itemId, newStage) => {
    try {
      const response = await fetch(`/api/opportunities/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
      
      if (response.ok) {
        setItems(items.map(i => i.id === itemId ? {...i, stage: newStage} : i));
        // Broadcast stage change event
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: newStage === 'won' ? 'opportunity.won' : newStage === 'lost' ? 'opportunity.lost' : 'opportunity.stage_changed',
            opportunity_id: itemId,
            source_module: 'pipeline_tracker',
            data: { new_stage: newStage }
          })
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
    }
  };

  const deleteItem = async (itemId) => {
    try {
      const response = await fetch(`/api/opportunities/${itemId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setItems(items.filter(i => i.id !== itemId));
        setSelectedItem(null);
      }
    } catch (error) {
      console.error('Failed to delete opportunity:', error);
    }
  };

  const getStrategy = async (item) => {
    setAiLoading(a => ({...a, [item.id]:true}));
    const txt = await callClaude("Capture strategy for HGI — stage: " + item.stage + ":\nTitle: " + item.title + "\nAgency: " + item.agency + "\nValue: " + item.value + "\nDecision: " + (item.decision||"N/A") + "\nOPI: " + (item.opiScore||"N/A") + "\n\nProvide: 3 actions this week, key intel to gather, teaming considerations, Pwin estimate.");
    setAiNotes(a => ({...a, [item.id]:txt}));
    setAiLoading(a => ({...a, [item.id]:false}));
  };

  const submitLossAnalysis = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    const form = lossForm[itemId] || {};
    
    try {
      const response = await fetch('/api/loss-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_title: item.title,
          agency: item.agency,
          vertical: item.type,
          winner_name: form.winner_name || '',
          winner_amount: form.winner_amount || '',
          our_bid_amount: form.our_bid_amount || '',
          notes: form.notes || '',
          date: new Date().toISOString().split('T')[0]
        })
      });
      
      if (response.ok) {
        setLossSubmitted(prev => ({...prev, [itemId]: true}));
        setShowLossAnalysis(prev => ({...prev, [itemId]: false}));
        setTimeout(() => {
          setLossSubmitted(prev => ({...prev, [itemId]: false}));
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to submit loss analysis:', error);
    }
  };

  const openItem = (item) => setSelectedItem(selectedItem && selectedItem.id === item.id ? null : item);
  const editBtn = (item) => {
    setForm({title:item.title,agency:item.agency||"",type:item.type||"",value:item.value||"",deadline:item.deadline||"",notes:item.notes||"",stage:item.stage,opiScore:item.opiScore||""});
    setEditItem(item); setShowAdd(true);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Pipeline Tracker</h2>
          <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>{items.length} opportunities tracked</p>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={cleanTestData}>Clean Test Data</Btn>
          <Btn onClick={()=>{setShowAdd(!showAdd);setEditItem(null);}}>+ Add Opportunity</Btn>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setFilterStage("all")} style={{padding:"4px 12px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"inherit",border:"none",background:filterStage==="all"?GOLD:BG3,color:filterStage==="all"?"#000":TEXT_D,fontWeight:filterStage==="all"?700:400}}>All ({items.length})</button>
        {STAGES.map(s => {
          const ct = items.filter(i=>i.stage===s.id).length;
          if(!ct) return null;
          return <button key={s.id} onClick={()=>setFilterStage(s.id)} style={{padding:"4px 12px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${s.color}44`,background:filterStage===s.id?s.color+"33":"transparent",color:filterStage===s.id?s.color:TEXT_D,fontWeight:filterStage===s.id?700:400}}>{s.label} ({ct})</button>;
        })}
      </div>
      {showAdd && (
        <Card style={{marginBottom:16,border:`1px solid ${GOLD}44`}}>
          <h3 style={{color:GOLD,margin:"0 0 12px",fontSize:14}}>{editItem?"Edit Opportunity":"New Opportunity"}</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Input value={form.title} onChange={v=>setF("title",v)} placeholder="Opportunity Title*" style={{gridColumn:"1/-1"}} />
            <Input value={form.agency} onChange={v=>setF("agency",v)} placeholder="Agency / Client" />
            <Input value={form.type} onChange={v=>setF("type",v)} placeholder="Type (FEMA PA, TPA, CDBG-DR...)" />
            <Input value={form.value} onChange={v=>setF("value",v)} placeholder="Est. Value (e.g. $5M)" />
            <Input value={form.deadline} onChange={v=>setF("deadline",v)} placeholder="Deadline (YYYY-MM-DD)" />
            <Input value={form.opiScore} onChange={v=>setF("opiScore",v)} placeholder="OPI Score (0-100)" />
            <Sel value={form.stage} onChange={v=>setF("stage",v)} options={STAGES.map(s=>({value:s.id,label:s.label}))} style={{gridColumn:"1/-1"}} />
            <Textarea value={form.notes} onChange={v=>setF("notes",v)} placeholder="Notes, context, next actions..." rows={2} style={{gridColumn:"1/-1"}} />
          </div>
          <div style={{marginTop:12,display:"flex",gap:8}}>
            <Btn onClick={submit}>{editItem?"Save Changes":"Add to Pipeline"}</Btn>
            <Btn variant="secondary" onClick={()=>{setShowAdd(false);setEditItem(null);}}>Cancel</Btn>
          </div>
        </Card>
      )}
      {!filtered.length && (
        <Card style={{textAlign:"center",padding:48,border:`1px dashed ${BORDER}`}}>
          <div style={{fontSize:32,marginBottom:12}}>◈</div>
          <div style={{color:TEXT_D,fontSize:14,marginBottom:16}}>{filterStage==="all" ? "No opportunities tracked yet" : "No opportunities in this stage"}</div>
          {filterStage==="all" && <Btn onClick={()=>setShowAdd(true)}>+ Add First Opportunity</Btn>}
        </Card>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(item => {
          const stage = STAGES.find(s=>s.id===item.stage) || STAGES[0];
          const isOpen = selectedItem && selectedItem.id === item.id;
          const decColor = item.decision==="GO"?GREEN:item.decision==="CONDITIONAL GO"?GOLD:item.decision==="NO-BID"?RED:TEXT_D;
          return (
            <div key={item.id} style={{background:BG2,border:`1px solid ${isOpen?GOLD:BORDER}`,borderRadius:6,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer"}} onClick={()=>openItem(item)}>
                <div style={{width:10,height:10,borderRadius:"50%",background:stage.color,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,color:TEXT,fontSize:13,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                  <div style={{fontSize:11,color:TEXT_D}}>{item.agency}{item.type?" · "+item.type:""}</div>
                  <WinPathBar currentStage={item.stage} />
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {item.value && <span style={{color:GREEN,fontSize:12,fontWeight:700}}>{item.value}</span>}
                  {item.deadline && <span style={{color:ORANGE,fontSize:11}}>Due: {item.deadline}</span>}
                  {item.opiScore && <OPIBadge score={item.opiScore} />}
                  {item.decision && <Badge color={decColor}>{item.decision}</Badge>}
                  <Badge color={stage.color}>{stage.label}</Badge>
                  <span style={{color:TEXT_D,fontSize:14}}>{isOpen?"▲":"▼"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{borderTop:`1px solid ${BORDER}`,padding:16,background:BG3}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                    <div>
                      <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>OPPORTUNITY DETAILS</div>
                      {[["Agency",item.agency],["Type",item.type],["Value",item.value],["Deadline",item.deadline],["Decision",item.decision],["OPI Score",item.opiScore],["Added",item.addedDate?new Date(item.addedDate).toLocaleDateString():""]].map(([k,v])=>v?(
                        <div key={k} style={{display:"flex",gap:8,marginBottom:4,fontSize:12}}>
                          <span style={{color:TEXT_D,minWidth:80}}>{k}:</span>
                          <span style={{color:TEXT}}>{v}</span>
                        </div>
                      ):null)}
                    </div>
                    <div>
                      <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>STAGE</div>
                      <Label text="MOVE TO STAGE" />
                      <Sel value={item.stage} onChange={v=>updateStage(item.id,v)}
                        options={STAGES.map(s=>({value:s.id,label:s.label}))} style={{width:"100%",marginBottom:10}} />
                      
                      {item.stage === 'lost' && (
                        <div style={{marginTop:12,padding:12,background:BG2,borderRadius:4,border:`1px solid ${RED}33`}}>
                          {lossSubmitted[item.id] ? (
                            <div style={{color:GREEN,fontSize:12,fontWeight:700}}>Loss logged — competitive intel saved</div>
                          ) : !showLossAnalysis[item.id] ? (
                            <Btn small onClick={()=>setShowLossAnalysis(prev => ({...prev, [item.id]: true}))}>Log Loss Analysis</Btn>
                          ) : (
                            <div>
                              <div style={{color:RED,fontSize:11,fontWeight:700,marginBottom:8}}>LOSS ANALYSIS</div>
                              <div style={{display:"grid",gap:8}}>
                                <Input 
                                  value={lossForm[item.id]?.winner_name || ''} 
                                  onChange={v=>setLossForm(prev => ({...prev, [item.id]: {...(prev[item.id]||{}), winner_name: v}}))} 
                                  placeholder="Winner Name" 
                                  style={{fontSize:11}} 
                                />
                                <Input 
                                  value={lossForm[item.id]?.winner_amount || ''} 
                                  onChange={v=>setLossForm(prev => ({...prev, [item.id]: {...(prev[item.id]||{}), winner_amount: v}}))} 
                                  placeholder="Their Price" 
                                  style={{fontSize:11}} 
                                />
                                <Input 
                                  value={lossForm[item.id]?.our_bid_amount || ''} 
                                  onChange={v=>setLossForm(prev => ({...prev, [item.id]: {...(prev[item.id]||{}), our_bid_amount: v}}))} 
                                  placeholder="Our Price" 
                                  style={{fontSize:11}} 
                                />
                                <Textarea 
                                  value={lossForm[item.id]?.notes || ''} 
                                  onChange={v=>setLossForm(prev => ({...prev, [item.id]: {...(prev[item.id]||{}), notes: v}}))} 
                                  placeholder="What happened..." 
                                  rows={2} 
                                  style={{fontSize:11}} 
                                />
                                <div style={{display:"flex",gap:6,marginTop:4}}>
                                  <Btn small onClick={()=>submitLossAnalysis(item.id)}>Submit</Btn>
                                  <Btn small variant="secondary" onClick={()=>setShowLossAnalysis(prev => ({...prev, [item.id]: false}))}>Cancel</Btn>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {item.notes && <div style={{fontSize:12,color:TEXT_D,fontStyle:"italic",marginTop:4}}>{item.notes}</div>}
                    </div>
                  </div>
                  {(item.decomposition||item.execBrief) && (
                    <div style={{marginBottom:12,padding:"8px 12px",background:BG2,borderRadius:4,border:`1px solid ${BORDER}`}}>
                      <div style={{color:GOLD,fontSize:11,fontWeight:700,marginBottom:6}}>STORED ARTIFACTS</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {item.decomposition && <Badge color={GOLD}>RFP Decomposition</Badge>}
                        {item.execBrief && <Badge color={GOLD}>Executive Brief</Badge>}
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Btn small onClick={()=>getStrategy(item)} disabled={aiLoading[item.id]}>{aiLoading[item.id]?"Getting Strategy...":"Get Capture Strategy"}</Btn>
                    <Btn small variant="secondary" onClick={()=>editBtn(item)}>Edit</Btn>
                    <Btn small variant="danger" onClick={()=>deleteItem(item.id)}>Delete</Btn>
                  </div>
                  {(aiLoading[item.id]||aiNotes[item.id]) && (
                    <div style={{marginTop:12}}><AIOut content={aiNotes[item.id]} loading={aiLoading[item.id]} label="CAPTURE STRATEGY" /></div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}