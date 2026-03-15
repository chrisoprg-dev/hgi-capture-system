import React, { useState, useEffect } from 'react';
import { store } from '../utils/store';
import { callClaude } from '../utils/ai';

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
    const brief = await callClaude(prompt);
    alert(brief);
  };

  const daysSinceContact = (lastContact) => {
    if (!lastContact) return '∞';
    const days = Math.floor((new Date() - new Date(lastContact)) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getStrengthColor = (strength) => {
    return strength === 'Hot' ? 'bg-green-500' : 
           strength === 'Warm' ? 'bg-yellow-500' : 'bg-gray-500';
  };

  const filteredContacts = contacts
    .filter(c => !filterAgency || c.agency.toLowerCase().includes(filterAgency.toLowerCase()))
    .filter(c => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => (a.last_contact || '1900-01-01').localeCompare(b.last_contact || '1900-01-01'));

  const agencies = [...new Set(contacts.map(c => c.agency))];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">CRM / Relationship Intelligence</h2>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          {showAdd ? 'Cancel' : 'Add Contact'}
        </button>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white flex-1"
        />
        <select
          value={filterAgency}
          onChange={(e) => setFilterAgency(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
        >
          <option value="">All Agencies</option>
          {agencies.map(agency => (
            <option key={agency} value={agency}>{agency}</option>
          ))}
        </select>
      </div>

      {showAdd && (
        <div className="bg-gray-800 p-6 rounded-lg space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({...form, title: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Agency"
              value={form.agency}
              onChange={(e) => setForm({...form, agency: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({...form, email: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({...form, phone: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <select
              value={form.relationship_strength}
              onChange={(e) => setForm({...form, relationship_strength: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            >
              <option value="Cold">Cold</option>
              <option value="Warm">Warm</option>
              <option value="Hot">Hot</option>
            </select>
            <input
              type="date"
              value={form.last_contact}
              onChange={(e) => setForm({...form, last_contact: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Vertical"
              value={form.vertical}
              onChange={(e) => setForm({...form, vertical: e.target.value})}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({...form, notes: e.target.value})}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            rows="3"
          />
          <button
            onClick={handleSubmit}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            {form.id ? 'Update' : 'Add'} Contact
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {filteredContacts.map(contact => (
          <div key={contact.id} className="bg-gray-800 p-4 rounded-lg">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-white">{contact.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs text-white ${getStrengthColor(contact.relationship_strength)}`}>
                    {contact.relationship_strength}
                  </span>
                </div>
                <p className="text-gray-300">{contact.title}</p>
                <p className="text-gray-400">{contact.agency}</p>
                <div className="flex gap-4 text-sm text-gray-400 mt-2">
                  <span>Last contact: {contact.last_contact || 'Never'}</span>
                  <span>Days ago: {daysSinceContact(contact.last_contact)}</span>
                </div>
                {contact.notes && (
                  <p className="text-gray-400 text-sm mt-2">{contact.notes}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => editContact(contact)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => logContact(contact)}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                >
                  Log Contact
                </button>
                <button
                  onClick={() => getRelationshipBrief(contact)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm"
                >
                  AI Brief
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CRM;