import { TOOLS, handleTool } from './mcp-tools.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-mcp-secret');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'endpoint', endpoint: '/api/mcp' })}\n\n`);
    const interval = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => clearInterval(interval));
    return;
  }

  if (req.method === 'POST') {
    const { method, params, id } = req.body || {};

    if (method === 'initialize') {
      return res.json({ 
        jsonrpc: '2.0', 
        id, 
        result: { 
          protocolVersion: '2024-11-05', 
          capabilities: { tools: {} }, 
          serverInfo: { name: 'HGI Capture System', version: '1.0.0' } 
        } 
      });
    }

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      try {
        const result = await handleTool(name, args || {});
        return res.json({ 
          jsonrpc: '2.0', 
          id, 
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } 
        });
      } catch (e) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } });
      }
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}