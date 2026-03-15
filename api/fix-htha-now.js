export default function handler(req, res) {
  return res.status(200).json({ message: 'Deprecated. HTHA fix applied via MCP self-heal.' });
}