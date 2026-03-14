```javascript
import React, { useState, useEffect } from 'react';
import { Btn, Input, Label, Badge } from './UI';

const GOLD = "#b8860b";
const GREEN = "#4ade80";
const RED = "#ef4444";
const ORANGE = "#f97316";
const TEXT = "#f1f5f9";
const TEXT_D = "#94a3b8";
const BG2 = "#1e293b";
const BG3 = "#334155";
const BORDER = "#475569";

function KnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);

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
        setDocs(d.documents || []);
      }
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const addFilesToQueue = (files) => {
    const newItems = Array.from(files).map(f => ({
      id: Date.now() + Math.random(),
      file: f,
      status: "pending"
    }));
    setQueue(prev => [...prev, ...newItems]);
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

  return (
    <div style={{padding:"0 0 40px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{color:GOLD,margin:"0 0 4px",fontSize:20,fontWeight:800}}>Knowledge Base</h2>
          <p style={{color:TEXT_D,margin:0,fontSize:12}}>{docs.length} document{docs.length!==1?"s":""} indexed</p>
        </div>
        <Btn small onClick={loadDocs}>Refresh</Btn>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${BORDER}`,paddingBottom:8}}>
        {[["upload","Upload Documents"],["library","Document Library (" + docs.length + ")"]].map(([v,l])=>(
          <button key={v} onClick={()=>setActiveTab(v)} style={{
            padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit",
            background:activeTab===v?GOLD:"transparent",
            color:activeTab===v?"#000":TEXT_D,
            border:`1px solid ${activeTab===v?GOLD:BORDER}`,
            borderRadius:4,fontWeight:activeTab===v?700:400
          }}>{l}</button>
        ))}
      </div>

      {activeTab === "upload" && (
        <div>
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
            <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>PDF, DOCX, or TXT files supported</div>
          </div>

          {queue.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:12,color:TEXT_D}}>{queue.length} file{queue.length!==1?"s":""} queued</span>
                <Btn small variant="ghost" onClick={()=>setQueue([])}>Clear Queue</Btn>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {queue.map(item => (
                  <div key={item.id} style={{
                    display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                    background:BG2,border:`1px solid ${BORDER}`,borderRadius:4,fontSize:12
                  }}>
                    <span style={{flex:1,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.file.name}</span>
                    <span style={{color:TEXT_D,fontSize:10,flexShrink:0}}>{formatSize(item.file.size)}</span>
                    <span style={{color:statusColor(item.status),fontSize:11,fontWeight:700,flexShrink:0,minWidth:80,textAlign:"right"}}>
                      {statusLabel(item.status)}
                    </span>
                    <button onClick={()=>setQueue(prev => prev.filter(q => q.id !== item.id))} style={{background:"none",border:"none",color:TEXT_D,cursor:"pointer",fontSize:14,padding:"0 2px",flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
              <div style={{color:TEXT_D,fontSize:11}}>Upload documents to seed the knowledge base</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filtered.map(doc => (
                <div key={doc.id} style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6}}>
                  <div style={{padding:"12px 14px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,cursor:"pointer"}}
                    onClick={()=>setExpandedDoc(expandedDoc===doc.id?null:doc.id)}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{color:TEXT,fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:260}}>{doc.filename}</span>
                        <span style={{background:GOLD,color:"#000",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,flexShrink:0}}>
                          {(doc.vertical||"general").toUpperCase()}
                        </span>
                        <span style={{color:TEXT_D,fontSize:10,border:"1px solid "+BORDER,padding:"2px 6px",borderRadius:4,flexShrink:0}}>
                          {(doc.document_class||"other").replace(/_/g," ")}
                        </span>
                        <span style={{color:GREEN,fontSize:10,fontWeight:600,flexShrink:0}}>
                          {doc.chunk_count||0} chunks
                        </span>
                      </div>
                      {doc.summary && <div style={{color:TEXT_D,fontSize:11,lineHeight:1.5}}>{doc.summary}</div>}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      <span style={{fontSize:10,color:TEXT_D}}>{expandedDoc===doc.id?"▲":"▼"}</span>
                    </div>
                  </div>
                  {expandedDoc===doc.id && (
                    <div style={{padding:"0 14px 14px",borderTop:`1px solid ${BORDER}`}}>
                      <div style={{marginTop:10,padding:"8px 10px",background:BG3,borderRadius:4,fontSize:11,color:TEXT_D,lineHeight:1.6}}>
                        Document details and content would appear here.
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default KnowledgeBase;
```