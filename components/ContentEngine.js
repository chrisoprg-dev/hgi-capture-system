// ── CONTENT ENGINE ────────────────────────────────────────────────────────────
function ContentEngine() {
  const [tab, setTab] = useState('thought');
  const [tl, setTl] = useState({topic:'',audience:'',format:'article'});
  const [ppq, setPpq] = useState({agency:'',vertical:'disaster',rfp_context:'',evaluation_criteria:''});
  const [team, setTeam] = useState({opportunity_title:'',agency:'',vertical:'disaster',set_aside:'',value:'',scope:''});
  const [dis, setDis] = useState({disaster_name:'',state:'LA',incident_type:'Hurricane',declaration_date:'',estimated_damage:''});
  const [result, setResult] = useState('');
  const [result2, setResult2] = useState('');
  const [result3, setResult3] = useState('');
  const [result4, setResult4] = useState('');
  const [loading, setLoading] = useState(false);

  const post = async (url, body) => {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    return r.json();
  };

  const runTL = async () => {
    setLoading(true); setResult('');
    const d = await post('/api/thought-leadership', { action: tl.format, topic: tl.topic, audience: tl.audience });
    setResult(d.content || d.error || 'No response');
    setLoading(false);
  };

  const runPPQ = async (action) => {
    setLoading(true); setResult('');
    const d = await post('/api/ppq-automation', { action, ...ppq });
    setResult(d.ppq || d.matched_pp || d.error || 'No response');
    setLoading(false);
  };

  const runTeam = async () => {
    setLoading(true); setResult('');
    const d = await post('/api/teaming-radar', { action:'analyze', ...team });
    setResult(d.analysis || d.error || 'No response');
    setLoading(false);
  };

  const runDisaster = async () => {
    setLoading(true); setResult(''); setResult2(''); setResult3(''); setResult4('');
    const d = await post('/api/disaster-response-protocol', dis);
    setResult(d.brief || '');
    setResult2(d.opportunities || '');
    setResult3(d.outreach_letter || '');
    setResult4(d.capture_timeline || '');
    setLoading(false);
  };

  const TABS = [['thought','Thought Leadership'],['ppq','PPQ Generator'],['teaming','Teaming Radar'],['disaster','Disaster Protocol']];

  return (
    <div>
      <h2 style={{color:GOLD,margin:'0 0 4px',fontSize:20,fontWeight:800}}>Content Engine</h2>
      <p style={{color:TEXT_D,margin:'0 0 16px',fontSize:12}}>Thought Leadership · Past Performance · Teaming · Disaster Response</p>

      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:`1px solid ${BORDER}`,paddingBottom:8}}>
        {TABS.map(([id,label]) => (
          <button key={id} onClick={()=>{setTab(id);setResult('');setResult2('');setResult3('');setResult4('');}} style={{padding:'6px 14px',borderRadius:4,fontSize:12,cursor:'pointer',fontFamily:'inherit',background:tab===id?GOLD:'transparent',color:tab===id?'#000':TEXT_D,border:`1px solid ${tab===id?GOLD:BORDER}`,fontWeight:tab===id?700:400}}>{label}</button>
        ))}
      </div>

      {tab==='thought' && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div><Label text="TOPIC" /><Input value={tl.topic} onChange={v=>setTl(t=>({...t,topic:v}))} placeholder="e.g. Lessons from Road Home — what $12B taught us about disaster recovery" /></div>
              <div><Label text="AUDIENCE" /><Input value={tl.audience} onChange={v=>setTl(t=>({...t,audience:v}))} placeholder="e.g. State emergency management directors, HUD grantees" /></div>
              <div><Label text="FORMAT" /><Sel value={tl.format} onChange={v=>setTl(t=>({...t,format:v}))} options={[{value:'article',label:'Article (600-800 words)'},{value:'linkedin',label:'LinkedIn Post'},{value:'capability_statement',label:'Capability Statement'},{value:'white_paper_outline',label:'White Paper Outline'}]} style={{width:'100%'}} /></div>
              <Btn onClick={runTL} disabled={loading||!tl.topic}>{loading?'Generating...':'Generate Content'}</Btn>
            </div>
          </Card>
          {result && <AIOut content={result} label="GENERATED CONTENT" />}
        </div>
      )}

      {tab==='ppq' && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div><Label text="AGENCY" /><Input value={ppq.agency} onChange={v=>setPpq(p=>({...p,agency:v}))} placeholder="e.g. Louisiana OCD-DRU" /></div>
                <div><Label text="VERTICAL" /><Sel value={ppq.vertical} onChange={v=>setPpq(p=>({...p,vertical:v}))} options={[{value:'disaster',label:'Disaster Recovery'},{value:'tpa',label:'TPA/Claims'},{value:'workforce',label:'Workforce'},{value:'health',label:'Health'},{value:'infrastructure',label:'Infrastructure'},{value:'federal',label:'Federal'}]} style={{width:'100%'}} /></div>
              </div>
              <div><Label text="EVALUATION CRITERIA" /><Input value={ppq.evaluation_criteria} onChange={v=>setPpq(p=>({...p,evaluation_criteria:v}))} placeholder="e.g. Technical approach 40%, Past performance 30%, Price 30%" /></div>
              <div><Label text="RFP CONTEXT" /><Textarea value={ppq.rfp_context} onChange={v=>setPpq(p=>({...p,rfp_context:v}))} placeholder="Paste key RFP requirements..." rows={4} /></div>
              <div style={{display:'flex',gap:8}}>
                <Btn onClick={()=>runPPQ('generate_ppq')} disabled={loading||!ppq.agency}>{loading?'Generating...':'Generate PPQ Responses'}</Btn>
                <Btn variant="secondary" onClick={()=>runPPQ('match_pp')} disabled={loading||!ppq.rfp_context}>{loading?'Matching...':'Match Best Past Performance'}</Btn>
              </div>
            </div>
          </Card>
          {result && <AIOut content={result} label="PPQ / PAST PERFORMANCE" />}
        </div>
      )}

      {tab==='teaming' && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <Input value={team.opportunity_title} onChange={v=>setTeam(t=>({...t,opportunity_title:v}))} placeholder="Opportunity Title" />
              <Input value={team.agency} onChange={v=>setTeam(t=>({...t,agency:v}))} placeholder="Agency" />
              <Sel value={team.vertical} onChange={v=>setTeam(t=>({...t,vertical:v}))} options={[{value:'disaster',label:'Disaster Recovery'},{value:'tpa',label:'TPA/Claims'},{value:'workforce',label:'Workforce'},{value:'health',label:'Health'},{value:'infrastructure',label:'Infrastructure'},{value:'federal',label:'Federal'}]} style={{width:'100%'}} />
              <Input value={team.set_aside} onChange={v=>setTeam(t=>({...t,set_aside:v}))} placeholder="Set-Aside (if any)" />
              <Input value={team.value} onChange={v=>setTeam(t=>({...t,value:v}))} placeholder="Estimated Value" />
            </div>
            <Textarea value={team.scope} onChange={v=>setTeam(t=>({...t,scope:v}))} placeholder="Scope of work..." rows={3} />
            <Btn onClick={runTeam} disabled={loading||!team.opportunity_title} style={{marginTop:10}}>{loading?'Analyzing...':'Analyze Teaming Strategy'}</Btn>
          </Card>
          {result && <AIOut content={result} label="TEAMING ANALYSIS" />}
        </div>
      )}

      {tab==='disaster' && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <Input value={dis.disaster_name} onChange={v=>setDis(d=>({...d,disaster_name:v}))} placeholder="Disaster Name (e.g. Hurricane Francine)" />
              <Sel value={dis.state} onChange={v=>setDis(d=>({...d,state:v}))} options={[{value:'LA',label:'Louisiana'},{value:'TX',label:'Texas'},{value:'FL',label:'Florida'},{value:'MS',label:'Mississippi'},{value:'AL',label:'Alabama'},{value:'GA',label:'Georgia'}]} style={{width:'100%'}} />
              <Sel value={dis.incident_type} onChange={v=>setDis(d=>({...d,incident_type:v}))} options={[{value:'Hurricane',label:'Hurricane'},{value:'Flood',label:'Flood'},{value:'Tornado',label:'Tornado'},{value:'Wildfire',label:'Wildfire'},{value:'Other',label:'Other'}]} style={{width:'100%'}} />
              <Input value={dis.declaration_date} onChange={v=>setDis(d=>({...d,declaration_date:v}))} placeholder="Declaration Date (YYYY-MM-DD)" />
              <Input value={dis.estimated_damage} onChange={v=>setDis(d=>({...d,estimated_damage:v}))} placeholder="Estimated Damage (e.g. $2.4B)" style={{gridColumn:'1/-1'}} />
            </div>
            <Btn onClick={runDisaster} disabled={loading||!dis.disaster_name}>{loading?'Generating Response Package...':'Generate Full Disaster Response Package'}</Btn>
          </Card>
          {loading && <Card style={{textAlign:'center',padding:32,color:GOLD}}>Generating 4-part response package...</Card>}
          {result && <div style={{marginBottom:16}}><AIOut content={result} label="48-HOUR BRIEF" /></div>}
          {result2 && <div style={{marginBottom:16}}><AIOut content={result2} label="PROCUREMENT OPPORTUNITIES" /></div>}
          {result3 && <div style={{marginBottom:16}}><AIOut content={result3} label="OUTREACH LETTER" /></div>}
          {result4 && <AIOut content={result4} label="90-DAY CAPTURE TIMELINE" />}
        </div>
      )}
    </div>
  );
}