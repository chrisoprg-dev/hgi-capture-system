// ── WEEKLY DIGEST ─────────────────────────────────────────────────────────────
function WeeklyDigest() {
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [digests, setDigests] = useState(() => store.get("digests") || []);

  const generate = async () => {
    setLoading(true);
    const tracker = store.get("tracker") || [];
    const pipeline = tracker.slice(0,5).map(o => "- " + o.title + " (" + o.stage + (o.opiScore?", OPI:"+o.opiScore:"") + ")").join("\n") || "No active pipeline entries";
    const dateStr = new Date().toLocaleDateString("en-US", {weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const txt = await callClaude(
      "Generate HGI Weekly Capture Intelligence Digest for week of " + dateStr + ".\n\n" +
      (focus ? "SPECIAL FOCUS: " + focus + "\n\n" : "") +
      "ACTIVE PIPELINE:\n" + pipeline + "\n\n" +
      "Include:\n## EXECUTIVE SUMMARY\n## HOT OPPORTUNITIES\n## RECOMPETE WATCHLIST\n## INTELLIGENCE UPDATES\n## COMPETITIVE INTEL\n## THIS WEEK CAPTURE PRIORITIES\n## UPCOMING DEADLINES\n## MARKET TRENDS"
    );
    setResult(txt);
    const newDigests = [{date:dateStr, content:txt}, ...digests].slice(0,10);
    setDigests(newDigests); store.set("digests", newDigests);
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{color:GOLD,margin:"0 0 4px",fontSize:20,fontWeight:800}}>Weekly Digest</h2>
      <p style={{color:TEXT_D,margin:"0 0 20px",fontSize:12}}>AI-generated capture intelligence brief for HGI leadership</p>
      <Card style={{marginBottom:20}}>
        <Label text="SPECIAL FOCUS AREAS (optional)" />
        <Input value={focus} onChange={setFocus} placeholder="e.g. FEMA PA recompetes, Texas TPA, Florida recovery..." />
        <Btn onClick={generate} disabled={loading} style={{marginTop:12}}>{loading?"Generating...":"Generate This Week Digest"}</Btn>
      </Card>
      <AIOut content={result} loading={loading} label="WEEKLY DIGEST" />
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
