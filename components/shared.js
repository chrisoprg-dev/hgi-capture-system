const { useState, useEffect, useRef } = React;
const GOLD="#C9A84C",GOLD_D="#8B6E2E",BG="#0A0A0A",BG2="#111111",BG3="#191919",BG4="#222222";
const TEXT="#E8E0D0",TEXT_D="#888070",BORDER="#2A2520",RED="#C0392B",GREEN="#27AE60",BLUE="#2980B9",ORANGE="#E67E22";

const HGI_CONTEXT = "HGI Global / Hammerman and Gainer LLC — 95-year-old 100% minority-owned government services firm. Founded 1929. Kenner LA (HQ), Shreveport, Alexandria, New Orleans. ~67 FT + 43 contract staff. Leadership: Christopher J. Oney (President), Larry D. Oney (Chairman), Louis J. Resweber (CEO), Candy L. Dottolo (CAO — designated proposal signature authority), Vanessa R. James (SVP Claims), S. Adaan Uzzaman (CSO). 8 verticals: (1) Disaster Recovery/CDBG-DR/FEMA PA/HMGP, (2) TPA/Claims — full P and C incl workers comp/property/liability/guaranty (NOT Medicaid/healthcare benefits), (3) Property Tax Appeals, (4) Workforce Services/WIOA, (5) Construction Management, (6) Program Administration — federal/state NOT healthcare, (7) Housing/HUD, (8) Grant Management. CONFIRMED PAST PERFORMANCE (use exactly as stated): Road Home Program — $67M direct / $13B+ program administered, 2006-2015, zero misappropriation, 185,000+ applications, perfect audit compliance; HAP $950M; Restore Louisiana $42.3M CDBG-DR post-2016 flood; Terrebonne Parish School Board (TPSD) $2.96M construction mgmt 2022-2025 RECENTLY COMPLETED (past tense only); St. John Sheriff $788K; Rebuild NJ $67.7M; BP GCCF $1.65M 2010-2013 (1M+ claims for Kenneth Feinberg presidential appointee); City of New Orleans workers comp $283K/mo (active); SWBNO billing appeals $200K/mo. DO NOT LIST without confirmation: PBGC, Orleans Parish School Board. NO current FEMA PA contract. Insurance: $5M fidelity bond, $5M E and O, $2M GL ($1M occ/$2M agg). SAM UEI: DL4SJEVKZ6H4. NAICS: 541611, 541690, 561110, 561990, 524291, 923120, 921190. PRICING RULE: NEVER use a fixed rate card. Always build pricing from the exact position titles in the RFP. HGI confirmed fully burdened rates (per hour) for reference: Principal $220, Program Director $210, SME $200, Sr Grant Mgr $180, Grant Mgr $175, Sr PM $180, PM $155, Grant Writer $145, Architect/Engineer $135, Cost Estimator $125, Appeals Specialist $145, Sr Damage Assessor $115, Damage Assessor $105, Admin Support $65. Map these to RFP-specified positions — do not add or substitute positions the RFP did not request.";

// ── KB QUERY — fetches extracted institutional knowledge from Supabase ──────
async function queryKB(vertical) {
  try {
    const v = vertical || "disaster_recovery";
    const r = await fetch("/api/knowledge-query?vertical=" + encodeURIComponent(v));
    if (!r.ok) return "";
    const data = await r.json();
    return data.prompt_injection || "";
  } catch(e) {
    console.warn("KB query failed, using static context:", e.message);
    return "";
  }
}

const store = {
  get(k){try{const v=localStorage.getItem('hgi_'+k);return v?JSON.parse(v):null}catch(e){return null}},
  set(k,v){try{localStorage.setItem('hgi_'+k,JSON.stringify(v))}catch(e){}}
};

async function callClaude(prompt, system, maxTokens=3000) {
  try {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: system || "You are an expert government contracting capture manager for HGI. " + HGI_CONTEXT,
      messages: [{ role: "user", content: prompt }]
    };
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error("API error:", r.status, errText);
      return "API error " + r.status + ": " + errText;
    }
    const d = await r.json();
    if (!d.content) return "No content returned: " + JSON.stringify(d);
    return d.content.filter(b => b.type === "text").map(b => b.text).join("") || "No response.";
  } catch(err) {
    console.error("callClaude error:", err);
    return "Error: " + err.message;
  }
}

const Badge = ({children, color=GOLD}) => (
  <span style={{display:"inline-block",padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:700,
    letterSpacing:"0.08em",background:color+"22",color,border:`1px solid ${color}44`,textTransform:"uppercase"}}>
    {children}
  </span>
);
const Card = ({children, style}) => (
  <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:16,...style}}>{children}</div>
);
const Btn = ({children, onClick, variant="primary", disabled, small, style}) => {
  const base = {cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:4,fontFamily:"inherit",
    fontWeight:600,letterSpacing:"0.05em",padding:small?"5px 12px":"9px 18px",fontSize:small?12:13,opacity:disabled?0.5:1,...style};
  const v = {
    primary:{background:GOLD,color:BG},
    secondary:{background:BG4,color:TEXT,border:`1px solid ${BORDER}`},
    danger:{background:RED+"22",color:RED,border:`1px solid ${RED}44`},
    ghost:{background:"transparent",color:GOLD,border:`1px solid ${GOLD}44`}
  };
  return <button style={{...base,...v[variant]}} onClick={disabled?undefined:onClick}>{children}</button>;
};
const Input = ({value, onChange, placeholder, style}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,fontFamily:"inherit",
      fontSize:13,padding:"8px 10px",outline:"none",width:"100%",...style}} />
);
const Textarea = ({value, onChange, placeholder, rows=4, style}) => (
  <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{width:"100%",background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,
      fontFamily:"inherit",fontSize:13,padding:10,resize:"vertical",outline:"none",lineHeight:1.6,...style}} />
);
const Sel = ({value, onChange, options, style}) => (
  <select value={value} onChange={e=>onChange(e.target.value)}
    style={{background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"8px 10px",outline:"none",...style}}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
const Label = ({text}) => <label style={{display:"block",fontSize:11,color:TEXT_D,marginBottom:4,letterSpacing:"0.06em"}}>{text}</label>;
const AIOut = ({content, loading, label="AI ANALYSIS"}) => {
  if (loading) return <div style={{color:GOLD,fontSize:13,padding:12,background:BG3,borderRadius:4,border:`1px solid ${GOLD}33`,animation:"pulse 1.2s infinite"}}>
    ⟳ generating {label}...</div>;
  if (!content) return null;
  return <div style={{background:BG3,border:`1px solid ${GOLD}33`,borderRadius:4,padding:14,fontSize:13,lineHeight:1.75,color:TEXT,whiteSpace:"pre-wrap"}}>
    <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:"0.1em",marginBottom:8}}>{label}</div>
    {content}
  </div>;
};
const OPIBadge = ({score}) => {
  if (!score && score !== 0) return null;
  const n = parseInt(score);
  const color = n>=70?GREEN:n>=45?GOLD:RED;
  const tier = n>=70?"Tier 1":n>=45?"Tier 2":n>=25?"Tier 3":"Archive";
  return <span style={{background:color+"22",border:`1px solid ${color}44`,borderRadius:4,padding:"4px 10px",color,fontWeight:700}}>
    OPI {n} — {tier}
  </span>;
};