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
  const [items, setItems] = useState(() => store.get("tracker") || []);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({title:"",agency:"",type:"",value:"",deadline:"",notes:"",stage:"identified",opiScore:""});
  const [aiNotes, setAiNotes] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [filterStage, setFilterStage] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const setF = (k,v) => setForm(f => ({...f, [k]:v}));
  const save = (d) => { setItems(d); store.set("tracker", d); };
  const filtered = filterStage === "all" ? items : items.filter(i => i.stage === filterStage);

  const submit = () => {
    if (!form.title) return;
    const updated = editItem
      ? items.map(i => i.id === editItem.id ? {...i,...form} : i)
      : [{id:"t-"+Date.now(),...form,addedDate:new Date().toISOString()}, ...items];
    save(updated);
    setForm({title:"",agency:"",type:"",value:"",deadline:"",notes:"",stage:"identified",opiScore:""});
    setShowAdd(false); setEditItem(null);
  };

  const clearTestData = () => {
    const filtered = items.filter(item => 
      !item.title.includes("Untitled") && 
      !item.id.startsWith("t-") && 
      !item.id.startsWith("wf-")
    );
    save(filtered);
  };

  const getStrategy = async (item) => {
    setAiLoading(a => ({...a, [item.id]:true}));
    const txt = await callClaude("Capture strategy for HGI — stage: " + item.stage + ":\nTitle: " + item.title + "\nAgency: " + item.agency + "\nValue: " + item.value + "\nDecision: " + (item.decision||"N/A") + "\nOPI: " + (item.opiScore||"N/A") + "\n\nProvide: 3 actions this week, key intel to gather, teaming considerations, Pwin estimate.");
    setAiNotes(a => ({...a, [item.id]:txt}));
    setAiLoading(a => ({...a, [item.id]:false}));
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
          <Btn variant="secondary" onClick={clearTestData}>Clear Test Data</Btn>
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
                      <Sel value={item.stage} onChange={v=>save(items.map(i=>i.id===item.id?{...i,stage:v}:i))}
                        options={STAGES.map(s=>({value:s.id,label:s.label}))} style={{width:"100%",marginBottom:10}} />
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
                    <Btn small variant="danger" onClick={()=>{save(items.filter(i=>i.id!==item.id));setSelectedItem(null);}}>Delete</Btn>
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