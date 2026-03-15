const INTAKE_SECRET = process.env.INTAKE_SECRET;
const INTAKE_URL = 'https://hgi-capture-system.vercel.app/api/intake';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testPayload = {
    title: "TEST — Louisiana CDBG-DR Grant Management Services",
    agency: "Louisiana OCD",
    description: "Test intake verification. CDBG-DR program management and compliance monitoring services for disaster recovery grants.",
    source_url: "https://test.centralauctionhouse.com/test-march-15",
    state: "LA",
    vertical: "disaster",
    due_date: "2026-04-15"
  };

  try {
    const response = await fetch(INTAKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Intake-Secret': INTAKE_SECRET
      },
      body: JSON.stringify(testPayload)
    });

    const responseBody = await response.text();
    let parsedBody;
    
    try {
      parsedBody = JSON.parse(responseBody);
    } catch (e) {
      parsedBody = responseBody;
    }

    return res.status(200).json({
      status_code: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedBody,
      test_payload: testPayload
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Request failed',
      message: error.message,
      test_payload: testPayload
    });
  }
}