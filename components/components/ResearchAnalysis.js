// ── RESEARCH ─────────────────────────────────────────────────────────────────
function ResearchAnalysis({ sharedCtx={}, saveSharedCtx=()=>{} }) {
  const [agencyName, setAgencyName] = useState("");
  const [oppType, setOppType] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const txt = await callClaude("Deep research for HGI capture:\nAgency: " + agencyName + "\nOpportunity Type: " + oppType + "\nKnown Competitors: " + competitors + "\nContext: " + context + "\n\nProvide:\n1. Agency Profile\n2. Funding Landscape\n3. Competitive Intel\n4. Relationship Map\n5. Win Strategy — 5 specific recommendations\n6. Red Flags\n7. Intel Gaps");
    setResult(txt);
    saveSharedCtx({ research: txt, researchAgency: agencyName });
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{color:GOLD,margin:"0 0 8px",fontSize:20,fontWeight:800}}>Research & Analysis</h2>
      <p style={{color:TEXT_D,margin:"0 0 12px",fontSize:12}}>Research feeds automatically into your Executive Brief and Proposal</p>
      {sharedCtx.research && <div style={{marginBottom:16,padding:"8px 12px",background:GREEN+"15",border:`1px solid ${GREEN}44`,borderRadius:4,fontSize:12,color:GREEN}}>
        Research saved for <strong>{sharedCtx.researchAgency || "agency"}</strong> — will be used in your next Executive Brief automatically.
      </div>}
      <Card style={{marginBottom:20}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div><Label text="AGENCY / CLIENT" /><Input value={agencyName} onChange={setAgencyName} placeholder="e.g. Louisiana OCD, Harris County" /></div>
          <div><Label text="OPPORTUNITY TYPE" /><Input value={oppType} onChange={setOppType} placeholder="e.g. CDBG-DR TPA, FEMA PA" /></div>
          <div><Label text="KNOWN COMPETITORS" /><Input value={competitors} onChange={setCompetitors} placeholder="e.g. ICF, Witt, Hagerty" /></div>
          <div><Label text="CONTEXT" /><Input value={context} onChange={setContext} placeholder="Disaster event, funding round, timeline..." /></div>
        </div>
        <Btn onClick={generate} disabled={loading||!agencyName}>{loading?"Researching...":"Generate Research Pack"}</Btn>
      </Card>
      <AIOut content={result} loading={loading} label="RESEARCH & COMPETITIVE INTELLIGENCE" />
    </div>
  );
}
