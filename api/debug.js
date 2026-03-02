// api/debug.js — temporary env var checker
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL ? "SET: " + process.env.SUPABASE_URL.slice(0,30) : "MISSING",
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? "SET (length " + process.env.SUPABASE_SERVICE_KEY.length + ")" : "MISSING",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "SET" : "MISSING",
    SAM_GOV_API_KEY: process.env.SAM_GOV_API_KEY ? "SET (length " + process.env.SAM_GOV_API_KEY.length + ")" : "MISSING",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "SET" : "MISSING",
    CRON_SECRET: process.env.CRON_SECRET ? "SET" : "MISSING",
    NODE_ENV: process.env.NODE_ENV,
  });
}