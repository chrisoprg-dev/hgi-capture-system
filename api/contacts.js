export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

const CRM_RECORD_ID = 'crm-contacts-master';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return all contacts
  if (req.method === 'GET') {
    try {
      const r = await fetch(SB + '/rest/v1/knowledge_base?id=eq.' + CRM_RECORD_ID, { headers: H });
      const data = await r.json();
      if (data && data.length > 0 && data[0].content) {
        try {
          const contacts = JSON.parse(data[0].content);
          return res.status(200).json({ contacts });
        } catch(e) {
          return res.status(200).json({ contacts: [] });
        }
      }
      return res.status(200).json({ contacts: [] });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — add a contact
  if (req.method === 'POST') {
    const contact = req.body || {};
    if (!contact.name || !contact.agency) return res.status(400).json({ error: 'name and agency required' });
    contact.id = contact.id || 'c-' + Date.now();
    contact.added = contact.added || new Date().toISOString();

    try {
      // Load existing contacts
      const r = await fetch(SB + '/rest/v1/knowledge_base?id=eq.' + CRM_RECORD_ID, { headers: H });
      const data = await r.json();
      let contacts = [];
      if (data && data.length > 0 && data[0].content) {
        try { contacts = JSON.parse(data[0].content); } catch(e) { contacts = []; }
      }

      contacts.unshift(contact);

      // Upsert the master record
      await fetch(SB + '/rest/v1/knowledge_base', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: CRM_RECORD_ID,
          title: 'CRM Contacts Master',
          doc_type: 'crm_contacts',
          vertical: 'all',
          content: JSON.stringify(contacts),
          extracted_at: new Date().toISOString()
        })
      });

      return res.status(200).json({ success: true, contact, total: contacts.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PUT — update full contacts list (bulk save)
  if (req.method === 'PUT') {
    const { contacts } = req.body || {};
    if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });

    try {
      await fetch(SB + '/rest/v1/knowledge_base', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: CRM_RECORD_ID,
          title: 'CRM Contacts Master',
          doc_type: 'crm_contacts',
          vertical: 'all',
          content: JSON.stringify(contacts),
          extracted_at: new Date().toISOString()
        })
      });

      return res.status(200).json({ success: true, total: contacts.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE — remove a contact by id
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'contact id required' });

    try {
      const r = await fetch(SB + '/rest/v1/knowledge_base?id=eq.' + CRM_RECORD_ID, { headers: H });
      const data = await r.json();
      let contacts = [];
      if (data && data.length > 0 && data[0].content) {
        try { contacts = JSON.parse(data[0].content); } catch(e) { contacts = []; }
      }

      contacts = contacts.filter(c => c.id !== id);

      await fetch(SB + '/rest/v1/knowledge_base', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: CRM_RECORD_ID,
          title: 'CRM Contacts Master',
          doc_type: 'crm_contacts',
          vertical: 'all',
          content: JSON.stringify(contacts),
          extracted_at: new Date().toISOString()
        })
      });

      return res.status(200).json({ success: true, remaining: contacts.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}