```javascript
function KnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [gmailQuery, setGmailQuery] = useState("");
  const [gmailResults, setGmailResults] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailStatus, setGmailStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const uploadingRef = useRef(false);

  const INTAKE_SECRET = "hgi-intake-2026-secure";
  const API_BASE = window.location.origin;

  const loadDocs = async () => {
    setLoading(true);
    try {
      const r = await fetch(API_BASE + "/api/knowledge?limit=100", {
        headers: { "x-intake-secret": INTAKE_SECRET }
      });
      if (r.ok) {
        const d = await r.json();
        setDocs(d.documents || d || []);
      } else {
        console.error("KB load failed:", r.status);
      }
    } catch(e) {
      console.error("KB load error:", e);
    }
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, []);

  const addFilesToQueue = (files) => {
    const newItems = Array.from(files).map(f => ({
      id: Date.now() + Math.random(),
      file: f,
      status: "pending",
      result: null,
      error: null,
    }));
    setQueue(prev => [...prev, ...newItems]);
  };

  const removeFromQueue = (id) => setQueue(prev => prev.filter(q => q.id !== id));

  const uploadOne = async (item) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const ext = item.file.name.split(".").pop().toLowerCase();
        try {
          const r = await fetch(API_BASE + "/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-intake-secret": INTAKE_SECRET },
            body: JSON.stringify({ filename: item.file.name, file_type: ext, content_base64: base64 })
          });
          const d = await r.json();
          if (d.success) {
            resolve({ success: true, result: d });
          } else {
            resolve({ success: false, error: d.error || "Unknown error" });
          }
        } catch(err) {
          resolve({ success: false, error: err.message });
        }
      };
      reader.readAsDataURL(item.file);
    });
  };

  const uploadAll = async () => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    const pending = queue.filter(q => q.status === "pending");
    for (const item of pending) {
      setQueue(prev => prev.map(q => q.id === item.id ? {...q, status:"uploading"} : q));
      const res = await uploadOne(item);
      setQueue(prev => prev.map(q => q.id === item.id ? {
        ...q,
        status: res.success ? "done" : "error",
        result: res.result || null,
        error: res.error || null,
      } : q));
    }
    uploadingRef.current = false;
    loadDocs();
  };

  const deleteDoc = async (id, filename) => {
    if (!confirm("Delete " + filename + "?")) return;
    try {
      await fetch(API_BASE + "/api/knowledge?id=" + encodeURIComponent(id), {
        method: "DELETE", headers: { "x-intake-secret": INTAKE_SECRET }
      });
      loadDocs();
    } catch(e) {}
  };

  const reprocessDoc = async (id, filename) => {
    setDocs(prev => prev.map(d => d.id === id ? {...d, status:"processing", summary:"Reprocessing — extracting full text from storage..."} : d));
    try {
      const r = await fetch(API_BASE + "/api/knowledge?action=reprocess", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-intake-secret": INTAKE_SECRET },
        body: JSON.stringify({ doc_id: id }),
      });
      const data = await r.json();
      if (data.success) {
        setDocs(prev => prev.map(d => d.id === id ? {
          ...d,
          status:"processed",
          chunk_count: data.chunkCount,
          document_class: data.classification?.document_class || d.document_class,
          vertical: data.classification?.vertical || d.vertical,
          summary: data.classification?.summary || d.summary,
          doctrine: data.doctrine || d.doctrine,
        } : d));
      } else {
        setDocs(prev => prev.map(d => d.id === id ? {...d, status:"error", summary:"Reprocess failed: " + (data.error||"unknown error")} : d));
      }
    } catch(e) {
      setDocs(prev => prev.map(d => d.id === id ? {...d, status:"error", summary:"Reprocess failed: " + e.message} : d));
    }
    loadDocs();
  };

  // Gmail search via Claude AI
  const searchGmail = async () => {
    if (!gmailQuery.trim()) return;
    setGmailLoading(true);
    setGmailStatus("Searching Gmail...");
    setGmailResults([]);
    try {
      const r = await fetch(API_BASE + "/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: "You are helping search Gmail for HGI proposal documents. Use the Gmail MCP tool to search for emails and attachments matching the query. Return results as JSON array: [{subject, from, date, hasAttachments, attachmentNames, snippet, messageId}]",
          messages: [{ role: "user", content: "Search Gmail for: " + gmailQuery + ". Focus on finding emails with PDF or Word document attachments related to HGI proposals, past performance, RFPs, or corporate documents. Return JSON only." }],
          mcp_servers: [{ type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail-mcp" }]
        })
      });
      const d = await r.json();
      const text = d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      try {
        const clean = text.replace(/```json|```/g,"").trim();
        const start = clean.indexOf("[");
        const end = clean.lastIndexOf("]");
        if (start > -1 && end > -1) {
          const results = JSON.parse(clean.slice(start, end+1));
          setGmailResults(results);
          setGmailStatus(results.length + " emails found");
        } else {
          setGmailStatus("Search complete — " + text.slice(0,200));
        }
      } catch(e) {
        setGmailStatus("Search complete: " + text.slice(0,300));
      }
    } catch(e) {
      setGmailStatus("Search failed: " + e.message);
    }
    setGmailLoading(false);
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + "KB";
    return (bytes/(1024*1024)).toFixed(1) + "MB";
  };

  const statusColor = (s) => s==="done"?GREEN:s==="error"?RED:s==="uploading"?GOLD:TEXT_D;
  const statusLabel = (s) => ({pending:"Ready",uploading:"Uploading...",done:"Done",error:"Failed"}[s]||s);

  const verticals = ["all","disaster","tpa","appeals","workforce","health","infrastructure","federal","construction","general"];
  const filtered = filter === "all" ? docs : docs.filter(d => d.vertical === filter);
  const pendingCount = queue.filter(q=>q.status==="pending").length;
  const doneCount = queue.filter(q=>q.status==="done").length;

  const GMAIL_PRESETS = [
    "HGI proposal attachments PDF",
    "Road Home Restore Louisiana proposal",
    "FEMA Public Assistance RFP response",
    "past performance capabilities statement",
    "staff bios resumes HGI",
    "TPCIGA LIGA workers compensation proposal",
  ];

  return (
    <div style={{padding:"0 0 40px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{color:GOLD,margin:"0 0 4px",fontSize:20,fontWeight:800}}>Knowledge Base</h2>
          <p style={{color:TEXT_D,margin:0,fontSize:12}}>{docs.length} document{docs.length!==1?"s":""} indexed — Claude injects relevant doctrine into every analysis automatically</p>
        </div>
        <Btn small onClick={loadDocs}>Refresh</Btn>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${BORDER}`,paddingBottom:8}}>
        {[["upload","Upload Documents"],["gmail","Search Gmail"],["library","Document Library (" + docs.length + ")"]].map(([v,l])=>(
          <button key={v} onClick={()=>setActiveTab(v)} style={{
            padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",
            background:activeTab===v?GOLD:"transparent",
            color:activeTab===v?"#000":TEXT_D,
            border:`1px solid ${activeTab===v?GOLD:BORDER}`,
            borderRadius:4,fontWeight:activeTab===v?700:400
          }}>{l}</button>
        ))}
      </div>

      {/* ── UPLOAD TAB ── */}
      {activeTab === "upload" && (
        <div>
          {/* Size warning */}
          <div style={{padding:"10px 14px",background:ORANGE+"15",border:`1px solid ${ORANGE}33`,borderRadius:4,marginBottom:16,fontSize:12,color:ORANGE}}>
            <strong>Size limit: 50 pages per file.</strong> Documents larger than 50 pages must be split before uploading. Uploading a 500-page document as one file will fail.
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);addFilesToQueue(e.dataTransfer.files);}}
            style={{
              background:dragOver?GOLD+"11":BG2,
              border:"2px dashed " + (dragOver?GOLD:BORDER),
              borderRadius:8,padding:"32px 20px",textAlign:"center",marginBottom:16,
              transition:"all 0.2s",cursor:"pointer",position:"relative"
            }}>
            <input type="file" accept=".pdf,.docx,.txt,.md" multiple style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}
              onChange={e=>{if(e.target.files.length)addFilesToQueue(e.target.files);}} />
            <div style={{color:TEXT,fontWeight:600,fontSize:15,marginBottom:6}}>Drop files here or click to browse</div>
            <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>PDF, DOCX, or TXT — multiple files supported</div>
            <div style={{color:TEXT_D,fontSize:11}}>Claude extracts past performance, win themes, staffing patterns, and doctrine from every document</div>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:12,color:TEXT_D}}>{queue.length} file{queue.length!==1?"s":""} queued{doneCount>0?" · "+doneCount+" done":""}</span>
                <div style={{display:"flex",gap:8}}>
                  {pendingCount > 0 && <Btn small onClick={uploadAll}>Upload {pendingCount} File{pendingCount!==1?"s":""}</Btn>}
                  <Btn small variant="ghost" onClick={()=>setQueue([])}>Clear Queue</Btn>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {queue.map(item => (
                  <div key={item.id} style={{
                    display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                    background:item.status==="done"?GREEN+"11":item.status==="error"?RED+"11":item.status==="uploading"?GOLD+"11":BG2,
                    border:`1px solid ${item.status==="done"?GREEN:item.status==="error"?RED:item.status==="uploading"?GOLD:BORDER}`,
                    borderRadius:4,fontSize:12,transition:"all 0.3s"
                  }}>
                    <span style={{flex:1,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.file.name}</span>
                    <span style={{color:TEXT_D,fontSize:10,flexShrink:0}}>{formatSize(item.file.size)}</span>
                    <span style={{color:statusColor(item.status),fontSize:11,fontWeight:700,flexShrink:0,minWidth:80,textAlign:"right"}}>
                      {item.status==="uploading"?<span style={{animation:"pulse 1s infinite",display:"inline-block"}}>{statusLabel(item.status)}</span>:statusLabel(item.status)}
                    </span>
                    {item.result && <span style={{fontSize:10,color:TEXT_D,flexShrink:0}}>{item.result.document_class?.replace(/_/g," ")} · {item.result.vertical}</span>}
                    {item.error && <span style={{fontSize:10,color:RED,flexShrink:0,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis"}}>{item.error}</span>}
                    {item.status==="pending" && <button onClick={()=>removeFromQueue(item.id)} style={{background:"none",border:"none",color:TEXT_D,cursor:"pointer",fontSize:14,padding:"0 2px",flexShrink:0}}>✕</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GMAIL TAB ── */}
      {activeTab === "gmail" && (
        <div>
          <div style={{padding:"12px 16px",background:BG2,border:`1px solid ${BORDER}`,borderRadius:4,marginBottom:16,fontSize:12,color:TEXT_D,lineHeight:1.6}}>
            Search your Gmail for HGI proposal documents, past performance files, RFPs, and attachments. Results will show emails with attachments you can then download and upload to the knowledge base.
          </div>

          <div style={{marginBottom:12}}>
            <Label text="SEARCH QUERY" />
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <Input value={gmailQuery} onChange={setGmailQuery} placeholder="e.g. Road Home proposal PDF" style={{flex:1}} />
              <Btn onClick={searchGmail} disabled={gmailLoading}>{gmailLoading?"Searching...":"Search Gmail"}</Btn>
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:TEXT_D,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Quick Searches</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {GMAIL_PRESETS.map(p => (
                <button key={p} onClick={()=>{setGmailQuery(p);}} style={{
                  padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",
                  background:"transparent",color:TEXT_D,border:`1px solid ${BORDER}`,borderRadius:3,
                  transition:"all 0.15s"
                }}>{p}</button>
              ))}
            </div>
          </div>

          {gmailStatus && (
            <div style={{padding:"8px 12px",background:BG2,border:`1px solid ${BORDER}`,borderRadius:4,fontSize:11,color:TEXT_D,marginBottom:12}}>
              {gmailStatus}
            </div>
          )}

          {gmailResults.length > 0 && (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {gmailResults.map((r,i) => (
                <div key={i} style={{padding:"12px 14px",background:BG2,border:`1px solid ${BORDER}`,borderRadius:4}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:TEXT,fontWeight:600,fontSize:12,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.subject || "(no subject)"}</div>
                      <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>{r.from} · {r.date}</div>
                      {r.snippet && <div style={{color:TEXT_D,fontSize:11,fontStyle:"italic",marginBottom:4}}>{r.snippet}</div>}
                      {r.attachmentNames?.length > 0 && (
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {r.attachmentNames.map((name,j) => (
                            <span key={j} style={{fontSize:10,color:GOLD,background:GOLD+"15",padding:"2px 8px",borderRadius:3}}>{name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {r.hasAttachments && (
                      <Badge color={GREEN}>Has Attachments</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {activeTab === "library" && (
        <div>
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {verticals.map(v => (
              <button key={v} onClick={()=>setFilter(v)} style={{
                background:filter===v?GOLD:BG2, color:filter===v?"#000":TEXT_D,
                border:"1px solid " + (filter===v?GOLD:BORDER), borderRadius:4,
                padding:"4px 10px", fontSize:11, cursor:"pointer", fontWeight:filter===v?700:400
              }}>{v}{v==="all"?" ("+docs.length+")":""}</button>
            ))}
          </div>

          {loading ? (
            <div style={{color:TEXT_D,fontSize:13,padding:20,textAlign:"center"}}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{background:BG2,border:"1px solid "+BORDER,borderRadius:8,padding:"32px 20px",textAlign:"center"}}>
              <div style={{color:TEXT_D,fontSize:13,marginBottom:6}}>No documents yet</div>
              <div style={{color:TEXT_D,fontSize:11}}>Upload documents in the Upload tab to seed the knowledge base</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filtered.map(doc => {
                const isProcessing = doc.status === "processing";
                const isError = doc.status === "error";
                const hasChunks = (doc.chunk_count || 0) > 0;
                const hasStorage = !!doc.storage_path;
                const needsReprocess = !hasChunks || isError;
                const statusDot = isProcessing ? GOLD : isError ? RED : hasChunks ? GREEN : TEXT_D;
                const chunkColor = doc.chunk_count >= 10 ? GREEN : doc.chunk_count > 0 ? GOLD : RED;
                return (
                  <div key={doc.id} style={{background:BG2,border:`1px solid ${isError?RED:isProcessing?GOLD:BORDER}`,borderRadius:6}}>
                    <div style={{padding:"12px 14px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,cursor:"pointer"}}
                      onClick={()=>setExpandedDoc(expandedDoc===doc.id?null:doc.id)}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                          {/* Status dot */}
                          <span title={doc.status||"processed"} style={{width:7,height:7,borderRadius:"50%",background:statusDot,flexShrink:0,marginTop:1}}/>
                          <span style={{color:TEXT,fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:260}}>{doc.filename}</span>
                          <span style={{background:GOLD,color:"#000",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,flexShrink:0}}>
                            {(doc.vertical||"general").toUpperCase()}
                          </span>
                          <span style={{color:TEXT_D,fontSize:10,border:"1px solid "+BORDER,padding:"2px 6px",borderRadius:4,flexShrink:0}}>
                            {(doc.document_class||"other").replace(/_/g," ")}
                          </span>
                          <span style={{color:chunkColor,fontSize:10,fontWeight:600,flexShrink:0}}>
                            {isProcessing ? "⟳ processing..." : `${doc.chunk_count||0} chunks`}
                          </span>
                          {hasStorage && (
                            <span title="File stored in Supabase Storage — can always reprocess" style={{fontSize:9,color:GREEN,border:`1px solid ${GREEN}`,padding:"1px 5px",borderRadius:3,flexShrink:0}}>
                              ✓ stored
                            </span>
                          )}
                          {doc.char_count > 0 && (
                            <span style={{color:TEXT_D,fontSize:10,flexShrink:0}}>
                              {doc.char_count > 1000 ? Math.round(doc.char_count/1000) + "k chars" : doc.char_count + " chars"}
                            </span>
                          )}
                        </div>
                        {doc.summary && <div style={{color:isError?RED:TEXT_D,fontSize:11,lineHeight:1.5}}>{doc.summary}</div>}
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <span style={{fontSize:10,color:TEXT_D}}>{expandedDoc===doc.id?"▲":"▼"}</span>
                        {needsReprocess && !isProcessing && (
                          <button onClick={e=>{e.stopPropagation();reprocessDoc(doc.id,doc.filename);}} style={{
                            background:GOLD,border:"none",color:"#000",
                            borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:700
                          }}>Reprocess</button>
                        )}
                        <button onClick={e=>{e.stopPropagation();deleteDoc(doc.id,doc.filename);}} style={{
                          background:"transparent",border:"1px solid "+BORDER,color:TEXT_D,
                          borderRadius:4,padding:"3px 8px",fontSize:11,cursor:"pointer"
                        }}>Delete</button>
                      </div>
                    </div>
                    {expandedDoc===doc.id && (
                      <div style={{padding:"0 14px 14px",borderTop:`1px solid ${BORDER}`}}>
                        {/* Reprocess prompt for zero-chunk docs */}
                        {needsReprocess && !isProcessing && (
                          <div style={{marginTop:12,padding:"10px 12px",background:isError?"rgba(220,50,50,0.08)":"rgba(180,140,0,0.08)",border:`1px solid ${isError?RED:GOLD}`,borderRadius:6,fontSize:12}}>
                            <div style={{color:isError?RED:GOLD,fontWeight:700,marginBottom:4}}>
                              {isError ? "⚠ Processing failed" : "⚠ No text extracted"}
                            </div>
                            <div style={{color:TEXT_D,marginBottom:8}}>
                              {hasStorage
                                ? "File is safely stored in Supabase Storage. Click Reprocess to extract full text."
                                : "Click Reprocess to attempt extraction from stored content, or re-upload for best results."}
                            </div>
                            <button onClick={()=>reprocessDoc(doc.id,doc.filename)} style={{
                              background:GOLD,border:"none",color:"#000",borderRadius:4,
                              padding:"5px 16px",fontSize:12,cursor:"pointer",fontWeight:700
                            }}>⟳ Reprocess Now</button>
                          </div>
                        )}
                        {/* Win themes */}
                        {doc.doctrine?.win_themes?.length > 0 && (
                          <div style={{marginTop:12}}>
                            <div style={{fontSize:10,color:GOLD,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Win Themes</div>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {doc.doctrine.win_themes.map((t,i)=>(
                                <span key={i} style={{fontSize:11,color:TEXT_D,background:BG3,padding:"3px 8px",borderRadius:3,border:`1px solid ${BORDER}`}}>{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Past performance */}
                        {doc.doctrine?.past_performance?.length > 0 && (
                          <div style={{marginTop:12}}>
                            <div style={{fontSize:10,color:GOLD,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Past Performance</div>
                            {doc.doctrine.past_performance.slice(0,3).map((p,i)=>(
                              <div key={i} style={{fontSize:11,color:TEXT_D,marginBottom:4,paddingLeft:8,borderLeft:`2px solid ${GOLD}`}}>
                                <span style={{color:TEXT,fontWeight:600}}>{p.client || p.program}</span>
                                {p.scope && " — " + p.scope}
                                {p.outcome && <span style={{color:GREEN}}> · {p.outcome}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Key stats */}
                        {doc.doctrine?.key_stats?.length > 0 && (
                          <div style={{marginTop:12}}>
                            <div style={{fontSize:10,color:TEXT_D,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Key Stats</div>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {doc.doctrine.key_stats.map((s,i)=>(
                                <span key={i} style={{fontSize:11,color:GREEN,background:BG3,padding:"3px 8px",borderRadius:3,border:`1px solid ${BORDER}`}}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Service lines */}
                        {doc.doctrine?.service_lines?.length > 0 && (
                          <div style={{marginTop:10}}>
                            <div style={{fontSize:10,color:TEXT_D,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Service Lines</div>
                            <div style={{color:TEXT_D,fontSize:11}}>{doc.doctrine.service_lines.join(" · ")}</div>
                          </div>
                        )}
                        {/* Narrative summary */}
                        {doc.doctrine?.narrative_summary && (
                          <div style={{marginTop:10,padding:"8px 10px",background:BG3,borderRadius:4,fontSize:11,color:TEXT_D,lineHeight:1.6}}>
                            {doc.doctrine.narrative_summary}
                          </div>
                        )}
                        {/* Key personnel */}
                        {doc.doctrine?.key_personnel?.length > 0 && (
                          <div style={{marginTop:10}}>
                            <div style={{fontSize:10,color:TEXT_D,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Key Personnel</div>
                            <div style={{color:TEXT_D,fontSize:11}}>{doc.doctrine.key_personnel.join(" · ")}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>