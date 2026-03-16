// ── WEEKLY DIGEST ─────────────────────────────────────────────────────────────
function WeeklyDigest() {
  var pl = usePipeline();
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const exportDocx = async () => {
    if (!result) return;
    try {
      const resp = await fetch('/api/export-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'digest',
          title: 'Weekly Capture Intelligence Digest',
          agency: 'HGI Leadership',
          content: result,
          metadata: {
            'Week Of': new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'}),
            'Pipeline Count': pl.pipeline.length ? pl.pipeline.length + ' active opportunities' : 'N/A',
            'Prepared For': 'Lou Resweber, Candy LeBlanc Dottolo, HGI Leadership'
          }
        })
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'HGI_Weekly_Digest_' + new Date().toISOString().slice(0,10) + '.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert('Export failed: ' + e.message); }
  };
  const [digests, setDigests] = useState(() => store.get("digests") || []);

  const generate = async () => {
    setLoading(true);
    try {
      const pipelineRes = await fetch('/api/opportunities?limit=50&sort=opi_score.desc');
      const pipelineData = pipelineRes.ok ? await pipelineRes.json() : { opportunities: [] };
      const opps = pipelineData.opportunities || [];
      const pipeline = opps.slice(0, 10).map(o => '- ' + o.title + ' | ' + o.agency + ' | OPI: ' + o.opi_score + ' | Due: ' + (o.due_date || 'TBD') + ' | ' + (o.urgency || '')).join('\n') || 'No active pipeline entries yet';
      const dateStr = new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
      const txt = await callClaude(
        'Generate HGI Weekly Capture Intelligence Digest for week of ' + dateStr + '.\n\n' +
        (focus ? 'SPECIAL FOCUS: ' + focus + '\n\n' : '') +
        'LIVE PIPELINE (' + opps.length + ' active opportunities):\n' + pipeline + '\n\n' +
        'HGI CONTEXT: Hammerman & Gainer LLC, 95 years, disaster recovery, FEMA PA, CDBG-DR, TPA/claims, property tax appeals, workforce services. Louisiana-based.\n\n' +
        'Include:\n## EXECUTIVE SUMMARY\n## HOT OPPORTUNITIES (top 3 to pursue NOW)\n## RECOMPETE WATCHLIST\n## UPCOMING DEADLINES\n## THIS WEEK CAPTURE PRIORITIES\n## MARKET INTELLIGENCE'
      );
      setResult(txt);
      const newDigests = [{date: dateStr, content: txt}, ...digests].slice(0, 10);
      setDigests(newDigests);
      store.set('digests', newDigests);
    } catch(e) {
      setResult('Error generating digest: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{color:GOLD,margin:"0 0 4px",fontSize:20,fontWeight:800}}>Weekly Digest</h2>
      <p style={{color:TEXT_D,margin:"0 0 12px",fontSize:12}}>AI-generated capture intelligence brief for HGI leadership — pulls live pipeline data</p>
      {!pl.loading && pl.pipeline.length > 0 && React.createElement('div',{style:{marginBottom:16,padding:'8px 12px',background:GREEN+'11',border:'1px solid '+GREEN+'33',borderRadius:4,fontSize:12,color:GREEN}},'✓ ' + pl.pipeline.length + ' active opportunities in pipeline will be included in digest')}
      <Card style={{marginBottom:20}}>
        <Label text="SPECIAL FOCUS AREAS (optional)" />
        <Input value={focus} onChange={setFocus} placeholder="e.g. FEMA PA recompetes, Texas TPA, Florida recovery..." />
        <Btn onClick={generate} disabled={loading} style={{marginTop:12}}>{loading?"Generating...":"Generate This Week Digest"}</Btn>
      </Card>
      <div>
        {result && !loading && <div style={{display:'flex',justifyContent:'flex-end',marginBottom:8}}><button onClick={exportDocx} style={{background:'#1F3864',color:'#C9A84C',border:'1px solid #C9A84C',borderRadius:4,padding:'6px 16px',fontSize:12,fontWeight:700,cursor:'pointer',letterSpacing:'0.05em'}}>⬇ Export .docx</button></div>}
        <AIOut content={result} loading={loading} label="WEEKLY DIGEST" />
      </div>
      {digests.length > 0 && (
        <div style={{marginTop:24}}>
          <div style={{color:GOLD_D,fontSize:11,fontWeight:700,letterSpacing:"0.1em",marginBottom:10}}>ARCHIVED DIGESTS</div>
          {digests.map((d,i) => (
            <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${BORDER}`,cursor:"pointer",color:i===0?GOLD:TEXT_D,fontSize:13}}
              onClick={()=>setResult(d.content)}>{d.date}</div>
          ))}
        </div>
      )}
    </div>
  );
}