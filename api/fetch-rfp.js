// api/fetch-rfp.js
// HGI Document Retrieval Engine
// Fetches RFP pages and documents from any URL, extracts text, returns structured data

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, mode = "auto" } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    // ── STEP 1: Fetch the page ──────────────────────────────────────────────
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!pageRes.ok) {
      return res.status(200).json({
        success: false,
        error: `Page returned ${pageRes.status}`,
        url,
      });
    }

    const contentType = pageRes.headers.get("content-type") || "";
    const finalUrl = pageRes.url;

    // ── STEP 2: Handle PDFs directly ────────────────────────────────────────
    if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      const buffer = await pageRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return res.status(200).json({
        success: true,
        type: "pdf",
        url: finalUrl,
        base64,
        size: buffer.byteLength,
      });
    }

    // ── STEP 3: Handle HTML pages ────────────────────────────────────────────
    const html = await pageRes.text();

    // Extract all text content from HTML
    const textContent = extractText(html);

    // Extract all document links (PDFs, DOCx, attachments)
    const docLinks = extractDocumentLinks(html, finalUrl);

    // Extract SAM.gov specific data if applicable
    const samData = finalUrl.includes("sam.gov") ? extractSamData(html, textContent) : null;

    // Extract LaPAC specific data
    const lapacData = finalUrl.includes("lapac") || finalUrl.includes("louisiana.gov") ? extractLapacData(html, textContent) : null;

    // ── STEP 4: Fetch PDF documents if found and small enough ───────────────
    const fetchedDocs = [];
    const pdfLinks = docLinks.filter(d => d.type === "pdf").slice(0, 3); // Max 3 PDFs

    for (const doc of pdfLinks) {
      try {
        const docRes = await fetch(doc.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; HGI-CaptureSystem/1.0)" },
          redirect: "follow",
        });
        if (docRes.ok) {
          const ct = docRes.headers.get("content-type") || "";
          if (ct.includes("pdf")) {
            const buf = await docRes.arrayBuffer();
            if (buf.byteLength < 15 * 1024 * 1024) { // Under 15MB
              fetchedDocs.push({
                url: doc.url,
                name: doc.name,
                type: "pdf",
                base64: Buffer.from(buf).toString("base64"),
                size: buf.byteLength,
              });
            }
          } else {
            // Try to get text content
            const txt = await docRes.text();
            fetchedDocs.push({
              url: doc.url,
              name: doc.name,
              type: "text",
              content: extractText(txt).slice(0, 50000),
            });
          }
        }
      } catch(e) {
        console.warn("Doc fetch failed:", doc.url, e.message);
      }
    }

    return res.status(200).json({
      success: true,
      type: "html",
      url: finalUrl,
      title: extractTitle(html),
      textContent: textContent.slice(0, 100000), // Cap at 100k chars
      docLinks,
      fetchedDocs,
      samData,
      lapacData,
      pageSize: html.length,
    });

  } catch (err) {
    console.error("fetch-rfp error:", err);
    return res.status(200).json({
      success: false,
      error: err.message,
      url,
    });
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

function extractDocumentLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();

  // PDF links
  const pdfRegex = /href=["']([^"']*\.pdf[^"']*)/gi;
  let m;
  while ((m = pdfRegex.exec(html)) !== null) {
    const url = resolveUrl(m[1], baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      const name = url.split("/").pop().split("?")[0] || "document.pdf";
      links.push({ url, name, type: "pdf" });
    }
  }

  // DOCX links
  const docxRegex = /href=["']([^"']*\.docx?[^"']*)/gi;
  while ((m = docxRegex.exec(html)) !== null) {
    const url = resolveUrl(m[1], baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ url, name: url.split("/").pop().split("?")[0] || "document.docx", type: "docx" });
    }
  }

  // SAM.gov attachment patterns
  const samAttachRegex = /href=["']([^"']*\/attachments?\/[^"']+)/gi;
  while ((m = samAttachRegex.exec(html)) !== null) {
    const url = resolveUrl(m[1], baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ url, name: url.split("/").pop().split("?")[0] || "attachment", type: "attachment" });
    }
  }

  // Generic download links with "solicitation", "rfp", "rfq", "bid" in the text
  const downloadRegex = /href=["']([^"']+)["'][^>]*>[^<]*(solicitation|rfp|rfq|bid\s*doc|amendment|attachment)[^<]*/gi;
  while ((m = downloadRegex.exec(html)) !== null) {
    const url = resolveUrl(m[1], baseUrl);
    if (url && !seen.has(url) && !url.includes("javascript:")) {
      seen.add(url);
      links.push({ url, name: m[2] || "document", type: "solicitation" });
    }
  }

  return links.slice(0, 20); // Cap at 20 links
}

function extractSamData(html, text) {
  const data = {};

  // Try to extract key SAM.gov fields from text
  const fields = {
    solicitationNumber: /solicitation\s*number[:\s]+([A-Z0-9\-]+)/i,
    title: /opportunity\s*title[:\s]+([^\n]+)/i,
    agency: /agency[:\s]+([^\n]+)/i,
    dueDate: /response\s*date[:\s]+([^\n]+)/i,
    naics: /naics\s*code[:\s]+(\d+)/i,
    setAside: /set[- ]aside[:\s]+([^\n]+)/i,
    value: /contract\s*value[:\s]+([^\n]+)/i,
    postedDate: /posted\s*date[:\s]+([^\n]+)/i,
  };

  for (const [key, regex] of Object.entries(fields)) {
    const m = text.match(regex);
    if (m) data[key] = m[1].trim().slice(0, 200);
  }

  return Object.keys(data).length > 0 ? data : null;
}

function extractLapacData(html, text) {
  const data = {};

  const fields = {
    bidNumber: /bid\s*(?:number|no\.?)[:\s]+([A-Z0-9\-]+)/i,
    agency: /agency[:\s]+([^\n]+)/i,
    dueDate: /due\s*date[:\s]+([^\n]+)/i,
    openDate: /open(?:ing)?\s*date[:\s]+([^\n]+)/i,
    description: /description[:\s]+([^\n]{20,200})/i,
  };

  for (const [key, regex] of Object.entries(fields)) {
    const m = text.match(regex);
    if (m) data[key] = m[1].trim().slice(0, 200);
  }

  return Object.keys(data).length > 0 ? data : null;
}

function resolveUrl(href, base) {
  if (!href) return null;
  href = href.trim();
  if (href.startsWith("javascript:") || href.startsWith("mailto:") || href === "#") return null;
  try {
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    const baseUrl = new URL(base);
    if (href.startsWith("//")) return baseUrl.protocol + href;
    if (href.startsWith("/")) return baseUrl.origin + href;
    return new URL(href, base).href;
  } catch {
    return null;
  }
}