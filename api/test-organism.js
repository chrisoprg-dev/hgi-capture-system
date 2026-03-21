export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({ status: 'disabled', reason: 'This test file was firing false HTHA win data into production stores. Disabled Session 26.' });
}