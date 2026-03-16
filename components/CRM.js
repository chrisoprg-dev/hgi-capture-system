function CRM() {
  const [contacts, setContacts] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({name:'',title:'',agency:'',email:'',phone:'',relationship_strength:'Cold',last_contact:'',notes:'',vertical:''});
  const [search, setSearch] = useState('');
  const [filterAgency, setFilterAgency] = useState('');
  const [aiLoading, setAiLoading] = useState({});
  const [aiResults, setAiResults] = useState({});
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const r = await fetch('/api/contacts');
        if (r.ok) {
          const d = await r.json();
          const dbContacts = d.contacts || [];
          // Merge with any localStorage contacts (one-time migration)
          const localContacts = store.get('crm_contacts') || [];
          if (localContacts.length > 0 && dbContacts.length === 0) {
            // First load — migrate localStorage to Supabase
            await fetch('/api/contacts', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contacts: localContacts })
            });
            setContacts(localContacts);
          } else {
            setContacts(dbContacts);
          }
        }
      } catch(e) {
        // Fallback to localStorage if API fails
        setContacts(store.get('crm_contacts') || []);
      }
      setDbLoading(false);
    };
    loadContacts();
  }, []);

  const save = (c) => {
    setContacts(c);
    store.set('crm_contacts', c); // Keep localStorage as backup
    // Sync to Supabase
    fetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: c })
    }).catch(e => console.warn('CRM sync failed:', e.message));
  };

  const submit = () => {
    if (!form.name || !form.agency) return;
    if (editId) { save(contacts.map(c => c.id===editId ? {...form, id:editId} : c)); }
    else { save([{...form, id:Date.now(), added:new Date().toISOString()}, ...contacts]); }
    setForm({name:'',title:'',agency:'',email:'',phone:'',relationship_strength:'Cold',last_contact:'',notes:'',vertical:''});
    setShowAdd(false); setEditId(null);
  };

  const logContact = (id) => {
    const note = window.prompt('Quick note about this contact:') || '';
    save(contacts.map(c => c.id===id ? {...c, last_contact: new Date().toISOString().split('T')[0], notes: note || c.notes} : c));
  };

  const getAiBrief = async (contact) => {
    setAiLoading(a=>({...a,[contact.id]:true}));
    const txt = await callClaude(
      'Generate relationship intelligence for HGI (Hammerman & Gainer LLC, 95-year disaster recovery and government consulting firm).\n\nContact: ' + contact.name + '\nTitle: ' + contact.title + '\nAgency: ' + contact.agency + '\nVertical: ' + (contact.vertical||'government') + '\nLast Contact: ' + (contact.last_contact||'unknown') + '\nNotes: ' + (contact.notes||'none') + '\n\nProvide:\n1. What this person cares about in their role\n2. HGI talking points tailored to this contact\n3. Best approach strategy\n4. Opportunities to discuss from HGI verticals\n5. Relationship building recommendations'
    );
    setAiResults(a=>({...a,[contact.id]:txt}));
    setAiLoading(a=>({...a,[contact.id]:false}));
  };

  const daysSince = (d) => { if (!d) return null; return Math.floor((new Date()-new Date(d))/(1000*60*60*24)); };
  const strengthColor = (s) => s==='Hot'?GREEN:s==='Warm'?GOLD:TEXT_D;

  const agencies = [...new Set(contacts.map(c=>c.agency).filter(Boolean))];
  const filtered = contacts
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.agency.toLowerCase().includes(search.toLowerCase()))
    .filter(c => !filterAgency || c.agency === filterAgency)
    .sort((a,b) => (a.last_contact||'1900-01-01').localeCompare(b.last_contact||'1900-01-01'));

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',marginBottom:16,gap:10,flexWrap:'wrap'}}>
        <div>
          <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Relationship Intelligence</h2>
          <p style={{color:TEXT_D,margin:'4px 0 0',fontSize:12}}>{dbLoading ? 'Loading...' : contacts.length + ' contacts tracked · synced to cloud · sorted by longest overdue'}</p>
        </div>
        <Btn style={{marginLeft:'auto'}} onClick={()=>{setShowAdd(!showAdd);setEditId(null);setForm({name:'',title:'',agency:'',email:'',phone:'',relationship_strength:'Cold',last_contact:'',notes:'',vertical:''});}}>+ Add Contact</Btn>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts..." style={{flex:1,minWidth:180,background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,padding:'7px 12px',color:TEXT,fontSize:12,fontFamily:'inherit'}} />
        <select value={filterAgency} onChange={e=>setFilterAgency(e.target.value)} style={{background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,padding:'7px 10px',color:TEXT,fontSize:12,fontFamily:'inherit'}}>
          <option value="">All Agencies</option>
          {agencies.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {showAdd && (
        <Card style={{marginBottom:16,border:`1px solid ${GOLD}44`}}>
          <h3 style={{color:GOLD,margin:'0 0 12px',fontSize:14}}>{editId?'Edit Contact':'New Contact'}</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <Input value={form.name} onChange={v=>setF('name',v)} placeholder="Full Name*" />
            <Input value={form.title} onChange={v=>setF('title',v)} placeholder="Title / Role" />
            <Input value={form.agency} onChange={v=>setF('agency',v)} placeholder="Agency*" />
            <Input value={form.vertical} onChange={v=>setF('vertical',v)} placeholder="Vertical (FEMA PA, TPA...)" />
            <Input value={form.email} onChange={v=>setF('email',v)} placeholder="Email" />
            <Input value={form.phone} onChange={v=>setF('phone',v)} placeholder="Phone" />
            <Sel value={form.relationship_strength} onChange={v=>setF('relationship_strength',v)} options={[{value:'Cold',label:'Cold'},{value:'Warm',label:'Warm'},{value:'Hot',label:'Hot — Active Relationship'}]} style={{width:'100%'}} />
            <Input value={form.last_contact} onChange={v=>setF('last_contact',v)} placeholder="Last Contact (YYYY-MM-DD)" />
            <Textarea value={form.notes} onChange={v=>setF('notes',v)} placeholder="Notes..." rows={2} style={{gridColumn:'1/-1'}} />
          </div>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={submit}>{editId?'Save Changes':'Add Contact'}</Btn>
            <Btn variant="secondary" onClick={()=>{setShowAdd(false);setEditId(null);}}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!filtered.length && <Card style={{textAlign:'center',padding:40,color:TEXT_D}}>No contacts yet — add decision-makers at agencies HGI pursues.</Card>}

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {filtered.map(c => {
          const days = daysSince(c.last_contact);
          const overdue = days === null || days > 30;
          return (
            <Card key={c.id} style={{borderLeft:`3px solid ${strengthColor(c.relationship_strength)}`}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4,flexWrap:'wrap'}}>
                    <span style={{fontWeight:700,color:TEXT,fontSize:14}}>{c.name}</span>
                    <Badge color={strengthColor(c.relationship_strength)}>{c.relationship_strength}</Badge>
                    {c.vertical && <Badge color={BLUE}>{c.vertical}</Badge>}
                    {overdue && <Badge color={RED}>⚠ Needs Contact</Badge>}
                  </div>
                  <div style={{color:TEXT_D,fontSize:12,marginBottom:2}}>{c.title}{c.title&&c.agency?' · ':''}{c.agency}</div>
                  <div style={{display:'flex',gap:16,fontSize:11,color:TEXT_D,marginTop:4,flexWrap:'wrap'}}>
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    <span style={{color:overdue?RED:GREEN}}>Last contact: {c.last_contact||'Never'}{days!==null?' ('+days+' days ago)':''}</span>
                  </div>
                  {c.notes && <div style={{fontSize:12,color:TEXT_D,marginTop:6,fontStyle:'italic'}}>{c.notes}</div>}
                  {aiResults[c.id] && <div style={{marginTop:10}}><AIOut content={aiResults[c.id]} label="RELATIONSHIP BRIEF" /></div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                  <Btn small onClick={()=>logContact(c.id)}>Log Contact</Btn>
                  <Btn small variant="secondary" onClick={()=>getAiBrief(c)} disabled={aiLoading[c.id]}>{aiLoading[c.id]?'Loading...':'AI Brief'}</Btn>
                  <Btn small variant="secondary" onClick={()=>{setForm({...c});setEditId(c.id);setShowAdd(true);}}>Edit</Btn>
                  <Btn small variant="danger" onClick={()=>save(contacts.filter(x=>x.id!==c.id))}>Remove</Btn>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}