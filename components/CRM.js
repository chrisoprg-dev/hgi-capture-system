function CRM() {
  const [contacts, setContacts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    id: null,
    name: '',
    title: '',
    agency: '',
    email: '',
    phone: '',
    relationship_strength: 'Cold',
    last_contact: '',
    notes: '',
    vertical: ''
  });
  const [filterAgency, setFilterAgency] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [aiBrief, setAiBrief] = useState('');
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    const saved = store.get('crm_contacts') || [];
    setContacts(saved);
  }, []);

  const saveContacts = (newContacts) => {
    store.set('crm_contacts', newContacts);
    setContacts(newContacts);
  };

  const resetForm = () => {
    setForm({
      id: null,
      name: '',
      title: '',
      agency: '',
      email: '',
      phone: '',
      relationship_strength: 'Cold',
      last_contact: '',
      notes: '',
      vertical: ''
    });
  };

  const handleSubmit = () => {
    if (!form.name || !form.agency) return;
    
    const newContacts = form.id 
      ? contacts.map(c => c.id === form.id ? { ...form } : c)
      : [...contacts, { ...form, id: Date.now() }];
    
    saveContacts(newContacts);
    setShowAdd(false);
    resetForm();
  };

  const editContact = (contact) => {
    setForm(contact);
    setShowAdd(true);
  };

  const logContact = (contact) => {
    const notes = prompt('Contact notes:', '');
    const updated = contacts.map(c => 
      c.id === contact.id 
        ? { ...c, last_contact: new Date().toISOString().split('T')[0], notes: notes || c.notes }
        : c
    );
    saveContacts(updated);
  };

  const getRelationshipBrief = async (contact) => {
    const prompt = `Generate relationship talking points for HGI (healthcare marketing agency) with ${contact.name}, ${contact.title} at ${contact.agency}. Include: what this person likely cares about based on their role, how to approach them for healthcare marketing opportunities, and key relationship building strategies.`;
    setAiBrief('Loading...');
    setShowAI(true);
    const brief = await callClaude(prompt);
    setAiBrief(brief);
  };

  const daysSinceContact = (lastContact) => {
    if (!lastContact) return '∞';
    const days = Math.floor((new Date() - new Date(lastContact)) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getStrengthBadge = (strength) => {
    const color = strength === 'Hot' ? GREEN : strength === 'Warm' ? GOLD : TEXT_D;
    return Badge({ children: strength, style: { backgroundColor: color } });
  };

  const filteredContacts = contacts
    .filter(c => !filterAgency || c.agency.toLowerCase().includes(filterAgency.toLowerCase()))
    .filter(c => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => (a.last_contact || '1900-01-01').localeCompare(b.last_contact || '1900-01-01'));

  const agencies = [...new Set(contacts.map(c => c.agency))];

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '24px' } }, [
    
    React.createElement('div', { 
      key: 'header',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } 
    }, [
      React.createElement('h2', { 
        key: 'title',
        style: { fontSize: '24px', fontWeight: 'bold', color: TEXT, margin: 0 } 
      }, 'CRM / Relationship Intelligence'),
      
      Btn({
        key: 'add-btn',
        onClick: () => setShowAdd(!showAdd),
        children: showAdd ? 'Cancel' : 'Add Contact'
      })
    ]),

    React.createElement('div', { 
      key: 'filters',
      style: { display: 'flex', gap: '16px' } 
    }, [
      Input({
        key: 'search',
        type: 'text',
        placeholder: 'Search contacts...',
        value: searchTerm,
        onChange: e => setSearchTerm(e.target.value),
        style: { flex: 1 }
      }),
      
      React.createElement('select', {
        key: 'agency-filter',
        value: filterAgency,
        onChange: e => setFilterAgency(e.target.value),
        style: { 
          backgroundColor: BG3, 
          border: `1px solid ${BORDER}`, 
          borderRadius: '6px', 
          padding: '8px 12px', 
          color: TEXT 
        }
      }, [
        React.createElement('option', { key: 'all', value: '' }, 'All Agencies'),
        ...agencies.map(agency => 
          React.createElement('option', { key: agency, value: agency }, agency)
        )
      ])
    ]),

    showAdd && Card({
      key: 'add-form',
      children: React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, [
        
        React.createElement('div', { 
          key: 'form-grid',
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } 
        }, [
          Input({
            key: 'name',
            placeholder: 'Name',
            value: form.name,
            onChange: e => setForm({...form, name: e.target.value})
          }),
          Input({
            key: 'title',
            placeholder: 'Title',
            value: form.title,
            onChange: e => setForm({...form, title: e.target.value})
          }),
          Input({
            key: 'agency',
            placeholder: 'Agency',
            value: form.agency,
            onChange: e => setForm({...form, agency: e.target.value})
          }),
          Input({
            key: 'email',
            type: 'email',
            placeholder: 'Email',
            value: form.email,
            onChange: e => setForm({...form, email: e.target.value})
          }),
          Input({
            key: 'phone',
            type: 'tel',
            placeholder: 'Phone',
            value: form.phone,
            onChange: e => setForm({...form, phone: e.target.value})
          }),
          React.createElement('select', {
            key: 'strength',
            value: form.relationship_strength,
            onChange: e => setForm({...form, relationship_strength: e.target.value}),
            style: { 
              backgroundColor: BG3, 
              border: `1px solid ${BORDER}`, 
              borderRadius: '6px', 
              padding: '8px 12px', 
              color: TEXT 
            }
          }, [
            React.createElement('option', { value: 'Cold' }, 'Cold'),
            React.createElement('option', { value: 'Warm' }, 'Warm'),
            React.createElement('option', { value: 'Hot' }, 'Hot')
          ]),
          Input({
            key: 'last-contact',
            type: 'date',
            value: form.last_contact,
            onChange: e => setForm({...form, last_contact: e.target.value})
          }),
          Input({
            key: 'vertical',
            placeholder: 'Vertical',
            value: form.vertical,
            onChange: e => setForm({...form, vertical: e.target.value})
          })
        ]),
        
        Textarea({
          key: 'notes',
          placeholder: 'Notes',
          value: form.notes,
          onChange: e => setForm({...form, notes: e.target.value}),
          rows: 3
        }),
        
        Btn({
          key: 'submit',
          onClick: handleSubmit,
          style: { backgroundColor: GREEN },
          children: form.id ? 'Update Contact' : 'Add Contact'
        })
      ])
    }),

    showAI && Card({
      key: 'ai-brief',
      children: React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        React.createElement('div', { 
          key: 'ai-header',
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } 
        }, [
          React.createElement('h3', { 
            key: 'ai-title',
            style: { color: TEXT, margin: 0, fontSize: '16px', fontWeight: '600' } 
          }, 'AI Relationship Brief'),
          
          Btn({
            key: 'close-ai',
            onClick: () => setShowAI(false),
            style: { backgroundColor: RED, padding: '4px 8px', fontSize: '12px' },
            children: 'Close'
          })
        ]),
        
        React.createElement('div', {
          key: 'ai-content',
          style: { 
            backgroundColor: BG3, 
            padding: '12px', 
            borderRadius: '6px', 
            color: TEXT_D,
            whiteSpace: 'pre-wrap',
            fontSize: '14px',
            lineHeight: '1.5'
          }
        }, aiBrief)
      ])
    }),

    React.createElement('div', { 
      key: 'contacts',
      style: { display: 'flex', flexDirection: 'column', gap: '16px' } 
    }, 
      filteredContacts.map(contact => 
        Card({
          key: contact.id,
          children: React.createElement('div', { 
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } 
          }, [
            
            React.createElement('div', { 
              key: 'info',
              style: { flex: 1 } 
            }, [
              React.createElement('div', { 
                key: 'name-row',
                style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } 
              }, [
                React.createElement('h3', { 
                  key: 'name',
                  style: { fontSize: '18px', fontWeight: '600', color: TEXT, margin: 0 } 
                }, contact.name),
                getStrengthBadge(contact.relationship_strength)
              ]),
              
              React.createElement('p', { 
                key: 'title',
                style: { color: TEXT_D, margin: '4px 0' } 
              }, contact.title),
              
              React.createElement('p', { 
                key: 'agency',
                style: { color: TEXT_D, margin: '4px 0' } 
              }, contact.agency),
              
              React.createElement('div', { 
                key: 'contact-info',
                style: { display: 'flex', gap: '16px', fontSize: '14px', color: TEXT_D, marginTop: '8px' } 
              }, [
                React.createElement('span', { key: 'last' }, `Last contact: ${contact.last_contact || 'Never'}`),
                React.createElement('span', { key: 'days' }, `Days ago: ${daysSinceContact(contact.last_contact)}`)
              ]),
              
              contact.notes && React.createElement('p', { 
                key: 'notes',
                style: { color: TEXT_D, fontSize: '14px', marginTop: '8px' } 
              }, contact.notes)
            ]),
            
            React.createElement('div', { 
              key: 'actions',
              style: { display: 'flex', flexDirection: 'column', gap: '8px' } 
            }, [
              Btn({
                key: 'edit',
                onClick: () => editContact(contact),
                style: { backgroundColor: BLUE, padding: '6px 12px', fontSize: '14px' },
                children: 'Edit'
              }),
              Btn({
                key: 'log',
                onClick: () => logContact(contact),
                style: { backgroundColor: GREEN, padding: '6px 12px', fontSize: '14px' },
                children: 'Log Contact'
              }),
              Btn({
                key: 'ai',
                onClick: () => getRelationshipBrief(contact),
                style: { backgroundColor: '#8B5CF6', padding: '6px 12px', fontSize: '14px' },
                children: 'AI Brief'
              })
            ])
          ])
        })
      )
    )
  ]);
}