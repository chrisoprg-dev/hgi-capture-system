export const maxDuration = 300;

const OPI_SCORING_PROMPT = `You are scoring government contracting opportunities for HGI (a consulting firm). Score each opportunity 0-100 based on how well it matches HGI's service verticals.

SCORING INSTRUCTIONS:
- Analyze the ENTIRE opportunity including title, description, and rfp_text content
- Do NOT just score based on title alone - read all available content
- Score based on alignment with HGI's core verticals

HIGH SCORING OPPORTUNITIES (60-95 points):
- CDBG (Community Development Block Grant) administration, compliance, monitoring
- FEMA disaster recovery, hazard mitigation, grant management
- Grant management and administration services
- Program administration and oversight
- Third Party Administrator (TPA) services
- Claims processing and administration
- Workforce development programs
- Property tax appeals and assessments
- Housing rehabilitation program management
- Environmental review services
- Compliance monitoring and reporting

MEDIUM SCORING OPPORTUNITIES (30-59 points):
- General consulting that could include HGI verticals
- Program evaluation that might involve grants/disaster recovery
- Administrative services that could encompass HGI areas

LOW SCORING OPPORTUNITIES (0-29 points):
- Construction and infrastructure projects
- Supply procurement and purchasing
- Equipment and materials acquisition
- Physical construction services
- Engineering and design services
- IT hardware/software procurement
- Vehicle and equipment purchases
- General construction management without program administration focus

SCORING GUIDANCE:
- 90-95: Perfect match for core HGI services (CDBG admin, FEMA recovery, TPA services)
- 80-89: Strong match with clear HGI vertical alignment
- 70-79: Good match with some HGI service components
- 60-69: Moderate match, could involve HGI services
- 30-59: Weak match, minimal HGI alignment
- 0-29: Poor match, primarily construction/procurement

Return only the numeric score (0-100).`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Claude API proxy error:", error);
    return res.status(500).json({ error: "Proxy error", details: error.message });
  }
}