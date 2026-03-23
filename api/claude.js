export const maxDuration = 300;

import { HGI_CONTEXT, HGI_CLASSIFICATION_GUIDE } from './hgi-master-context.js';

const OPI_SCORING_PROMPT = 'You are scoring government contracting opportunities for HGI. Score each opportunity 0-100 based on how well it matches HGI capabilities.\n\nAnalyze the ENTIRE opportunity — title, description, rfp_text. Do NOT score on title alone.\n\n' + HGI_CLASSIFICATION_GUIDE + '\n\nSCORING GUIDANCE:\n- 90-95: Perfect match — HGI has direct past performance in this exact work type\n- 80-89: Strong match — HGI capabilities directly apply\n- 70-79: Good match — clear vertical alignment\n- 60-69: Moderate match — adjacent HGI capabilities\n- 30-59: Weak match — minimal HGI alignment\n- 0-29: Poor match — physical construction, IT, health, insurance brokerage, or other excluded work\n\nReturn only the numeric score (0-100).';

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