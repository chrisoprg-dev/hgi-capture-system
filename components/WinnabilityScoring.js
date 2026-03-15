// ── WINNABILITY SCORING ───────────────────────────────────────────────────────
function WinnabilityScoring() {
  const [f, setF] = useState({title:"",agency:"",value:"",type:"",hgiPP:5,budget:5,timeline:5,incumbent:"",competitors:"",teaming:"",revenueTimeline:"near",context:""});
  const [score, setScore] = useState("");
  const [simResult, setSimResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const upd = (k,v) => setF(p => ({...p, [k]:v}));

  const compute = async () => {
    setLoading(true);
    const txt = await callClaude(
      "Score HGI winnability AND OPI:\nOpportunity: " + f.title + "\nAgency: " + f.agency + "\nType: " + f.type + "\nValue: " + f.value + "\nRevenue Timeline: " + f.revenueTimeline + "\nHGI PP Match (1-10): " + f.hgiPP + "\nIncumbent: " + (f.incumbent||"Unknown") + "\nTeaming: " + (f.teaming||"Unknown") + "\nBudget certainty (1-10): " + f.budget + "\nCompetitors: " + (f.competitors||"Unknown") + "\nContext: " + f.context + "\n\nProvide:\n1. Pwin X/100 with sub-scores\n2. OPI X/100 with sub-scores\n3. Priority Tier (Tier 1/2/3/Archive)\n4. Recommendation\n5. Top 3 actions to increase win probability"
    );
    setScore(txt);
    
    // Parallel win simulation call
    fetch('/api/win-simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: f.title,
        agency: f.agency,
        vertical: f.type,
        opi_score: f.hgiPP * 10,
        competitors: f.competitors,
        incumbent: f.incumbent,
        relationship_strength: 'Warm',
        budget_certainty: f.budget,
        hgi_pp_match: f.hgiPP,
        notes: f.context
      })
    })
    .then(res => res.json())
    .then(data => setSimResult(data))
    .catch(err => console.log('Win simulation error:', err));
    
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{color:GOLD,margin:"0 0 20px",fontSize:20,fontWeight:800}}>Winnability Scoring</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <h3 style={{color:GOLD,margin:"0 0 14px",fontSize:14}}>OPPORTUNITY DETAILS</h3>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div><Label text="TITLE" /><Input value={f.title} onChange={v=>upd("title",v)} placeholder="Opportunity name" /></div>
            <div><Label text="AGENCY" /><Input value={f.agency} onChange={v=>upd("agency",v)} placeholder="Agency/client" /></div>
            <div><Label text="EST. VALUE" /><Input value={f.value} onChange={v=>upd("value",v)} placeholder="$50M" /></div>
            <div><Label text="TYPE" /><Input value={f.type} onChange={v=>upd("type",v)} placeholder="FEMA PA, TPA, CDBG-DR..." /></div>
            <div><Label text="KNOWN INCUMBENT" /><Input value={f.incumbent} onChange={v=>upd("incumbent",v)} placeholder="ICF / None / Unknown" /></div>
            <div><Label text="COMPETITORS" /><Input value={f.competitors} onChange={v=>upd("competitors",v)} placeholder="Witt, Hagerty, Dewberry..." /></div>
            <div><Label text="TEAMING NEEDED" /><Input value={f.teaming} onChange={v=>upd("teaming",v)} placeholder="Yes — need construction sub / No" /></div>
            <div><Label text="REVENUE TIMELINE" />
              <Sel value={f.revenueTimeline} onChange={v=>upd("revenueTimeline",v)} options={[
                {value:"immediate",label:"Immediate (<90 days)"},
                {value:"near",label:"Near-term (90-180 days)"},
                {value:"medium",label:"Medium (180-365 days)"},
                {value:"long",label:"Long-term (365+ days)"}
              ]} style={{width:"100%"}} />
            </div>
          </div>
        </Card>
        <Card>
          <h3 style={{color:GOLD,margin:"0 0 14px",fontSize:14}}>SCORING FACTORS</h3>
          {[["hgiPP","HGI PAST PERFORMANCE MATCH"],["budget","BUDGET CERTAINTY"],["timeline","TIMELINE FEASIBILITY"]].map(([k,label]) => (
            <div key={k} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <Label text={label} /><span style={{color:GOLD,fontSize:12,fontWeight:700}}>{f[k]}/10</span>
              </div>
              <input type="range" min="1" max="10" value={f[k]} onChange={e=>upd(k,parseInt(e.target.value))} style={{width:"100%",accentColor:GOLD}} />
            </div>
          ))}
          <div style={{marginTop:10}}><Label text="ADDITIONAL CONTEXT" />
            <Textarea value={f.context} onChange={v=>upd("context",v)} placeholder="Agency relationships, political context..." rows={4} />
          </div>
          <Btn onClick={compute} disabled={loading||!f.title} style={{marginTop:12,width:"100%"}}>
            {loading ? "Calculating..." : "Calculate Pwin + OPI"}
          </Btn>
        </Card>
      </div>
      {(loading||score) && <div style={{marginTop:20}}><AIOut content={score} loading={loading} label="PWIN + OPI ANALYSIS" /></div>}
      {simResult && (
        <div style={{marginTop:20}}>
          <Card>
            <h3 style={{color:GOLD,margin:"0 0 14px",fontSize:14}}>WIN SIMULATION</h3>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <div style={{fontSize:36,fontWeight:800,color:GOLD}}>{simResult.pwin}%</div>
                <Label text="PWIN" />
              </div>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:WHITE}}>{simResult.opi_recommended}</div>
                <Label text="RECOMMENDED OPI" />
              </div>
              {simResult.top_3_actions && (
                <div>
                  <Label text="TOP 3 ACTIONS" />
                  <ul style={{margin:"4px 0 0 16px",padding:0,color:WHITE}}>
                    {simResult.top_3_actions.map((action, i) => (
                      <li key={i} style={{marginBottom:4}}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}