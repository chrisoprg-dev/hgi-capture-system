export const config = {
  maxDuration: 60,
};

function extractText(html) {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove common navigation and header elements
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

function extractDocumentLinks(html) {
  const links = [];
  const linkRegex = /<a[^>]+href=["']([^"']+\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx))[^"']*["'][^>]*>([^<]+)</gi;
  
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    const text = match[2].trim();
    
    // Handle relative URLs
    if (url.startsWith('/')) {
      url = 'https://www.centralauctionhouse.com' + url;
    } else if (!url.startsWith('http')) {
      url = 'https://www.centralauctionhouse.com/' + url;
    }
    
    links.push({ url, text });
  }
  
  return links;
}

function parseCookies(setCookieHeaders) {
  const cookies = [];
  if (!setCookieHeaders) return cookies;
  
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  
  headers.forEach(header => {
    const cookieParts = header.split(';')[0];
    if (cookieParts.includes('=')) {
      cookies.push(cookieParts.trim());
    }
  });
  
  return cookies;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    // Step 1: Login to Central Bidding
    const loginData = 'username=HGIGLOBAL&password=Whatever1340!';
    
    const loginResponse = await fetch('https://www.centralauctionhouse.com/login.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: loginData,
      redirect: 'manual'
    });
    
    // Extract cookies from login response
    const setCookieHeaders = loginResponse.headers.get('set-cookie') || loginResponse.headers.get('Set-Cookie');
    const cookies = parseCookies(setCookieHeaders);
    
    if (cookies.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Login failed - no cookies received'
      });
    }
    
    // Handle redirects manually if needed
    let finalResponse = loginResponse;
    let redirectCount = 0;
    const maxRedirects = 5;
    
    while ((finalResponse.status === 301 || finalResponse.status === 302 || finalResponse.status === 303 || finalResponse.status === 307 || finalResponse.status === 308) && redirectCount < maxRedirects) {
      const location = finalResponse.headers.get('location');
      if (!location) break;
      
      const redirectUrl = location.startsWith('http') ? location : `https://www.centralauctionhouse.com${location}`;
      
      finalResponse = await fetch(redirectUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        redirect: 'manual'
      });
      
      // Update cookies if new ones are set
      const newSetCookieHeaders = finalResponse.headers.get('set-cookie') || finalResponse.headers.get('Set-Cookie');
      const newCookies = parseCookies(newSetCookieHeaders);
      if (newCookies.length > 0) {
        cookies.push(...newCookies);
      }
      
      redirectCount++;
    }
    
    // Step 2: Fetch the requested bid URL with cookies
    const bidResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookies.join('; '),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!bidResponse.ok) {
      return res.status(200).json({
        success: false,
        error: `Failed to fetch bid page: ${bidResponse.status} ${bidResponse.statusText}`
      });
    }
    
    const html = await bidResponse.text();
    
    // Extract text content and document links
    const textContent = extractText(html);
    const docLinks = extractDocumentLinks(html);
    const pageSize = html.length;
    
    return res.status(200).json({
      success: true,
      textContent,
      docLinks,
      pageSize,
      url
    });
    
  } catch (error) {
    console.error('Error fetching Central Bidding page:', error);
    return res.status(200).json({
      success: false,
      error: `Error fetching page: ${error.message}`
    });
  }
}