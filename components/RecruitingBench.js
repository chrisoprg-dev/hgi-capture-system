// ── RECRUITING ────────────────────────────────────────────────────────────────
function RecruitingBench() {
  const [bench, setBench] = useState(() => store.get("bench") || []);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({name:"",role:"",domain:"",clearance:"",location:"",availability:"",notes:""});
  const [gapText, setGapText] = useState("");
  const [gapResult, setGapResult] = useState("");
  const [gapLoading, setGapLoading] = useState(false);
  const setF = (k,v) => setForm(f => ({...f,[k]:v}));
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

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Recruiting & Bench</h2>
          <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>{bench.length} bench members tracked</p>
        </div>
        <Btn style={{marginLeft:"auto"}} onClick={()=>setShowAdd(!showAdd)}>+ Add Person</Btn>
      </div>
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
            <Btn small variant="danger" style={{marginTop:10}} onClick={()=>save(bench.filter(b=>b.id!==p.id))}>Remove</Btn>
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
  );
}
