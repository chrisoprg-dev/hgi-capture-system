export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://hgi-capture-system.vercel.app/api/delete-records');
    const data = await response.json();
    
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Error calling delete-records:', error);
    return res.status(500).json({ 
      error: 'Failed to call delete-records endpoint',
      details: error.message 
    });
  }
}